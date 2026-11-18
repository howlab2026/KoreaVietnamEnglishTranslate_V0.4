import "dotenv/config";
import express from "express";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 3000);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const IS_VERCEL = Boolean(process.env.VERCEL);

if (!GEMINI_API_KEY) {
  console.warn("WARNING: GEMINI_API_KEY is not set.");
}

app.use(express.json());

/**
 * 한국어(ko), 영어(en), 베트남어(vi) 3개 언어 전용 고품질 자연 신경망(Neural) 음성 프리셋
 */
const NEURAL_VOICES = {
  ko: [
    { id: "ko-KR-SunHiNeural", name: "선희 (여성 · 부드럽고 자연스러운 아나운서)", gender: "Female", lang: "ko" },
    { id: "ko-KR-InJoonNeural", name: "인준 (남성 · 신뢰감 있고 부드러운 아나운서)", gender: "Male", lang: "ko" },
    { id: "ko-KR-HyunsuMultilingualNeural", name: "현수 (남성 · 생동감 있는 자연스러운 대화체)", gender: "Male", lang: "ko" }
  ],
  en: [
    { id: "en-US-JennyNeural", name: "Jenny (여성 · 가장 자연스러운 인기 AI 목소리)", gender: "Female", lang: "en" },
    { id: "en-US-GuyNeural", name: "Guy (남성 · 편안하고 자연스러운 대화체)", gender: "Male", lang: "en" },
    { id: "en-US-AriaNeural", name: "Aria (여성 · 명료하고 활기찬 뉴스/발표 톤)", gender: "Female", lang: "en" },
    { id: "en-US-ChristopherNeural", name: "Christopher (남성 · 차분하고 중후한 신뢰감 톤)", gender: "Male", lang: "en" },
    { id: "en-US-AvaNeural", name: "Ava (여성 · 세련되고 부드러운 톤)", gender: "Female", lang: "en" },
    { id: "en-US-AndrewNeural", name: "Andrew (남성 · 따뜻하고 친근한 톤)", gender: "Male", lang: "en" }
  ],
  vi: [
    { id: "vi-VN-HoaiMyNeural", name: "Hoài My (여성 · 베트남 현지 표준 아나운서 96k HD)", gender: "Female", lang: "vi" },
    { id: "vi-VN-NamMinhNeural", name: "Nam Minh (남성 · 베트남 현지 표준 아나운서 96k HD)", gender: "Male", lang: "vi" },
    { id: "gemini-vi-Aoede", name: "Thảo Tiên · Gemini AI (여성 · 초자연 원어민 대화체)", gender: "Female", lang: "vi", geminiVoice: "Aoede" },
    { id: "gemini-vi-Charon", name: "Minh Quân · Gemini AI (남성 · 중후한 원어민 표준)", gender: "Male", lang: "vi", geminiVoice: "Charon" },
    { id: "gemini-vi-Puck", name: "Hoàng Nam · Gemini AI (남성 · 생동감 있는 원어민 대화체)", gender: "Male", lang: "vi", geminiVoice: "Puck" }
  ]
};

/**
 * GET /api/voices?lang=ko|en|vi
 * 청취할 수 있는 한국어, 영어, 베트남어 전용 고품질 음성 목록 반환
 */
app.get("/api/voices", (req, res) => {
  const lang = req.query.lang;
  if (lang && NEURAL_VOICES[lang]) {
    return res.json({ voices: NEURAL_VOICES[lang] });
  }
  res.json({ voices: NEURAL_VOICES });
});

const ALLOWED_VOICE_IDS = new Set(
  Object.values(NEURAL_VOICES).flat().map((v) => v.id)
);
const TTS_MAX_TEXT_LENGTH = 600;
const TTS_CACHE_MAX_ENTRIES = 300;
const TTS_RETRY_COUNT = 2;
const TTS_RATE_LIMIT_PER_MIN = 90;

/** 같은 문장·음성 조합은 한 번만 생성하고 모든 청취자가 재사용 (LRU) */
const ttsCache = new Map();
const ttsInflight = new Map();
const ipHits = new Map();

