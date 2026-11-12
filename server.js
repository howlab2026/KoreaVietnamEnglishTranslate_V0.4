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
    { id: "vi-VN-HoaiMyNeural", name: "Hoài My (여성 · 성조와 억양이 완벽한 초자연 음성)", gender: "Female", lang: "vi" },
    { id: "vi-VN-NamMinhNeural", name: "Nam Minh (남성 · 명확하고 부드러운 표준 성조 음성)", gender: "Male", lang: "vi" }
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

async function synthesizeOnce(text, voice, rate, pitch) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = await tts.toStream(text, { rate, pitch });
  const chunks = [];
  await new Promise((resolve, reject) => {
    audioStream.on("data", (c) => chunks.push(c));
    audioStream.on("end", resolve);
    audioStream.on("close", resolve);
    audioStream.on("error", reject);
  });
  const buf = Buffer.concat(chunks);
  if (!buf.length) throw new Error("Empty audio");
  return buf;
}

async function synthesizeWithRetry(text, voice, rate, pitch) {
  let lastErr;
  for (let attempt = 0; attempt <= TTS_RETRY_COUNT; attempt++) {
    try {
      return await synthesizeOnce(text, voice, rate, pitch);
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw lastErr;
}

/**
 * GET /api/tts?text=...&voice=...&rate=...&pitch=...
 * 고음질 자연 신경망(Neural) MP3 생성 (검증 · 캐시 · 재시도 · 요청 제한 적용)
 */
app.get("/api/tts", async (req, res) => {
  const text = String(req.query.text || "").trim();
  const voice = String(req.query.voice || "ko-KR-SunHiNeural");
  const rate = String(req.query.rate || "+0%");
  const pitch = String(req.query.pitch || "+0Hz");

  if (!text) return res.status(400).json({ error: "Text is required" });
  if (text.length > TTS_MAX_TEXT_LENGTH) {
    return res.status(413).json({ error: `Text too long (max ${TTS_MAX_TEXT_LENGTH})` });
  }
  if (!ALLOWED_VOICE_IDS.has(voice)) {
    return res.status(400).json({ error: "Unsupported voice" });
  }
  if (!/^[+-]\d{1,3}%$/.test(rate) || !/^[+-]\d{1,3}Hz$/.test(pitch)) {
    return res.status(400).json({ error: "Invalid rate or pitch" });
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
        pending = synthesizeWithRetry(text, voice, rate, pitch).finally(() => ttsInflight.delete(key));
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

  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Content-Length", audio.length);
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.end(audio);
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
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function isSpeakerAuthorized(req, token) {
  if (!sameOrigin(req)) return false;
  if (SPEAKER_TOKEN) return typeof token === "string" && safeEqual(token, SPEAKER_TOKEN);
  return true;
}

/** 화자 화면이 토큰 입력이 필요한지 / 현재 접속이 허용되는지 안내 (비밀 값은 반환하지 않음) */
app.get("/api/speaker-status", (_req, res) => {
  res.json({
    tokenRequired: Boolean(SPEAKER_TOKEN),
    allowed: true,
    geminiConfigured: Boolean(GEMINI_API_KEY),
    serverless: IS_VERCEL,
  });
});

/**
 * GET /api/key
 * Vercel 등 서버리스 환경(WebSocket 프록시 미지원) 및 브라우저 직접 연결을 위한 API 키 엔드포인트
 */
app.get("/api/key", (req, res) => {
  const token = String(req.query.token || req.headers["x-speaker-token"] || "");
  if (!isSpeakerAuthorized(req, token)) {
    return res.status(401).json({ error: "화자 인증 토큰(SPEAKER_TOKEN)이 올바르지 않습니다." });
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