function ttsRateLimited(ip) {
  const now = Date.now();
  const hits = (ipHits.get(ip) || []).filter((t) => now - t < 60_000);
  hits.push(now);
  ipHits.set(ip, hits);
  return hits.length > TTS_RATE_LIMIT_PER_MIN;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, hits] of ipHits) {
    if (!hits.some((t) => now - t < 60_000)) ipHits.delete(ip);
  }
}, 5 * 60_000).unref();

const ttsClients = new Map();

function escapeXmlForSsml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function getWarmTtsClient(voice) {
  let client = ttsClients.get(voice);
  if (!client) {
    client = new MsEdgeTTS({ connectionTimeoutMs: 7000, synthesisTimeoutMs: 12000 });
    await client.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    ttsClients.set(voice, client);
  }
  return client;
}

function resetTtsClient(voice) {
  const client = ttsClients.get(voice);
  if (client) {
    ttsClients.delete(voice);
    try {
      client.close();
    } catch (_) {}
  }
}

async function synthesizeOnce(text, voice, rate, pitch) {
  const safeText = escapeXmlForSsml(text);
  const tts = await getWarmTtsClient(voice);
  const { audioStream } = await tts.toStream(safeText, { rate, pitch });
  const chunks = [];
  return new Promise((resolve, reject) => {
    let finished = false;
    const timeout = setTimeout(() => {
      if (!finished) {
        finished = true;
        resetTtsClient(voice);
        reject(new Error("TTS synthesis timeout"));
      }
    }, 8000);

    audioStream.on("data", (c) => chunks.push(c));
    audioStream.on("end", () => {
      if (!finished) {
        finished = true;
        clearTimeout(timeout);
        const buf = Buffer.concat(chunks);
        if (buf.length > 0) resolve(buf);
        else {
          resetTtsClient(voice);
          reject(new Error("Empty audio stream buffer"));
        }
      }
    });
    audioStream.on("error", (err) => {
      if (!finished) {
        finished = true;
        clearTimeout(timeout);
        resetTtsClient(voice);
        reject(err);
      }
    });
  });
}

const VOICE_META_MAP = new Map(
  Object.values(NEURAL_VOICES).flat().map((v) => [v.id, v])
);

async function fetchGeminiTtsFallback(text, voice, clientKey = "") {
  const apiKey = GEMINI_API_KEY || clientKey;
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");
  const meta = VOICE_META_MAP.get(voice);
  const gender = meta?.gender || (voice.toLowerCase().includes("nam") || voice.includes("Charon") || voice.includes("Puck") ? "Male" : "Female");
  const geminiVoice = meta?.geminiVoice || (gender === "Male" ? "Charon" : "Aoede");
  const langCode = meta?.lang || (voice.includes("vi") || voice.includes("VN") ? "vi" : voice.includes("en") || voice.includes("US") ? "en" : "ko");
  const localeMap = { vi: "vi-VN", en: "en-US", ko: "ko-KR" };
  const languageCode = localeMap[langCode] || "vi-VN";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-lite-tts:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: String(text || "").slice(0, 450) }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          languageCode,
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: geminiVoice },
          },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini TTS HTTP ${res.status}`);
  const data = await res.json();
  const inline = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!inline?.data) throw new Error("Gemini TTS empty data");
  return {
    buffer: Buffer.from(inline.data, "base64"),
    contentType: inline.mimeType || "audio/wav",
    provider: `gemini-tts(${geminiVoice},${languageCode})`,
  };
}

async function fetchGoogleTtsFallback(text, voice) {
  const tl = voice.includes("vi") ? "vi" : voice.includes("en") ? "en" : "ko";
  const q = String(text || "").slice(0, 200);
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${tl}&client=tw-ob&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });
  if (!res.ok) throw new Error(`Fallback TTS HTTP ${res.status}`);
  const arr = await res.arrayBuffer();
  const buf = Buffer.from(arr);
  if (!buf.length) throw new Error("Fallback TTS empty audio");
  return { buffer: buf, contentType: "audio/mpeg", provider: "google-fallback" };
}

async function synthesizeWithRetry(text, voice, rate, pitch, clientKey = "") {
  // 사용자가 Gemini AI 초자연 원어민 음성(gemini-vi-*)을 직접 선택한 경우 즉시 Gemini Native TTS로 합성
  if (voice.startsWith("gemini-")) {
    try {
      return await fetchGeminiTtsFallback(text, voice, clientKey);
    } catch (err) {
      console.warn("Direct Gemini TTS failed, falling back to Edge Neural HD:", err?.message || err);
      const fallbackEdgeVoice = VOICE_META_MAP.get(voice)?.gender === "Male" ? "vi-VN-NamMinhNeural" : "vi-VN-HoaiMyNeural";
      voice = fallbackEdgeVoice;
    }
  }

  let lastErr;
  for (let attempt = 0; attempt <= TTS_RETRY_COUNT; attempt++) {
    try {
      const buf = await synthesizeOnce(text, voice, rate, pitch);
      return { buffer: buf, contentType: "audio/mpeg", provider: `msedge-96k(${voice})` };
    } catch (err) {
      lastErr = err;
      resetTtsClient(voice);
      await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
    }
  }
  // Edge TTS WebSocket이 차단/실패한 경우(클라우드/서버리스 등):
  // 1순위: 성별(남성/여성) 및 원어민 발음(vi-VN)이 정확히 유지되는 Gemini Neural TTS 폴백
  try {
    return await fetchGeminiTtsFallback(text, voice, clientKey);
  } catch (geminiErr) {
    console.warn("Gemini TTS fallback failed:", geminiErr?.message || geminiErr);
  }
  // 2순위: Google TTS MP3 폴백
  try {
    return await fetchGoogleTtsFallback(text, voice);
  } catch (fallbackErr) {
    console.warn("Google TTS fallback failed:", fallbackErr?.message || fallbackErr);
  }
  throw lastErr;
}

/**
 * GET /api/tts?text=...&voice=...&rate=...&pitch=...
 * 고음질 자연 신경망(Neural) MP3 생성 (검증 · 캐시 · 재시도 · 요청 제한 적용)
 */
app.get("/api/tts", async (req, res) => {
  const text = String(req.query.text || "").trim();
  let voice = String(req.query.voice || "").trim();
  let rate = String(req.query.rate || "+0%").trim();
  let pitch = String(req.query.pitch || "+0Hz").trim();
  const clientKey = String(req.query.apiKey || "").trim();

  if (!text) return res.status(400).json({ error: "Text is required" });
  if (text.length > TTS_MAX_TEXT_LENGTH) {
    return res.status(413).json({ error: `Text too long (max ${TTS_MAX_TEXT_LENGTH})` });
  }

  // 1. Voice ID 보정 및 안전 매핑 (잘못된 음성 ID로 인한 400 차단)
  if (!ALLOWED_VOICE_IDS.has(voice)) {
    if (voice.startsWith("vi") || voice.includes("VN")) {
      voice = "vi-VN-HoaiMyNeural";
    } else if (voice.startsWith("en") || voice.includes("US")) {
      voice = "en-US-JennyNeural";
    } else {
      voice = "ko-KR-SunHiNeural";
    }
  }

  // 2. 속도(rate) 포맷 정규화 (+가 공백으로 디코딩된 경우 자동 복원)
  if (!rate.startsWith("+") && !rate.startsWith("-")) {
    rate = "+" + rate;
  }
  if (!rate.endsWith("%")) {
    rate = rate + "%";
  }
  if (!/^[+-]\d{1,3}%$/.test(rate)) {
    rate = "+0%";
  }

  // 3. 음높이(pitch) 포맷 정규화 (+가 공백으로 디코딩된 경우 자동 복원)
  if (!pitch.startsWith("+") && !pitch.startsWith("-")) {
    pitch = "+" + pitch;
  }
  if (!pitch.endsWith("Hz")) {
    pitch = pitch + "Hz";
  }
  if (!/^[+-]\d{1,3}Hz$/.test(pitch)) {
    pitch = "+0Hz";
  }

  const key = `${voice}|${rate}|${pitch}|${text}`;
  let audio = ttsCache.get(key);

  if (audio) {
    // LRU 갱신
    ttsCache.delete(key);
    ttsCache.set(key, audio);
  } else {
    if (ttsRateLimited(req.ip)) {
      return res.status(429).json({ error: "Too many TTS requests" });
    }
    try {
      let pending = ttsInflight.get(key);
      if (!pending) {
        pending = synthesizeWithRetry(text, voice, rate, pitch, clientKey).finally(() => ttsInflight.delete(key));
        ttsInflight.set(key, pending);
      }
      audio = await pending;
      ttsCache.set(key, audio);
      if (ttsCache.size > TTS_CACHE_MAX_ENTRIES) {
        ttsCache.delete(ttsCache.keys().next().value);
      }
    } catch (err) {
      console.error("TTS generation error:", err?.message || err);
      return res.status(502).json({ error: "Failed to generate natural speech" });
    }
  }

  const buf = audio.buffer || audio;
  res.setHeader("Content-Type", audio.contentType || "audio/mpeg");
  res.setHeader("Content-Length", buf.length);
  res.setHeader("X-TTS-Provider", audio.provider || "unknown");
  res.setHeader("Cache-Control", "private, max-age=300");
  res.end(buf);
});

/**
 * POST /api/translate
 * 최고 수준의 베트남어·영어·한국어 문맥 기반 고정밀 AI 통역 엔드포인트
 * - 실시간 오디오 스트림(Live) 초안과 확정된 원문 전체 문맥을 결합하여
 *   Gemini 3.5 Flash Lite / Gemini 3 Flash (병렬 레이스) + Google Neural NMT 폴백으로
 *   완벽한 어순·존칭·전문용어가 반영된 번역을 생성합니다.
 */
const translateCache = new Map();
const TRANSLATE_CACHE_MAX = 200;

async function fetchGtxSingle(text, sl, tl) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl || "auto")}&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
  });
  if (!res.ok) throw new Error(`GTX HTTP ${res.status}`);
  const data = await res.json();
  return (data?.[0] || []).map((seg) => seg?.[0] || "").join("").trim();
}

async function callGeminiTranslateModel(model, prompt, apiKey, timeoutMs = 2200) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 300,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingLevel: "minimal" },
        },
      }),
    });
    if (!res.ok) throw new Error(`${model} HTTP ${res.status}`);
    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = JSON.parse(raw);
    const obj = Array.isArray(parsed) ? parsed[0] : parsed;
    const t1 = String(obj?.t1 || "").trim();
    const t2 = String(obj?.t2 || "").trim();
    if (!t1 || !t2) throw new Error(`${model} incomplete JSON`);
    return { t1, t2, provider: model };
  } finally {
    clearTimeout(timer);
  }
}

app.post("/api/translate", async (req, res) => {
  const sourceText = String(req.body?.sourceText || "").trim();
  const sourceLang = String(req.body?.sourceLang || "ko").trim();
  const target1Lang = String(req.body?.target1Lang || "vi").trim();
  const target2Lang = String(req.body?.target2Lang || "en").trim();
  const draftTarget1 = String(req.body?.draftTarget1 || "").trim();
  const draftTarget2 = String(req.body?.draftTarget2 || "").trim();
  const prevContext = String(req.body?.prevContext || "").trim();
  const clientKey = String(req.body?.apiKey || "").trim();
  const apiKey = GEMINI_API_KEY || clientKey;

  if (!sourceText && !draftTarget1 && !draftTarget2) {
    return res.status(400).json({ error: "sourceText is required" });
  }

  const cacheKey = `${sourceLang}|${target1Lang}|${target2Lang}|${sourceText}|${draftTarget1}`;
  if (translateCache.has(cacheKey)) {
    return res.json(translateCache.get(cacheKey));
  }

  const langNames = { ko: "Korean (한국어)", vi: "Vietnamese (Tiếng Việt)", en: "English (영어)" };
  const prompt = [
    "You are a world-class simultaneous interpreter specializing in Korean (ko), Vietnamese (vi), and English (en).",
    `Translate the speaker's utterance from ${langNames[sourceLang] || sourceLang} into:`,
    `- t1: ${langNames[target1Lang] || target1Lang}`,
    `- t2: ${langNames[target2Lang] || target2Lang}`,
    "Strict Quality Guidelines for Vietnamese (Tiếng Việt):",
    "1. Produce 100% natural, fluent, grammatically complete Vietnamese with accurate tones/diacritics and SVO word order.",
    "2. Use polite, respectful, and natural Vietnamese register appropriate for conferences/conversations (e.g., 'Xin chào', 'tôi / chúng tôi', 'bạn / quý vị', natural connectors). Never output broken, literal word-by-word translations or unfinished clauses.",
    "3. If the Korean source has SOV structure (verb at the end), reconstruct the full sentence naturally in Vietnamese and English without omitting the final verb or meaning.",
    prevContext ? `Previous sentence context: "${prevContext}"` : "",
    sourceText ? `Speaker Utterance (${sourceLang}): "${sourceText}"` : "",
    draftTarget1 ? `Live Audio Draft (${target1Lang}, for context/disambiguation only): "${draftTarget1}"` : "",
    draftTarget2 ? `Live Audio Draft (${target2Lang}, for context/disambiguation only): "${draftTarget2}"` : "",
    'Return ONLY a JSON object with keys "t1" and "t2": {"t1": "...", "t2": "..."}',
  ].filter(Boolean).join("\n");

  const runGtxFallback = async () => {
    if (!sourceText) throw new Error("No sourceText for GTX");
    const [t1, t2] = await Promise.all([
      fetchGtxSingle(sourceText, sourceLang, target1Lang),
      fetchGtxSingle(sourceText, sourceLang, target2Lang),
    ]);
    return { t1, t2, provider: "gtx-neural" };
  };

  try {
    let result;
    if (apiKey) {
      try {
        result = await Promise.any([
          callGeminiTranslateModel("gemini-3.5-flash-lite", prompt, apiKey, 2400),
          callGeminiTranslateModel("gemini-3-flash-preview", prompt, apiKey, 2400),
        ]);
      } catch (_) {
        result = await runGtxFallback();
      }
    } else {
      result = await runGtxFallback();
    }

    translateCache.set(cacheKey, result);
    if (translateCache.size > TRANSLATE_CACHE_MAX) {
      translateCache.delete(translateCache.keys().next().value);
    }
    return res.json(result);
  } catch (err) {
    console.warn("Translate API fallback:", err?.message || err);
    return res.json({
      t1: draftTarget1 || "",
      t2: draftTarget2 || "",
      provider: "live-draft",
    });
  }
});

/**
 * WebSocket Server for Real-time Listener Broadcast
 * Relays translation events from the speaker client to all listener clients.
 * - 하트비트로 끊어진 연결 정리
 * - 마지막 sentence_commit을 보관했다가 늦게 접속한 청취자에게 재전송(replay)
 */
/**
 * 화자(Speaker) 인증
 * - SPEAKER_TOKEN 설정 시: 토큰이 일치하는 클라이언트만 화자 권한
 * - 미설정 시: 동일 출처(Origin) 접속 허용 (로컬 및 Vercel 클라우드 배포 환경 모두 지원)
 */
/**
 * 화자(Speaker) 및 사용자 보안 인증 (인증번호 2026 기반)
 */
const AUTH_PIN = process.env.AUTH_PIN || "2026";
const SPEAKER_TOKEN = process.env.SPEAKER_TOKEN || "";
const GEMINI_WS_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent";

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host;
    const reqHost = req.headers["x-forwarded-host"] || req.headers.host;
    return originHost === reqHost;
  } catch {
    return true;
  }
}

function isSpeakerAuthorized(req, tokenOrPin) {
  const val = String(tokenOrPin || "").trim();
  // 1. 인증번호 2026 통과
  if (val === AUTH_PIN) return true;
  // 2. SPEAKER_TOKEN 통과
  if (SPEAKER_TOKEN && safeEqual(val, SPEAKER_TOKEN)) return true;
  // 3. 보안 인증번호(AUTH_PIN) 및 SPEAKER_TOKEN이 모두 비활성화된 경우에만 로컬호스트 허용
  if (!AUTH_PIN && !SPEAKER_TOKEN) {
    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "");
    if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
      return true;
    }
  }
  return false;
}

/**
 * POST /api/auth
 * 인증번호 2026 검증 엔드포인트
 */
app.post("/api/auth", (req, res) => {
  const pin = String(req.body?.pin || req.query.pin || "").trim();
  if (pin === AUTH_PIN || (SPEAKER_TOKEN && safeEqual(pin, SPEAKER_TOKEN))) {
    return res.json({ ok: true, pin: AUTH_PIN });
  }
  return res.status(401).json({ ok: false, error: "인증번호가 올바르지 않습니다 (2026을 입력하세요)." });
});

/** 화자 화면이 토큰 입력이 필요한지 / 현재 접속이 허용되는지 안내 */
app.get("/api/speaker-status", (req, res) => {
  const token = String(req.query.pin || req.query.token || req.headers["x-auth-pin"] || req.headers["x-speaker-token"] || "");
  const authed = isSpeakerAuthorized(req, token);
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "");
  const isRemote = !host.startsWith("localhost") && !host.startsWith("127.0.0.1");
  res.json({
    tokenRequired: true,
    allowed: authed,
    geminiConfigured: Boolean(GEMINI_API_KEY),
    serverless: IS_VERCEL || isRemote,
  });
});

/**
 * GET /api/key
 * Vercel 등 서버리스 환경 및 브라우저 직접 연결을 위한 API 키 엔드포인트
 */
app.get("/api/key", (req, res) => {
  const token = String(req.query.pin || req.query.token || req.headers["x-auth-pin"] || req.headers["x-speaker-token"] || "");
  if (!isSpeakerAuthorized(req, token)) {
    return res.status(401).json({ error: "보안 인증번호(2026)가 올바르지 않습니다." });
  }
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY가 설정되어 있지 않습니다. (.env 또는 Vercel 환경변수를 확인하세요)" });
  }
  res.json({ key: GEMINI_API_KEY });
});

let lastCommitPayload = null;
let latestSessionStatus = null;
let broadcastSeq = 0;
const recentBroadcastEvents = [];

/**
 * HTTP 기반 청취자 브로드캐스트 릴레이 (Vercel 서버리스 환경 호환용)
 */
app.post("/api/broadcast", (req, res) => {
  const token = String(req.query.token || req.headers["x-speaker-token"] || "");
  if (!isSpeakerAuthorized(req, token)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const event = req.body;
  if (!event || typeof event !== "object") {
    return res.status(400).json({ error: "Invalid event payload" });
  }
  broadcastSeq += 1;
  if (event.type === "sentence_commit") lastCommitPayload = event;
  else if (event.type === "clear") {
    lastCommitPayload = null;
    recentBroadcastEvents.length = 0;
  } else if (event.type === "session_status") {
    latestSessionStatus = event;
  }
  recentBroadcastEvents.push({ seq: broadcastSeq, ts: Date.now(), event });
  if (recentBroadcastEvents.length > 60) recentBroadcastEvents.shift();
  res.json({ ok: true, seq: broadcastSeq });
});

app.get("/api/broadcast", (req, res) => {
  const since = Number(req.query.since || 0);
  const events = since > 0
    ? recentBroadcastEvents.filter((item) => item.seq > since).map((item) => item.event)
    : [];
  res.json({
    seq: broadcastSeq,
    events,
    lastCommit: since === 0 ? lastCommitPayload : undefined,
    sessionStatus: since === 0 ? latestSessionStatus : undefined,
  });
});

app.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

app.use(express.static(path.join(__dirname, "public"), { etag: false, maxAge: 0 }));

// Listener view alias
app.get("/listener", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "listener.html"));
});

app.get("*splat", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

if (!IS_VERCEL) {
  const server = http.createServer(app);
  const broadcastWss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
  const geminiWss = new WebSocketServer({ noServer: true, maxPayload: 2 * 1024 * 1024 });

  function rejectUpgrade(socket, status, text) {
    socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
  }

  function safeClose(ws, code, reason) {
    const valid =
      (code >= 1000 && code <= 1003) || (code >= 1007 && code <= 1014) || (code >= 3000 && code <= 4999);
    try {
      ws.close(valid ? code : 1011, String(reason || "").slice(0, 100));
    } catch (_) {}
  }

  server.on("upgrade", (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url, "http://localhost");
    } catch {
      return socket.destroy();
    }
    const token = url.searchParams.get("token");

    if (url.pathname === "/ws/broadcast") {
      const wantsSpeaker = url.searchParams.get("role") === "speaker";
      const isSpeaker = wantsSpeaker && isSpeakerAuthorized(req, token);
      if (wantsSpeaker && !isSpeaker) return rejectUpgrade(socket, 401, "Unauthorized");
      return broadcastWss.handleUpgrade(req, socket, head, (ws) => {
        ws.isSpeaker = isSpeaker;
        broadcastWss.emit("connection", ws, req);
      });
    }

    if (url.pathname === "/ws/gemini") {
      if (!isSpeakerAuthorized(req, token)) return rejectUpgrade(socket, 401, "Unauthorized");
      return geminiWss.handleUpgrade(req, socket, head, (ws) => geminiWss.emit("connection", ws, req));
    }

    socket.destroy();
  });

  /** 화자 → 서버 → 청취자 방송. 청취자 연결은 수신 전용(보낸 메시지는 무시) */
  broadcastWss.on("connection", (ws) => {
    ws.isAlive = true;
    ws.on("pong", () => { ws.isAlive = true; });

    if (!ws.isSpeaker && lastCommitPayload) {
      try {
        ws.send(JSON.stringify({ ...lastCommitPayload, replay: true }));
      } catch (_) {}
    }

    ws.on("message", (data, isBinary) => {
      if (isBinary) return;
      let parsed;
      try {
        parsed = JSON.parse(data.toString());
      } catch (_) {
        return;
      }

      // 청취자(Listener)가 보낸 TTS 재생 상태(tts_status)는 화자(Speaker)에게 전달하여 하울링 방지
      if (!ws.isSpeaker) {
        if (parsed?.type === "tts_status") {
          broadcastWss.clients.forEach((client) => {
            if (client !== ws && client.isSpeaker && client.readyState === WebSocket.OPEN) {
              client.send(data, { binary: false });
            }
          });
        }
        return;
      }

      if (parsed?.type === "sentence_commit") lastCommitPayload = parsed;
      else if (parsed?.type === "clear") lastCommitPayload = null;

      broadcastWss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(data, { binary: false });
        }
      });
    });
  });

  /**
   * Gemini Live 프록시: 브라우저 ↔ 서버 ↔ Gemini (로컬 서버 전용)
   */
  geminiWss.on("connection", (client) => {
    if (!GEMINI_API_KEY) return safeClose(client, 1011, "GEMINI_API_KEY is not configured");

    client.isAlive = true;
    client.on("pong", () => { client.isAlive = true; });

    const upstream = new WebSocket(`${GEMINI_WS_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`);
    const pending = [];

    client.on("message", (data, isBinary) => {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: isBinary });
      else if (upstream.readyState === WebSocket.CONNECTING) pending.push([data, isBinary]);
    });
    upstream.on("open", () => {
      for (const [d, b] of pending) upstream.send(d, { binary: b });
      pending.length = 0;
    });
    upstream.on("message", (data, isBinary) => {
      if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
    });
    upstream.on("close", (code, reason) => safeClose(client, code, reason.toString()));
    upstream.on("error", (err) => {
      console.error("Gemini upstream error:", err.message);
      safeClose(client, 1011, "Gemini upstream error");
    });
    client.on("close", () => { try { upstream.close(); } catch (_) {} });
    client.on("error", () => { try { upstream.terminate(); } catch (_) {} });
  });

  const heartbeat = setInterval(() => {
    for (const wss of [broadcastWss, geminiWss]) {
      wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        try { ws.ping(); } catch (_) {}
      });
    }
  }, 30_000);
  heartbeat.unref();

  server.listen(port, () => {
    console.log(`K-V Live Caption & Listener: http://localhost:${port}`);
    console.log(`Listener Page: http://localhost:${port}/listener.html`);
  });
}

export default app;

