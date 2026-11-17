/**
 * Unified 3-Way Multilingual Live Translation & Neural TTS Service (v4.0)
 * - 2-Button Control: [1. 번역 시작] (세션 준비) + [2. 문장 번역] (한 문장씩 수동 시작 -> 번역 & TTS -> 대기)
 * - Unified Screen: 실시간 번역 화면 + 고음질 AI 신경망 TTS 화면 통합
 * - Sentence Display: 현문장과 바로 직전의 한 문장만 표시 (총 2문장 화면 유지)
 * - Screen Optimization: 화면 최적화 버튼 클릭 시 발화언어선택/AI음성/마이크설정 숨김 및 2부분/3부분 집중 화면
 */

const MODEL = "models/gemini-3.5-live-translate-preview";
const WS_ENDPOINT_BASE =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent";
const MAX_PREV_SENTENCES = 1; // 바로 직전의 한 문장만 유지 (현문장 1개와 함께 총 2개 문장이 화면에 표시됨)
const MAX_VISIBLE_SOURCE_SENTENCES = 2; // 한국어 원문 화면에 표시되는 최대 문장 수 (직전 1문장 + 현문장 = 총 2개)

const LANG_CONFIGS = {
  ko: {
    code: "ko",
    name: "한국어",
    flag: "🇰🇷",
    title: "🇰🇷 한국어 → 🇻🇳 베트남어 · 🇺🇸 영어",
    sourceLabel: "🇰🇷 한국어 원문 (발화)",
    sourcePlaceholder: "[1. 번역 시작]을 누른 뒤 [2. 문장 번역] 버튼을 눌러 한국어로 한 문장씩 말씀하세요.",
    target1: {
      code: "vi",
      name: "베트남어",
      flag: "🇻🇳",
      label: "🇻🇳 TIẾNG VIỆT (베트남어 번역)",
      placeholder: "베트남어 번역 현시점 문장이 여기에 표시됩니다.",
      instruction:
        "Bạn là thông dịch viên. Hãy dịch lời nói sang tiếng Việt một cách tự nhiên và chính xác. Bắt buộc chỉ xuất bản dịch bằng tiếng Việt (Vietnamese).",
    },
    target2: {
      code: "en",
      name: "영어",
      flag: "🇺🇸",
      label: "🇺🇸 ENGLISH (영어 번역)",
      placeholder: "영어 번역 현시점 문장이 여기에 표시됩니다.",
      instruction:
        "You are an interpreter. Translate spoken audio accurately into natural English. You must only output in English.",
    },
  },
  en: {
    code: "en",
    name: "English",
    flag: "🇺🇸",
    title: "🇺🇸 English → 🇻🇳 베트남어 · 🇰🇷 한국어",
    sourceLabel: "🇺🇸 English Original (Speech)",
    sourcePlaceholder: "Click [1. 번역 시작], then press [2. 문장 번역] to speak one sentence in English.",
    target1: {
      code: "vi",
      name: "베트남어",
      flag: "🇻🇳",
      label: "🇻🇳 TIẾNG VIỆT (베트남어 번역)",
      placeholder: "베트남어 번역 현시점 문장이 여기에 표시됩니다.",
      instruction:
        "Bạn là thông dịch viên. Hãy dịch lời nói sang tiếng Việt một cách tự nhiên và chính xác. Bắt buộc chỉ xuất bản dịch bằng tiếng Việt (Vietnamese).",
    },
    target2: {
      code: "ko",
      name: "한국어",
      flag: "🇰🇷",
      label: "🇰🇷 한국어 (Korean 번역)",
      placeholder: "한국어 번역 현시점 문장이 여기에 표시됩니다.",
      instruction:
        "당신은 전문 통역사입니다. 들리는 음성을 자연스럽고 정확한 한국어로 번역하세요. 반드시 한국어로만 출력해야 합니다.",
    },
  },
  vi: {
    code: "vi",
    name: "Tiếng Việt",
    flag: "🇻🇳",
    title: "🇻🇳 Tiếng Việt → 🇺🇸 영어 · 🇰🇷 한국어",
    sourceLabel: "🇻🇳 Tiếng Việt Nguyên bản (Phát biểu)",
    sourcePlaceholder: "Nhấn [1. 번역 시작], sau đó nhấn [2. 문장 번역] để nói từng câu bằng tiếng Việt.",
    target1: {
      code: "en",
      name: "영어",
      flag: "🇺🇸",
      label: "🇺🇸 ENGLISH (영어 번역)",
      placeholder: "영어 번역 현시점 문장이 여기에 표시됩니다.",
      instruction:
        "You are an interpreter. Translate spoken audio accurately into natural English. You must only output in English.",
    },
    target2: {
      code: "ko",
      name: "한국어",
      flag: "🇰🇷",
      label: "🇰🇷 한국어 (Korean 번역)",
      placeholder: "한국어 번역 현시점 문장이 여기에 표시됩니다.",
      instruction:
        "당신은 전문 통역사입니다. 들리는 음성을 자연스럽고 정확한 한국어로 번역하세요. 반드시 한국어로만 출력해야 합니다.",
    },
  },
};

const DEFAULT_NEURAL_VOICES = {
  ko: [
    { id: "ko-KR-SunHiNeural", name: "선희 (여성 · 부드럽고 자연스러운 아나운서)", gender: "Female", lang: "ko" },
    { id: "ko-KR-InJoonNeural", name: "인준 (남성 · 신뢰감 있고 부드러운 아나운서)", gender: "Male", lang: "ko" },
    { id: "ko-KR-HyunsuMultilingualNeural", name: "현수 (남성 · 생동감 있는 자연스러운 대화체)", gender: "Male", lang: "ko" },
  ],
  en: [
    { id: "en-US-JennyNeural", name: "Jenny (여성 · 가장 자연스러운 인기 AI 목소리)", gender: "Female", lang: "en" },
    { id: "en-US-GuyNeural", name: "Guy (남성 · 편안하고 자연스러운 대화체)", gender: "Male", lang: "en" },
    { id: "en-US-AriaNeural", name: "Aria (여성 · 명료하고 활기찬 뉴스/발표 톤)", gender: "Female", lang: "en" },
    { id: "en-US-ChristopherNeural", name: "Christopher (남성 · 차분하고 중후한 신뢰감 톤)", gender: "Male", lang: "en" },
    { id: "en-US-AvaNeural", name: "Ava (여성 · 세련되고 부드러운 톤)", gender: "Female", lang: "en" },
    { id: "en-US-AndrewNeural", name: "Andrew (남성 · 따뜻하고 친근한 톤)", gender: "Male", lang: "en" },
  ],
  vi: [
    { id: "vi-VN-HoaiMyNeural", name: "Hoài My (여성 · 성조와 억양이 완벽한 초자연 음성)", gender: "Female", lang: "vi" },
    { id: "vi-VN-NamMinhNeural", name: "Nam Minh (남성 · 명확하고 부드러운 표준 성조 음성)", gender: "Male", lang: "vi" },
  ],
};

const SAMPLE_SENTENCES = {
  ko: "안녕하세요! 선택하신 한국어 실시간 인공지능 통역 목소리입니다.",
  en: "Hello! This is your selected English ultra-realistic live translation voice.",
  vi: "Xin chào! Đây là giọng đọc dịch trực tiếp tiếng Việt siêu tự nhiên của bạn.",
};

const $ = (id) => document.getElementById(id);

/* ─── Security PIN 2026 Authentication ─── */
const AUTH_PIN_REQUIRED = "2026";
let authPin = "";
try {
  authPin = sessionStorage.getItem("kv_auth_pin") || localStorage.getItem("kv_auth_pin") || "";
} catch (_) {}

const authOverlay = $("authOverlay");
const authForm = $("authForm");
const authPinInput = $("authPinInput");
const authErrorMsg = $("authErrorMsg");
const authSubmitBtn = $("authSubmitBtn");

function isUserAuthenticated() {
  return authPin === AUTH_PIN_REQUIRED;
}

function showAuthOverlay() {
  if (authOverlay) {
    authOverlay.classList.remove("hidden");
    authOverlay.style.display = "flex";
  }
  if (authPinInput) {
    authPinInput.value = "";
    setTimeout(() => authPinInput.focus(), 100);
  }
}

function hideAuthOverlay() {
  if (authOverlay) {
    authOverlay.classList.add("hidden");
    authOverlay.style.display = "none";
  }
}

async function handleAuthSubmit(e) {
  if (e) e.preventDefault();
  const inputPin = (authPinInput?.value || "").trim();
  if (inputPin === AUTH_PIN_REQUIRED) {
    authPin = AUTH_PIN_REQUIRED;
    try {
      sessionStorage.setItem("kv_auth_pin", authPin);
      localStorage.setItem("kv_auth_pin", authPin);
    } catch (_) {}
    if (authErrorMsg) authErrorMsg.classList.add("hidden");
    hideAuthOverlay();
  } else {
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: inputPin }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        authPin = data.pin || AUTH_PIN_REQUIRED;
        try {
          sessionStorage.setItem("kv_auth_pin", authPin);
          localStorage.setItem("kv_auth_pin", authPin);
        } catch (_) {}
        if (authErrorMsg) authErrorMsg.classList.add("hidden");
        hideAuthOverlay();
        return;
      }
    } catch (_) {}

    if (authErrorMsg) {
      authErrorMsg.classList.remove("hidden");
      authErrorMsg.textContent = "⚠️ 인증번호(2026)가 올바르지 않습니다. 다시 입력해주세요.";
    }
    if (authPinInput) {
      authPinInput.classList.add("shake");
      setTimeout(() => authPinInput.classList.remove("shake"), 500);
      authPinInput.value = "";
      authPinInput.focus();
    }
  }
}

authForm?.addEventListener("submit", handleAuthSubmit);
authSubmitBtn?.addEventListener("click", handleAuthSubmit);

// Header & Modal Elements
const mainTitle = $("mainTitle");
const statusEl = $("status");
const themeToggleBtn = $("themeToggleBtn");
const themeIcon = $("themeIcon");
const themeLabel = $("themeLabel");
const historyModalBtn = $("historyModalBtn");
const historyModal = $("historyModal");
const closeHistoryModalBtn = $("closeHistoryModalBtn");
const clearHistoryBtn = $("clearHistoryBtn");
const timerBadge = $("timerBadge");
const timerEl = $("timer");
const historyList = $("historyList");

// 2-Button Translation Controls
const startBtn = $("startBtn");
const sentenceTranslateBtn = $("sentenceTranslateBtn");
const stopBtn = $("stopBtn");
const clearBtn = $("clearBtn");
const optimizeScreenBtn = $("optimizeScreenBtn");
const translationOnlyBtn = $("translationOnlyBtn");
const preset2PartBtn = $("preset2PartBtn");
const preset3PartBtn = $("preset3PartBtn");
const fullscreenBtn = $("fullscreenBtn");
const fontSizeEl = $("fontSize");
const micSelect = $("micSelect");
const micRefreshBtn = $("micRefreshBtn");
const micMeterBar = $("micMeterBar");

// Panel Elements (Current Sentence + Previous 5 Sentences)
const sourceLabel = $("sourceLabel");
const target1Label = $("target1Label");
const target2Label = $("target2Label");

const sourceCurrentText = $("sourceCurrentText");
const sourceListeningPrompt = $("sourceListeningPrompt");
const target1CurrentText = $("target1CurrentText");
const target2CurrentText = $("target2CurrentText");

const sourcePrevList = $("sourcePrevList");
const target1PrevList = $("target1PrevList");
const target2PrevList = $("target2PrevList");

const sourcePrevCount = $("sourcePrevCount");
const target1PrevCount = $("target1PrevCount");
const target2PrevCount = $("target2PrevCount");

const target1TtsActiveBadge = $("target1TtsActiveBadge");
const target2TtsActiveBadge = $("target2TtsActiveBadge");
const speakTarget1Btn = $("speakTarget1Btn");
const speakTarget2Btn = $("speakTarget2Btn");

// Panel Visibility Toggle Buttons
const toggleSourceBtn = $("toggleSourceBtn");
const toggleTarget1Btn = $("toggleTarget1Btn");
const toggleTarget2Btn = $("toggleTarget2Btn");
const toggleSourceText = $("toggleSourceText");
const toggleTarget1Text = $("toggleTarget1Text");
const toggleTarget2Text = $("toggleTarget2Text");

// Integrated TTS Elements
const autoTtsToggle = $("autoTtsToggle");
const ttsModeT1Btn = $("ttsModeT1Btn");
const ttsModeT2Btn = $("ttsModeT2Btn");
const ttsModeBothBtn = $("ttsModeBothBtn");
const ttsSpeakingIndicator = $("ttsSpeakingIndicator");
const ttsStatusLabel = $("ttsStatusLabel");
const voiceSelect1 = $("voiceSelect1");
const voiceSelect2 = $("voiceSelect2");
const voiceLabel1 = $("voiceLabel1");
const voiceLabel2 = $("voiceLabel2");
const voiceSelect = $("voiceSelect") || voiceSelect1;
const ttsRate = $("ttsRate");
const ttsPitch = $("ttsPitch");
const ttsVolume = $("ttsVolume");
const rateValue = $("rateValue");
const pitchValue = $("pitchValue");
const volumeValue = $("volumeValue");
const testVoiceBtn = $("testVoiceBtn");
const replayCurrentTtsBtn = $("replayCurrentTtsBtn");
const stopTtsBtn = $("stopTtsBtn");
const currentTtsText = $("currentTtsText");

const langBtns = {
  ko: $("langKoBtn"),
  en: $("langEnBtn"),
  vi: $("langViBtn"),
};

/* ─── Panel Visibility State ─── */
const panelVisibility = {
  source: true,
  target1: true,
  target2: true,
};

try {
  const savedSource = localStorage.getItem("kv_panel_source");
  const savedTarget1 = localStorage.getItem("kv_panel_target1");
  const savedTarget2 = localStorage.getItem("kv_panel_target2");
  if (savedSource !== null) panelVisibility.source = savedSource === "true";
  if (savedTarget1 !== null) panelVisibility.target1 = savedTarget1 === "true";
  if (savedTarget2 !== null) panelVisibility.target2 = savedTarget2 === "true";
  if (!panelVisibility.source && !panelVisibility.target1 && !panelVisibility.target2) {
    panelVisibility.source = true;
    panelVisibility.target1 = true;
    panelVisibility.target2 = true;
  }
} catch (_) {}

function updateToggleButtonState(btn, isVisible) {
  if (!btn) return;
  btn.classList.toggle("active", isVisible);
  btn.classList.toggle("inactive", !isVisible);
  btn.setAttribute("aria-pressed", String(isVisible));
  const icon = btn.querySelector(".toggle-icon");
  if (icon) icon.textContent = isVisible ? "👁️" : "🙈";
}

function updatePanelVisibility() {
  const panelsEl = document.querySelector(".panels");
  if (!panelsEl) return;

  $("sourcePanel")?.classList.toggle("is-hidden", !panelVisibility.source);
  $("target1Panel")?.classList.toggle("is-hidden", !panelVisibility.target1);
  $("target2Panel")?.classList.toggle("is-hidden", !panelVisibility.target2);

  panelsEl.classList.toggle("hide-source", !panelVisibility.source);
  panelsEl.classList.toggle("hide-target-1", !panelVisibility.target1);
  panelsEl.classList.toggle("hide-target-2", !panelVisibility.target2);

  updateToggleButtonState(toggleSourceBtn, panelVisibility.source);
  updateToggleButtonState(toggleTarget1Btn, panelVisibility.target1);
  updateToggleButtonState(toggleTarget2Btn, panelVisibility.target2);

  // 특정한 버튼: 번역문장만 보기 전용 버튼 상태 동기화
  const isTranslationOnly = !panelVisibility.source && (panelVisibility.target1 || panelVisibility.target2);
  if (translationOnlyBtn) {
    translationOnlyBtn.classList.toggle("active", isTranslationOnly);
    if (isTranslationOnly) {
      translationOnlyBtn.innerHTML = "👁️ 전체 창 보기 (원문 복원)";
      translationOnlyBtn.title = "원문 창을 다시 표시하여 원문과 번역문장을 모두 봅니다";
    } else {
      translationOnlyBtn.innerHTML = "🌐 번역문장만 보기";
      translationOnlyBtn.title = "원문 창을 숨기고 번역문장 창만 화면 가득 표시합니다";
    }
  }

  // 2분할(원문+번역1개) / 3분할(원문+번역1+번역2) 프리셋 버튼 상태 동기화
  const is2Part = panelVisibility.source && ((panelVisibility.target1 && !panelVisibility.target2) || (!panelVisibility.target1 && panelVisibility.target2));
  const is3Part = panelVisibility.source && panelVisibility.target1 && panelVisibility.target2;

  if (preset2PartBtn) {
    preset2PartBtn.classList.toggle("active", is2Part);
    if (panelVisibility.target1 && !panelVisibility.target2) {
      preset2PartBtn.textContent = "2분할 (번역1)";
    } else if (!panelVisibility.target1 && panelVisibility.target2) {
      preset2PartBtn.textContent = "2분할 (번역2)";
    } else {
      preset2PartBtn.textContent = "2분할";
    }
  }
  if (preset3PartBtn) {
    preset3PartBtn.classList.toggle("active", is3Part);
  }

  try {
    localStorage.setItem("kv_panel_source", String(panelVisibility.source));
    localStorage.setItem("kv_panel_target1", String(panelVisibility.target1));
    localStorage.setItem("kv_panel_target2", String(panelVisibility.target2));
  } catch (_) {}
}

let isScreenOptimized = false;
try {
  isScreenOptimized = localStorage.getItem("kv_screen_optimized") === "true";
} catch (_) {}

function applyScreenOptimization() {
  document.body.classList.toggle("screen-optimized", isScreenOptimized);
  if (optimizeScreenBtn) {
    optimizeScreenBtn.classList.toggle("active", isScreenOptimized);
    if (isScreenOptimized) {
      optimizeScreenBtn.innerHTML = "↩️ 상단 메뉴 복원";
      optimizeScreenBtn.title = "상단 헤더, 발화언어선택, AI음성, 마이크설정 등을 다시 표시합니다";
    } else {
      optimizeScreenBtn.innerHTML = "🖥️ 화면 최적화 (상단 숨김)";
      optimizeScreenBtn.title = "화면 최적화: 상단 헤더, 발화언어선택, AI음성, 마이크설정 등을 숨기고 원문/번역창만 크게 표시합니다";
    }
  }
}

function toggleScreenOptimization() {
  isScreenOptimized = !isScreenOptimized;
  try {
    localStorage.setItem("kv_screen_optimized", String(isScreenOptimized));
  } catch (_) {}
  applyScreenOptimization();
}

function togglePanel(panelKey) {
  const activeCount = Object.values(panelVisibility).filter(Boolean).length;
  if (panelVisibility[panelKey] && activeCount <= 1) {
    alert("최소 1개의 창은 화면에 표시되어야 합니다.");
    return;
  }
  panelVisibility[panelKey] = !panelVisibility[panelKey];
  updatePanelVisibility();
}

/**
 * 특정한 버튼을 누르면 번역문장만 보이는 기능:
 * - 이미 번역문장만 보고 있다면 -> 원문 창을 다시 표시하여 전체 보기 복원
 * - 원문이 표시 중이라면 -> 원문 창을 숨기고 번역문장 창들만 전체 화면으로 표시 및 상단 숨김 자동 적용
 */
function toggleTranslationOnlyMode() {
  const isTranslationOnly = !panelVisibility.source && (panelVisibility.target1 || panelVisibility.target2);
  if (isTranslationOnly) {
    panelVisibility.source = true;
  } else {
    panelVisibility.source = false;
    panelVisibility.target1 = true;
    panelVisibility.target2 = true;
    // 번역문장만 보기 클릭 시에도 상단 메뉴 숨김(화면 최적화)을 함께 활성화
    isScreenOptimized = true;
    try {
      localStorage.setItem("kv_screen_optimized", "true");
    } catch (_) {}
    applyScreenOptimization();
  }
  updatePanelVisibility();
}

/* ─── Core Application State ─── */
let selectedLang = "ko";
let ws1 = null;
let ws2 = null;
let isReady1 = false;
let isReady2 = false;

let audioContext = null;
let mediaStream = null;
let sourceNode = null;
let processorNode = null;
let analyserNode = null;
let meterAnimFrame = null;
let startedAt = 0;
let timerHandle = null;

/**
 * Turn State Machine:
 * - "idle": 세션 시작 전 ([1. 번역 시작] 대기)
 * - "standby": 세션 연결됨 · 대기 중 ([2. 문장 번역] 버튼을 눌러야만 한 문장 번역 시작)
 * - "listening": [2. 문장 번역] 버튼을 눌러 한 문장 발화 및 실시간 인식 중
 * - "finalizing": 한 문장 발화 종료 후 번역 확정 대기 중 (마이크 잠금)
 * - "tts_playing": 번역 확정 완료 후 TTS 음성 출력 중 (완료 후 자동으로 "standby"로 복귀하여 다음 버튼 클릭 대기)
 */
let sessionRunning = false;
let turnState = "idle";
let ws1TurnDone = false;
let ws2TurnDone = false;
let voiceDetectedInSentence = false;
let voiceStartAt = 0;
let lastVoiceAt = 0;
let commitTimeout = null;
let maxListenTimeout = null;

// 현시점 문장(1개) + 이전 문장(최대 5개) 슬라이딩 윈도우 상태 + 원문 발화 지속 누적 상태
let currentSource = "";
let browserSttText = "";
let currentTarget1 = "";
let currentTarget2 = "";

let committedCurrent = null; // { source: "", target1: "", target2: "" } - 현시점에 확정되어 표시 중인 문장
let allSpokenSourceLines = []; // 한국어 원문(발화) 항목에 사라지지 않고 계속 표시되는 전체 발화 문장 목록
let prevSourceLines = [];    // 이전 문장 목록 (최대 5개)
let prevTarget1Lines = [];   // 이전 문장 목록 (최대 5개)
let prevTarget2Lines = [];   // 이전 문장 목록 (최대 5개)
let hasShiftedTargetForTurn = false;
let speechRecognizer = null;

// 문장 번역 시작 시 이전 문장으로 밀어낸 백업 (발화 없이 취소된 경우 복원용)
let pendingShiftedTurn = null;

/* ─── Integrated TTS Engine State ─── */
let ttsMode = localStorage.getItem("unified_tts_mode") || "target1"; // "target1" | "target2" | "both"
if (!["target1", "target2", "both"].includes(ttsMode)) ttsMode = "target1";

let voicesByLang = {
  ko: [...DEFAULT_NEURAL_VOICES.ko],
  en: [...DEFAULT_NEURAL_VOICES.en],
  vi: [...DEFAULT_NEURAL_VOICES.vi],
};
let currentAudio = null;
let isSpeaking = false;
let audioUnlocked = false;
let ttsPlaybackAborted = false;

// Optional Listener Broadcast (for external /listener.html sync)
const broadcastChannel =
  typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("live_translation_stream") : null;
let broadcastWs = null;

/* ─── Speaker Auth & Broadcast ─── */
const WS_PROTO = location.protocol === "https:" ? "wss:" : "ws:";
let speakerToken = "";
let isServerlessEnv = false;
try {
  speakerToken = sessionStorage.getItem("kv_speaker_token") || "";
} catch (_) {}

async function fetchSpeakerStatus() {
  const pinParam = authPin || "2026";
  const res = await fetch(`/api/speaker-status?pin=${encodeURIComponent(pinParam)}&token=${encodeURIComponent(speakerToken || pinParam)}`, { cache: "no-store" });
  const data = await res.json();
  if (typeof data.serverless === "boolean") {
    isServerlessEnv = data.serverless;
  }
  return data;
}

async function ensureSpeakerAuth(forcePrompt = false) {
  if (!isUserAuthenticated()) {
    showAuthOverlay();
    throw new Error("보안 인증번호(2026)를 입력해주세요.");
  }
  const status = await fetchSpeakerStatus();
  return status;
}

function clearSpeakerToken() {
  speakerToken = "";
  try {
    sessionStorage.removeItem("kv_speaker_token");
  } catch (_) {}
}

async function connectBroadcastWs() {
  let status;
  try {
    status = await fetchSpeakerStatus();
  } catch (_) {
    return setTimeout(connectBroadcastWs, 3000);
  }
  if (status.serverless) return;
  const pinParam = authPin || "2026";
  const wsUrl = `${WS_PROTO}//${location.host}/ws/broadcast?role=speaker&token=${encodeURIComponent(speakerToken || pinParam)}&pin=${encodeURIComponent(pinParam)}`;
  let opened = false;
  try {
    broadcastWs = new WebSocket(wsUrl);
    broadcastWs.onopen = () => {
      opened = true;
    };
    broadcastWs.onclose = () => {
      if (!opened && status.tokenRequired) clearSpeakerToken();
      setTimeout(connectBroadcastWs, 3000);
    };
    broadcastWs.onerror = () => {
      try {
        broadcastWs.close();
      } catch (_) {}
    };
  } catch (_) {
    setTimeout(connectBroadcastWs, 3000);
  }
}
connectBroadcastWs();

function emitListenerEvent(payload) {
  try {
    if (broadcastChannel) broadcastChannel.postMessage(payload);
  } catch (_) {}

  if (broadcastWs && broadcastWs.readyState === WebSocket.OPEN) {
    try {
      broadcastWs.send(JSON.stringify(payload));
    } catch (_) {}
  } else if (payload && payload.type !== "stream_update") {
    const pinParam = authPin || "2026";
    fetch(`/api/broadcast?token=${encodeURIComponent(speakerToken || pinParam)}&pin=${encodeURIComponent(pinParam)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }
}

let streamEmitPending = false;
function emitThrottledStreamUpdate() {
  if (streamEmitPending) return;
  streamEmitPending = true;
  requestAnimationFrame(() => {
    streamEmitPending = false;
    const config = LANG_CONFIGS[selectedLang];
    emitListenerEvent({
      type: "stream_update",
      sourceLang: selectedLang,
      sourceText: currentSource,
      target1Lang: config?.target1.code,
      target1Text: currentTarget1,
      target2Lang: config?.target2.code,
      target2Text: currentTarget2,
    });
  });
}

/* ─── Theme Management ─── */
function setTheme(theme) {
  if (theme === "dark") {
    document.body.classList.add("dark-theme");
    if (themeIcon) themeIcon.textContent = "☀️";
    if (themeLabel) themeLabel.textContent = "낮 모드";
  } else {
    document.body.classList.remove("dark-theme");
    if (themeIcon) themeIcon.textContent = "🌙";
    if (themeLabel) themeLabel.textContent = "밤 모드";
  }
  try {
    localStorage.setItem("app_theme", theme);
  } catch (_) {}
}

setTheme(localStorage.getItem("app_theme") || "light");
themeToggleBtn?.addEventListener("click", () => {
  const isDark = document.body.classList.contains("dark-theme");
  setTheme(isDark ? "light" : "dark");
});

/* ─── Status & 2-Button UI Sync ─── */
function setStatus(text, kind = "idle") {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = `status ${kind}`;
}

function updateTranslationButtonsUI() {
  if (!startBtn || !sentenceTranslateBtn || !stopBtn) return;

  if (!sessionRunning || turnState === "idle") {
    startBtn.disabled = false;
    startBtn.classList.remove("is-connected");
    startBtn.textContent = "🚀 1. 번역 시작";

    sentenceTranslateBtn.disabled = true;
    sentenceTranslateBtn.className = "btn-sentence-translate";
    sentenceTranslateBtn.textContent = "🗣️ 2. 문장 번역 (한 문장 말하기)";

    stopBtn.disabled = true;
    return;
  }

  // 세션이 시작된 상태
  startBtn.disabled = true;
  startBtn.classList.add("is-connected");
  startBtn.textContent = "✅ 1. 번역 시작됨";
  stopBtn.disabled = false;

  if (turnState === "standby") {
    sentenceTranslateBtn.disabled = false;
    sentenceTranslateBtn.className = "btn-sentence-translate ready-pulse";
    sentenceTranslateBtn.textContent = committedCurrent
      ? "🗣️ 2. 문장 번역 (다음 한 문장 말하기)"
      : "🗣️ 2. 문장 번역 (누르고 한 문장 말하기)";
  } else if (turnState === "listening") {
    sentenceTranslateBtn.disabled = false;
    sentenceTranslateBtn.className = "btn-sentence-translate is-listening";
    sentenceTranslateBtn.textContent = "🎙️ 한 문장 듣는 중... (말씀 후 자동 번역 · 클릭 시 완료)";
  } else if (turnState === "finalizing") {
    sentenceTranslateBtn.disabled = true;
    sentenceTranslateBtn.className = "btn-sentence-translate is-busy";
    sentenceTranslateBtn.textContent = "⏳ 문장 번역 확정 중...";
  } else if (turnState === "tts_playing") {
    sentenceTranslateBtn.disabled = true;
    sentenceTranslateBtn.className = "btn-sentence-translate is-busy";
    sentenceTranslateBtn.textContent = "🔊 TTS 음성 출력 중... (끝나면 버튼 활성화)";
  }
}

/* ─── Integrated Neural TTS Management ─── */
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  try {
    const silent = new Audio(
      "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA"
    );
    silent.volume = 0.01;
    silent.play().catch(() => {});
  } catch (_) {}
}

function getActiveTtsVoiceLangCode() {
  const config = LANG_CONFIGS[selectedLang];
  if (ttsMode === "target2") return config.target2.code;
  return config.target1.code;
}

async function fetchVoicesForLang(langCode) {
  try {
    const res = await fetch(`/api/voices?lang=${langCode}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.voices) && data.voices.length > 0) {
        voicesByLang[langCode] = data.voices;
      }
    }
  } catch (_) {}
  return voicesByLang[langCode] || DEFAULT_NEURAL_VOICES[langCode] || [];
}

async function populateVoiceSelectForCurrentMode() {
  const config = LANG_CONFIGS[selectedLang];

  if (voiceLabel1) {
    voiceLabel1.textContent = `🎤 ${config.target1.flag} 번역1(${config.target1.name}) 목소리:`;
  }
  if (voiceLabel2) {
    voiceLabel2.textContent = `🎤 ${config.target2.flag} 번역2(${config.target2.name}) 목소리:`;
  }

  const populateSelect = async (selectEl, langCode) => {
    if (!selectEl) return;
    const voices = await fetchVoicesForLang(langCode);
    const savedVoiceId = localStorage.getItem(`unified_voice_${langCode}`);

    selectEl.innerHTML = "";
    let matched = false;
    voices.forEach((v, idx) => {
      const opt = document.createElement("option");
      opt.value = v.id;
      const genderIcon = v.gender === "Female" ? "👩" : "👨";
      opt.textContent = `${genderIcon} ${v.name}`;
      if (savedVoiceId && v.id === savedVoiceId) {
        opt.selected = true;
        matched = true;
      } else if (!savedVoiceId && idx === 0) {
        opt.selected = true;
        matched = true;
      }
      selectEl.appendChild(opt);
    });
    if (!matched && voices.length > 0) {
      selectEl.selectedIndex = 0;
    }
  };

  await Promise.all([
    populateSelect(voiceSelect1, config.target1.code),
    populateSelect(voiceSelect2, config.target2.code),
  ]);
}

function getVoiceIdForLang(langCode) {
  const config = LANG_CONFIGS[selectedLang];
  let voiceId = "";
  if (config.target1.code === langCode && voiceSelect1?.value) {
    voiceId = voiceSelect1.value;
  } else if (config.target2.code === langCode && voiceSelect2?.value) {
    voiceId = voiceSelect2.value;
  } else {
    voiceId = localStorage.getItem(`unified_voice_${langCode}`);
  }

  const list = voicesByLang[langCode] || DEFAULT_NEURAL_VOICES[langCode] || [];
  if (voiceId && list.some((v) => v.id === voiceId)) return voiceId;
  return list[0]?.id || (langCode === "vi" ? "vi-VN-HoaiMyNeural" : langCode === "en" ? "en-US-JennyNeural" : "ko-KR-SunHiNeural");
}

voiceSelect1?.addEventListener("change", () => {
  const config = LANG_CONFIGS[selectedLang];
  if (voiceSelect1.value) {
    try {
      localStorage.setItem(`unified_voice_${config.target1.code}`, voiceSelect1.value);
    } catch (_) {}
  }
});

voiceSelect2?.addEventListener("change", () => {
  const config = LANG_CONFIGS[selectedLang];
  if (voiceSelect2.value) {
    try {
      localStorage.setItem(`unified_voice_${config.target2.code}`, voiceSelect2.value);
    } catch (_) {}
  }
});

function updateTtsModeUI() {
  const config = LANG_CONFIGS[selectedLang];
  if (ttsModeT1Btn) {
    ttsModeT1Btn.textContent = `${config.target1.flag} ${config.target1.name} (번역1)`;
    ttsModeT1Btn.classList.toggle("active", ttsMode === "target1");
  }
  if (ttsModeT2Btn) {
    ttsModeT2Btn.textContent = `${config.target2.flag} ${config.target2.name} (번역2)`;
    ttsModeT2Btn.classList.toggle("active", ttsMode === "target2");
  }
  if (ttsModeBothBtn) {
    ttsModeBothBtn.textContent = `🔊 ${config.target1.flag}+${config.target2.flag} 연속`;
    ttsModeBothBtn.classList.toggle("active", ttsMode === "both");
  }

  if (target1TtsActiveBadge) {
    target1TtsActiveBadge.classList.toggle("hidden", !(ttsMode === "target1" || ttsMode === "both"));
  }
  if (target2TtsActiveBadge) {
    target2TtsActiveBadge.classList.toggle("hidden", !(ttsMode === "target2" || ttsMode === "both"));
  }

  populateVoiceSelectForCurrentMode();
}

function setTtsMode(mode) {
  if (!["target1", "target2", "both"].includes(mode)) return;
  ttsMode = mode;
  try {
    localStorage.setItem("unified_tts_mode", mode);
  } catch (_) {}
  updateTtsModeUI();
}

ttsModeT1Btn?.addEventListener("click", () => setTtsMode("target1"));
ttsModeT2Btn?.addEventListener("click", () => setTtsMode("target2"));
ttsModeBothBtn?.addEventListener("click", () => setTtsMode("both"));

// TTS Sliders
ttsRate?.addEventListener("input", () => {
  if (rateValue) rateValue.textContent = `${Number(ttsRate.value).toFixed(1)}x`;
  try {
    localStorage.setItem("listener_tts_rate", ttsRate.value);
  } catch (_) {}
  if (currentAudio) currentAudio.playbackRate = Number(ttsRate.value);
});

ttsPitch?.addEventListener("input", () => {
  if (pitchValue) pitchValue.textContent = Number(ttsPitch.value).toFixed(2);
  try {
    localStorage.setItem("listener_tts_pitch", ttsPitch.value);
  } catch (_) {}
});

ttsVolume?.addEventListener("input", () => {
  if (volumeValue) volumeValue.textContent = `${Math.round(Number(ttsVolume.value) * 100)}%`;
  try {
    localStorage.setItem("listener_tts_volume", ttsVolume.value);
  } catch (_) {}
  if (currentAudio) currentAudio.volume = Number(ttsVolume.value);
});

try {
  const savedRate = localStorage.getItem("listener_tts_rate");
  const savedPitch = localStorage.getItem("listener_tts_pitch");
  const savedVolume = localStorage.getItem("listener_tts_volume");
  if (savedRate && ttsRate) {
    ttsRate.value = savedRate;
    if (rateValue) rateValue.textContent = `${Number(savedRate).toFixed(1)}x`;
  }
  if (savedPitch && ttsPitch) {
    ttsPitch.value = savedPitch;
    if (pitchValue) pitchValue.textContent = Number(savedPitch).toFixed(2);
  }
  if (savedVolume && ttsVolume) {
    ttsVolume.value = savedVolume;
    if (volumeValue) volumeValue.textContent = `${Math.round(Number(savedVolume) * 100)}%`;
  }
} catch (_) {}

function calculateRateString(rateMultiplier) {
  const pct = Math.round((rateMultiplier - 1.0) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

function calculatePitchString(pitchMultiplier) {
  const hz = Math.round((pitchMultiplier - 1.0) * 50);
  return hz >= 0 ? `+${hz}Hz` : `${hz}Hz`;
}

function setSpeakingIndicator(active, labelText) {
  isSpeaking = active;
  if (ttsSpeakingIndicator) {
    ttsSpeakingIndicator.classList.toggle("inactive", !active);
  }
  if (ttsStatusLabel) {
    ttsStatusLabel.textContent = labelText || (active ? "TTS 재생 중..." : "TTS 대기");
  }
}

function stopCurrentAudio() {
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch (_) {}
    currentAudio = null;
  }
  if (window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch (_) {}
  }
}

function stopTts() {
  ttsPlaybackAborted = true;
  stopCurrentAudio();
  setSpeakingIndicator(false, "TTS 대기");

  // 만약 문장 번역 후 TTS 재생 단계였다면 즉시 다음 문장 번역 버튼 활성화 대기 상태로 전환
  if (sessionRunning && turnState === "tts_playing") {
    enterStandbyAfterSentence();
  }
}

function playSingleUtterance(text, langCode) {
  return new Promise(async (resolve) => {
    const clean = (text || "").trim();
    if (!clean || ttsPlaybackAborted) {
      resolve();
      return;
    }

    stopCurrentAudio();
    const voiceId = getVoiceIdForLang(langCode);
    const speed = Number(ttsRate?.value || 1.0);
    const pitch = Number(ttsPitch?.value || 1.0);
    const volume = Number(ttsVolume?.value || 1.0);

    const rateStr = calculateRateString(speed);
    const pitchStr = calculatePitchString(pitch);

    if (currentTtsText) {
      currentTtsText.textContent = clean;
    }
    setSpeakingIndicator(true, `🔊 TTS 읽는 중 (${langCode.toUpperCase()})...`);

    const url = `/api/tts?text=${encodeURIComponent(clean)}&voice=${encodeURIComponent(voiceId)}&rate=${encodeURIComponent(rateStr)}&pitch=${encodeURIComponent(pitchStr)}`;

    let audioUrl = url;
    let blobUrlToRevoke = null;

    try {
      const res = await fetch(url);
      if (res.ok) {
        const blob = await res.blob();
        blobUrlToRevoke = URL.createObjectURL(blob);
        audioUrl = blobUrlToRevoke;
      }
    } catch (_) {}

    const audio = new Audio(audioUrl);
    currentAudio = audio;
    audio.volume = volume;

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (blobUrlToRevoke) {
        try { URL.revokeObjectURL(blobUrlToRevoke); } catch (_) {}
      }
      currentAudio = null;
      resolve();
    };

    audio.onended = finish;
    audio.onerror = () => {
      if (!window.speechSynthesis || ttsPlaybackAborted) {
        finish();
        return;
      }
      try {
        const utt = new SpeechSynthesisUtterance(clean);
        utt.lang = langCode;
        utt.rate = speed;
        utt.volume = volume;
        utt.onend = finish;
        utt.onerror = finish;
        window.speechSynthesis.speak(utt);
      } catch (_) {
        finish();
      }
    };

    audio.play().catch(() => {
      finish();
    });
  });
}

async function playSentenceTts(sentenceObj, forcePlay = false) {
  if (!sentenceObj) return;
  if (!forcePlay && !autoTtsToggle?.checked) {
    if (sessionRunning && turnState === "tts_playing") {
      enterStandbyAfterSentence();
    }
    return;
  }

  unlockAudio();
  ttsPlaybackAborted = false;
  const config = LANG_CONFIGS[selectedLang];

  const queue = [];
  if (ttsMode === "target1") {
    if (sentenceObj.target1) queue.push({ text: sentenceObj.target1, lang: config.target1.code });
  } else if (ttsMode === "target2") {
    if (sentenceObj.target2) queue.push({ text: sentenceObj.target2, lang: config.target2.code });
  } else if (ttsMode === "both") {
    if (sentenceObj.target1) queue.push({ text: sentenceObj.target1, lang: config.target1.code });
    if (sentenceObj.target2) queue.push({ text: sentenceObj.target2, lang: config.target2.code });
  }

  if (queue.length === 0) {
    if (sessionRunning && turnState === "tts_playing") {
      enterStandbyAfterSentence();
    }
    return;
  }

  for (const item of queue) {
    if (ttsPlaybackAborted) break;
    await playSingleUtterance(item.text, item.lang);
  }

  setSpeakingIndicator(false, "TTS 완료");
  if (sessionRunning && turnState === "tts_playing") {
    enterStandbyAfterSentence();
  }
}

// TTS Action Buttons
stopTtsBtn?.addEventListener("click", () => {
  stopTts();
});

testVoiceBtn?.addEventListener("click", async () => {
  unlockAudio();
  ttsPlaybackAborted = false;
  const langCode = getActiveTtsVoiceLangCode();
  const sample = SAMPLE_SENTENCES[langCode] || SAMPLE_SENTENCES.ko;
  await playSingleUtterance(sample, langCode);
  setSpeakingIndicator(false, "TTS 대기");
});

replayCurrentTtsBtn?.addEventListener("click", async () => {
  if (committedCurrent && (committedCurrent.target1 || committedCurrent.target2)) {
    await playSentenceTts(committedCurrent, true);
  } else {
    const langCode = getActiveTtsVoiceLangCode();
    ttsPlaybackAborted = false;
    await playSingleUtterance(SAMPLE_SENTENCES[langCode] || SAMPLE_SENTENCES.ko, langCode);
    setSpeakingIndicator(false, "TTS 대기");
  }
});

speakTarget1Btn?.addEventListener("click", async () => {
  unlockAudio();
  ttsPlaybackAborted = false;
  const config = LANG_CONFIGS[selectedLang];
  const text = committedCurrent?.target1 || currentTarget1 || SAMPLE_SENTENCES[config.target1.code];
  await playSingleUtterance(text, config.target1.code);
  setSpeakingIndicator(false, "TTS 대기");
});

speakTarget2Btn?.addEventListener("click", async () => {
  unlockAudio();
  ttsPlaybackAborted = false;
  const config = LANG_CONFIGS[selectedLang];
  const text = committedCurrent?.target2 || currentTarget2 || SAMPLE_SENTENCES[config.target2.code];
  await playSingleUtterance(text, config.target2.code);
  setSpeakingIndicator(false, "TTS 대기");
});

/* ─── Sliding Window Rendering: 현시점 문장 (1개) + 이전 문장 (최대 5개) ─── */
function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderPreviousList(containerEl, countEl, linesArray, emptyMessage) {
  if (!containerEl) return;
  const count = linesArray.length;
  if (countEl) {
    countEl.textContent = `${count} / ${MAX_PREV_SENTENCES}문장`;
  }

  if (count === 0) {
    containerEl.innerHTML = `<div class="prev-empty-placeholder">${escapeHtml(emptyMessage)}</div>`;
    return;
  }

  // 바로 직전의 한 문장만 표시 (새 문장이 추가될 때 가장 오래된 문장 1개가 이미 shift()로 제거됨)
  containerEl.innerHTML = linesArray
    .map(
      (line) => `
      <div class="prev-sentence-item">
        <span class="prev-sentence-num">직전 문장</span>
        <span class="prev-sentence-content">${escapeHtml(line)}</span>
      </div>
    `
    )
    .join("");

  containerEl.scrollTop = containerEl.scrollHeight;
}

function getActiveSourceText() {
  return (currentSource || browserSttText || "").replace(/\s+/g, " ").trim();
}

function renderSourcePanel(config) {
  if (!sourceCurrentText) return;

  const activeLiveSource = (turnState === "listening" || turnState === "finalizing")
    ? getActiveSourceText()
    : "";

  const allLines = [...allSpokenSourceLines];
  if (activeLiveSource) {
    allLines.push(activeLiveSource);
  }

  // 화면에는 현문장과 바로 직전의 한 문장만 보이게 함 (총 2문장 표시)
  const displayLines = allLines.slice(-MAX_VISIBLE_SOURCE_SENTENCES);

  if (sourcePrevCount) {
    sourcePrevCount.textContent = `${displayLines.length} / ${MAX_VISIBLE_SOURCE_SENTENCES}문장 (직전+현문장)`;
  }

  // 말한 문장 중 직전 문장과 현문장 총 2개만 화면에 표시됨
  if (displayLines.length === 0) {
    const placeholder = sessionRunning
      ? "[2. 문장 번역] 버튼을 누르고 말씀하시면 직전 문장과 현문장(총 2문장)이 여기에 표시됩니다."
      : config.sourcePlaceholder;
    sourceCurrentText.innerHTML = `<div class="source-placeholder-msg">${escapeHtml(placeholder)}</div>`;
  } else {
    sourceCurrentText.innerHTML = displayLines
      .map((line, idx) => {
        const isLatest = idx === displayLines.length - 1;
        const isLive = isLatest && Boolean(activeLiveSource);
        let badgeLabel = "";
        if (isLive) {
          badgeLabel = "🎙️ 발화 중";
        } else if (isLatest) {
          badgeLabel = "▶ 현시점 문장";
        } else {
          badgeLabel = "📜 직전 문장";
        }
        return `
          <div class="source-spoken-item ${isLatest ? "is-latest" : ""}">
            <span class="source-spoken-badge">${badgeLabel}</span>
            <span class="source-spoken-text">${escapeHtml(line)}</span>
          </div>
        `;
      })
      .join("");
    sourceCurrentText.scrollTop = sourceCurrentText.scrollHeight;
  }

  // "🎙️ 듣고 있습니다. 한 문장을 말씀하세요..." 안내 문구는 기존 문장을 지우지 않고 하단에 추가로 표시됨
  if (sourceListeningPrompt) {
    const isListeningNow = turnState === "listening" || turnState === "finalizing";
    sourceListeningPrompt.classList.toggle("hidden", !isListeningNow);
    if (turnState === "finalizing") {
      sourceListeningPrompt.textContent = "⏳ 문장 인식을 마무리하고 번역을 확정하고 있습니다...";
    } else {
      sourceListeningPrompt.textContent = "🎙️ 듣고 있습니다. 한 문장을 말씀하세요...";
    }
  }
}

function refreshAllPanels() {
  const config = LANG_CONFIGS[selectedLang];

  // 1. 한국어 원문(발화) 패널: 화면에 보이는 직전 1문장 + 현문장(총 2문장) 표시
  renderSourcePanel(config);

  // 2. 번역 패널(번역 1, 번역 2): 현시점 문장 1개 + 직전 문장 1개 = 총 2개 문장 표시
  let t1Curr = "";
  let t2Curr = "";

  const liveT1 = currentTarget1.replace(/\s+/g, " ").trim();
  const liveT2 = currentTarget2.replace(/\s+/g, " ").trim();

  if (turnState === "listening" || turnState === "finalizing") {
    if (liveT1 || liveT2) {
      t1Curr = liveT1 || "번역 중...";
      t2Curr = liveT2 || "번역 중...";
    } else if (committedCurrent) {
      // 새 문장 번역이 도착하기 전까지는 직전 현시점 번역 문장을 그대로 유지
      t1Curr = committedCurrent.target1 || "-";
      t2Curr = committedCurrent.target2 || "-";
    } else {
      t1Curr = "🎙️ 듣고 있습니다. 말씀하시면 번역이 표시됩니다...";
      t2Curr = "🎙️ 듣고 있습니다. 말씀하시면 번역이 표시됩니다...";
    }
  } else if (committedCurrent) {
    t1Curr = committedCurrent.target1 || "-";
    t2Curr = committedCurrent.target2 || "-";
  } else {
    t1Curr = sessionRunning
      ? "[2. 문장 번역] 버튼을 누르고 말씀하시면 현시점 번역이 표시됩니다."
      : config.target1.placeholder;
    t2Curr = sessionRunning
      ? "[2. 문장 번역] 버튼을 누르고 말씀하시면 현시점 번역이 표시됩니다."
      : config.target2.placeholder;
  }

  if (target1CurrentText) target1CurrentText.textContent = t1Curr;
  if (target2CurrentText) target2CurrentText.textContent = t2Curr;

  // 3. 번역 패널의 직전 문장 목록 (최대 1개만 유지 · 현문장 포함 총 2개 문장 화면 표시)
  renderPreviousList(
    target1PrevList,
    target1PrevCount,
    prevTarget1Lines,
    `바로 직전에 번역된 ${config.target1.name} 문장이 여기에 표시됩니다 (현문장 포함 총 2개 문장).`
  );
  renderPreviousList(
    target2PrevList,
    target2PrevCount,
    prevTarget2Lines,
    `바로 직전에 번역된 ${config.target2.name} 문장이 여기에 표시됩니다 (현문장 포함 총 2개 문장).`
  );
}

/**
 * 새로운 문장 번역이 시작되어 텍스트가 들어올 때,
 * 기존 현시점 번역 문장(committedCurrent)을 이전 문장 목록(최대 5개)으로 이동하고
 * 5개를 초과하면 가장 오래된 문장 1개를 제거(shift)합니다.
 */
function ensureTargetShiftedForCurrentTurn() {
  if (hasShiftedTargetForTurn) return;
  hasShiftedTargetForTurn = true;

  if (!committedCurrent) {
    pendingShiftedTurn = null;
    return;
  }

  pendingShiftedTurn = {
    committedCurrent: { ...committedCurrent },
    prevSourceSnapshot: [...prevSourceLines],
    prevTarget1Snapshot: [...prevTarget1Lines],
    prevTarget2Snapshot: [...prevTarget2Lines],
  };

  if (committedCurrent.source) {
    prevSourceLines.push(committedCurrent.source);
    while (prevSourceLines.length > MAX_PREV_SENTENCES) {
      prevSourceLines.shift();
    }
  }
  if (committedCurrent.target1) {
    prevTarget1Lines.push(committedCurrent.target1);
    while (prevTarget1Lines.length > MAX_PREV_SENTENCES) {
      prevTarget1Lines.shift();
    }
  }
  if (committedCurrent.target2) {
    prevTarget2Lines.push(committedCurrent.target2);
    while (prevTarget2Lines.length > MAX_PREV_SENTENCES) {
      prevTarget2Lines.shift();
    }
  }

  committedCurrent = null;
}

function rollbackShiftedSentenceIfEmpty() {
  if (!pendingShiftedTurn) return;
  committedCurrent = pendingShiftedTurn.committedCurrent;
  prevSourceLines = pendingShiftedTurn.prevSourceSnapshot;
  prevTarget1Lines = pendingShiftedTurn.prevTarget1Snapshot;
  prevTarget2Lines = pendingShiftedTurn.prevTarget2Snapshot;
  pendingShiftedTurn = null;
}

/* ─── Apply Speaker Language Selection ─── */
function setLanguage(langKey) {
  if (!LANG_CONFIGS[langKey]) return;
  if (sessionRunning || ws1 || ws2) {
    stop();
  }

  selectedLang = langKey;
  const config = LANG_CONFIGS[langKey];

  Object.keys(langBtns).forEach((k) => {
    langBtns[k]?.classList.toggle("active", k === langKey);
  });

  if (mainTitle) mainTitle.textContent = config.title;
  if (sourceLabel) sourceLabel.textContent = config.sourceLabel;
  if (target1Label) target1Label.textContent = config.target1.label;
  if (target2Label) target2Label.textContent = config.target2.label;

  const target1Panel = $("target1Panel");
  const target2Panel = $("target2Panel");
  if (target1Panel) target1Panel.dataset.targetLang = config.target1.code;
  if (target2Panel) target2Panel.dataset.targetLang = config.target2.code;

  if (toggleSourceText) toggleSourceText.textContent = `원문 (${config.name})`;
  if (toggleTarget1Text) toggleTarget1Text.textContent = `번역 1 (${config.target1.name})`;
  if (toggleTarget2Text) toggleTarget2Text.textContent = `번역 2 (${config.target2.name})`;

  currentSource = "";
  browserSttText = "";
  currentTarget1 = "";
  currentTarget2 = "";
  committedCurrent = null;
  allSpokenSourceLines = [];
  prevSourceLines = [];
  prevTarget1Lines = [];
  prevTarget2Lines = [];
  hasShiftedTargetForTurn = false;
  pendingShiftedTurn = null;

  updateTtsModeUI();
  refreshAllPanels();

  emitListenerEvent({
    type: "lang_changed",
    sourceLang: selectedLang,
    sourceName: config.name,
    target1Lang: config.target1.code,
    target1Name: config.target1.name,
    target2Lang: config.target2.code,
    target2Name: config.target2.name,
  });
}

Object.entries(langBtns).forEach(([langKey, btn]) => {
  btn?.addEventListener("click", () => setLanguage(langKey));
});

/* ─── Mic Device Monitoring & Auto-Refresh ─── */
let knownDeviceSignature = "";

async function unlockMicLabels() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch (_) {
    return false;
  }
}

async function refreshMicDevices(force = false) {
  if (!navigator.mediaDevices?.enumerateDevices || !micSelect) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter((d) => d.kind === "audioinput");

    const signature = audioInputs
      .map((d) => `${d.deviceId}::${d.label}`)
      .sort()
      .join("||");

    if (!force && signature === knownDeviceSignature) return;
    knownDeviceSignature = signature;

    const previousValue = micSelect.value || localStorage.getItem("preferred_mic_id") || "";
    let matched = false;

    micSelect.innerHTML = `<option value="">기본 마이크 (Default)</option>`;
    audioInputs.forEach((device, index) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = device.label || `마이크 ${index + 1} (권한 필요)`;
      if (device.deviceId && device.deviceId === previousValue) {
        option.selected = true;
        matched = true;
      }
      micSelect.appendChild(option);
    });

    if (previousValue && !matched && previousValue !== "") {
      micSelect.value = "";
      localStorage.removeItem("preferred_mic_id");
      if (mediaStream) {
        stopMicrophone();
        await startMicrophone();
        setMicHardwareEnabled(turnState === "listening");
      }
    }
  } catch (_) {}
}

setInterval(() => refreshMicDevices(false), 1500);
navigator.mediaDevices?.addEventListener("devicechange", () => refreshMicDevices(true));
micSelect?.addEventListener("focus", () => refreshMicDevices(true));
micSelect?.addEventListener("mousedown", () => refreshMicDevices(true));

micRefreshBtn?.addEventListener("click", async () => {
  micRefreshBtn.classList.add("spinning");
  try {
    await unlockMicLabels();
  } finally {
    await refreshMicDevices(true);
    setTimeout(() => micRefreshBtn.classList.remove("spinning"), 600);
  }
});

micSelect?.addEventListener("change", async () => {
  const newId = micSelect.value;
  if (newId) localStorage.setItem("preferred_mic_id", newId);
  else localStorage.removeItem("preferred_mic_id");

  if (mediaStream) {
    stopMicrophone();
    await startMicrophone();
    setMicHardwareEnabled(turnState === "listening");
  }
});

refreshMicDevices(true);

/* ─── Audio Level Meter & Helpers ─── */
function updateMeter() {
  if (!analyserNode) return;
  if (turnState !== "listening") {
    if (micMeterBar) micMeterBar.style.width = "0%";
    meterAnimFrame = requestAnimationFrame(updateMeter);
    return;
  }
  const data = new Uint8Array(analyserNode.frequencyBinCount);
  analyserNode.getByteFrequencyData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  const pct = Math.min(100, Math.round((sum / data.length / 64) * 100));
  if (micMeterBar) micMeterBar.style.width = `${pct}%`;
  meterAnimFrame = requestAnimationFrame(updateMeter);
}

function base64FromBytes(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function float32ToInt16(input) {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}

function resampleLinear(buffer, inputRate, outputRate = 16000) {
  if (inputRate === outputRate) return buffer;
  const ratio = inputRate / outputRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const origin = i * ratio;
    const index = Math.floor(origin);
    const decimal = origin - index;
    const next = Math.min(index + 1, buffer.length - 1);
    result[i] = buffer[index] * (1 - decimal) + buffer[next] * decimal;
  }
  return result;
}

/* ─── History Modal ─── */
function addHistory(src, t1, t2, config) {
  if (!src.trim() && !t1.trim() && !t2.trim()) return;
  if (!historyList) return;

  const item = document.createElement("div");
  item.className = "history-item";

  const srcText = src.trim() || "(음성 인식 없음)";
  const t1Text = t1.trim() || "-";
  const t2Text = t2.trim() || "-";

  item.innerHTML = `
    <div class="history-source">
      <span>${config.flag}</span>
      <span>${escapeHtml(srcText)}</span>
    </div>
    <div class="history-translations">
      <div class="history-trans-card t1">
        <div class="tag">${config.target1.flag} ${config.target1.name}</div>
        <div class="content">${escapeHtml(t1Text)}</div>
      </div>
      <div class="history-trans-card t2">
        <div class="tag">${config.target2.flag} ${config.target2.name}</div>
        <div class="content">${escapeHtml(t2Text)}</div>
      </div>
    </div>
  `;

  historyList.prepend(item);
}

function updateTimer() {
  const sec = Math.floor((Date.now() - startedAt) / 1000);
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  const timeStr = `${mm}:${ss}`;
  if (timerEl) timerEl.textContent = timeStr;
  if (timerBadge) timerBadge.textContent = timeStr;
}

historyModalBtn?.addEventListener("click", () => historyModal?.classList.remove("hidden"));
closeHistoryModalBtn?.addEventListener("click", () => historyModal?.classList.add("hidden"));
clearHistoryBtn?.addEventListener("click", () => {
  if (historyList) historyList.innerHTML = "";
});
historyModal?.addEventListener("click", (e) => {
  if (e.target === historyModal) historyModal.classList.add("hidden");
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !historyModal?.classList.contains("hidden")) {
    historyModal.classList.add("hidden");
  }
});

/* ─── Gemini Proxy / Direct Live WS URL ─── */
let _cachedApiKey = null;
async function getGeminiProxyUrl() {
  const pinParam = authPin || "2026";
  const isRemote = (location.hostname !== "localhost" && location.hostname !== "127.0.0.1");

  let status = { serverless: isRemote, geminiConfigured: true };
  try {
    const res = await fetch(`/api/speaker-status?pin=${encodeURIComponent(pinParam)}&token=${encodeURIComponent(speakerToken || pinParam)}`, { cache: "no-store" });
    if (res.ok) {
      status = await res.json();
    }
  } catch (e) {
    console.warn("fetchSpeakerStatus failed:", e);
  }

  // 배포 환경(Vercel, Render, Railway, 클라우드 등) 및 서버리스 또는 Gemini 키가 설정된 경우:
  // Node WebSocket 프록시 지연/타임아웃 없이 브라우저에서 Google 공식 Gemini Live WS로 직접 연결합니다.
  if (isRemote || status.serverless || status.geminiConfigured) {
    if (!_cachedApiKey) {
      // 1. 서버 /api/key 엔드포인트에서 키 조회 (인증 PIN 2026 전달)
      try {
        const res = await fetch(`/api/key?pin=${encodeURIComponent(pinParam)}&token=${encodeURIComponent(speakerToken || pinParam)}`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data.key) {
            _cachedApiKey = data.key;
          }
        }
      } catch (err) {
        console.warn("서버 API 키 조회 실패:", err);
      }

      // 2. 서버에 환경변수가 없으면 로컬 스토리지 확인
      if (!_cachedApiKey) {
        try {
          _cachedApiKey = localStorage.getItem("kv_gemini_api_key") || "";
        } catch (_) {}
      }

      // 3. 없으면 사용자에게 API 키 입력 요청
      if (!_cachedApiKey) {
        const inputKey = (
          prompt(
            "실시간 번역을 위해 Gemini API Key가 필요합니다.\nGoogle AI Studio에서 발급받은 Gemini API 키를 입력해주세요:"
          ) || ""
        ).trim();
        if (!inputKey) {
          throw new Error("Gemini API 키가 필요합니다. 환경변수 GEMINI_API_KEY 또는 API 키를 입력하세요.");
        }
        _cachedApiKey = inputKey;
        try {
          localStorage.setItem("kv_gemini_api_key", inputKey);
        } catch (_) {}
      }
    }

    return `${WS_ENDPOINT_BASE}?key=${encodeURIComponent(_cachedApiKey)}`;
  }

  return `${WS_PROTO}//${location.host}/ws/gemini?token=${encodeURIComponent(speakerToken || pinParam)}&pin=${encodeURIComponent(pinParam)}`;
}

/* ─── Per-Sentence Manual Trigger + Automatic Turn Cut + TTS Integration ─── */
function setMicHardwareEnabled(enabled) {
  if (mediaStream) {
    mediaStream.getAudioTracks().forEach((track) => {
      track.enabled = Boolean(enabled);
    });
  }
  if (!enabled && micMeterBar) {
    micMeterBar.style.width = "0%";
  }
}

/**
 * [2. 문장 번역] 버튼 클릭 시 호출:
 * 딱 한 문장만 인식하도록 마이크를 열고, 이전 현시점 문장은 이전 문장(최대 5개) 목록으로 이동합니다.
 */
async function startSingleSentenceTurn() {
  if (!sessionRunning) return;

  unlockAudio();

  // 만약 이미 듣는 중("listening")에 버튼을 다시 누르면 즉시 발화 종료 및 번역 확정으로 넘어감
  if (turnState === "listening") {
    lockMicrophoneForSingleSentence();
    return;
  }

  // 만약 WebSocket 연결이 끊어져 있었다면 자동 재연결
  if (!ws1 || ws1.readyState !== WebSocket.OPEN || !ws2 || ws2.readyState !== WebSocket.OPEN) {
    await reconnectWebSocketsIfNeeded();
  }

  stopTts();

  // 기존 번역 문장(committedCurrent)을 이전 문장 목록으로 이동 (5개 초과 시 가장 오래된 1개 자동 삭제)
  hasShiftedTargetForTurn = false;
  ensureTargetShiftedForCurrentTurn();

  currentSource = "";
  currentTarget1 = "";
  currentTarget2 = "";
  ws1TurnDone = false;
  ws2TurnDone = false;
  voiceDetectedInSentence = false;
  voiceStartAt = 0;
  lastVoiceAt = 0;

  turnState = "listening";
  setMicHardwareEnabled(true);
  updateTranslationButtonsUI();
  refreshAllPanels();

  const config = LANG_CONFIGS[selectedLang];
  setStatus(
    `🎤 한 문장 듣는 중 — 지금 한 문장을 말씀하세요 (${config.flag} → ${config.target1.flag} · ${config.target2.flag})`,
    "live"
  );

  // 안전 타이머: 발화 없이 오랫동안 방치된 경우 자동 대기 복귀
  if (maxListenTimeout) clearTimeout(maxListenTimeout);
  maxListenTimeout = setTimeout(() => {
    if (turnState === "listening") {
      lockMicrophoneForSingleSentence();
    }
  }, 25000);
}

/**
 * 한 문장 발화가 끝나면 즉시 마이크를 잠그고 번역 확정을 준비합니다.
 */
function lockMicrophoneForSingleSentence() {
  if (turnState !== "listening") return;
  turnState = "finalizing";

  if (maxListenTimeout) {
    clearTimeout(maxListenTimeout);
    maxListenTimeout = null;
  }

  setMicHardwareEnabled(false);
  updateTranslationButtonsUI();
  setStatus("⚡ 번역 확정 중...", "standby");

  // 발화 종료 즉시 지연 없이 고속 확정 (기존 850ms -> 200ms)
  scheduleSingleSentenceFinalize(200);
}

function scheduleSingleSentenceFinalize(delayMs = 200) {
  if (turnState !== "finalizing") return;
  if (commitTimeout) clearTimeout(commitTimeout);
  commitTimeout = setTimeout(() => {
    finalizeSingleSentence();
  }, delayMs);
}

/**
 * 한 문장 번역을 최종 확정하고, TTS를 진행한 뒤,
 * 다시 [2. 문장 번역] 버튼을 눌러야만 다음 문장이 번역되도록 대기 상태("standby")로 전환합니다.
 */
function finalizeSingleSentence() {
  if (turnState !== "finalizing") return;

  if (commitTimeout) {
    clearTimeout(commitTimeout);
    commitTimeout = null;
  }

  setMicHardwareEnabled(false);

  const sFinal = currentSource.replace(/\s+/g, " ").trim();
  const t1Final = currentTarget1.replace(/\s+/g, " ").trim();
  const t2Final = currentTarget2.replace(/\s+/g, " ").trim();

  currentSource = "";
  currentTarget1 = "";
  currentTarget2 = "";

  // 아무 음성도 인식되지 않은 경우 이전 문장 상태를 복원하고 대기 상태로 복귀
  if (!sFinal && !t1Final && !t2Final) {
    rollbackShiftedSentenceIfEmpty();
    turnState = "standby";
    updateTranslationButtonsUI();
    refreshAllPanels();
    setStatus("⚠️ 인식된 문장이 없습니다 — [2. 문장 번역] 버튼을 다시 누르고 말씀하세요", "standby");
    return;
  }

  // 한국어 원문(발화) 항목: 화면에 직전 문장과 현문장(총 2문장)만 유지 (오래된 문장은 순차 제거)
  if (sFinal) {
    allSpokenSourceLines.push(sFinal);
  } else if (t1Final || t2Final) {
    allSpokenSourceLines.push("(음성 발화 완료)");
  }
  while (allSpokenSourceLines.length > MAX_VISIBLE_SOURCE_SENTENCES) {
    allSpokenSourceLines.shift();
  }

  // 현시점 문장 확정 (직전 문장 1개 + 현문장 1개 = 총 2문장 표시)
  pendingShiftedTurn = null;
  committedCurrent = {
    source: sFinal,
    target1: t1Final,
    target2: t2Final,
  };

  refreshAllPanels();
  addHistory(sFinal, t1Final, t2Final, LANG_CONFIGS[selectedLang]);

  // 외부 청취자 탭(/listener.html)이 열려 있을 경우를 위해 브로드캐스트 전송
  emitListenerEvent({
    type: "sentence_commit",
    sourceLang: selectedLang,
    sourceSentence: sFinal,
    fullSource: [...prevSourceLines, sFinal].filter(Boolean).join("\n"),
    target1Lang: LANG_CONFIGS[selectedLang].target1.code,
    target1Sentence: t1Final,
    fullTarget1: [...prevTarget1Lines, t1Final].filter(Boolean).join("\n"),
    target2Lang: LANG_CONFIGS[selectedLang].target2.code,
    target2Sentence: t2Final,
    fullTarget2: [...prevTarget2Lines, t2Final].filter(Boolean).join("\n"),
    timestamp: Date.now(),
  });

  if (!sessionRunning) return;

  // 번역 완료 후 통합 TTS 진행
  if (autoTtsToggle?.checked && (t1Final || t2Final)) {
    turnState = "tts_playing";
    updateTranslationButtonsUI();
    setStatus("🔊 번역 및 TTS 음성 출력 중... (완료 후 [2. 문장 번역] 버튼을 눌러 다음 문장 진행)", "tts");
    playSentenceTts(committedCurrent, false);
  } else {
    enterStandbyAfterSentence();
  }
}

function enterStandbyAfterSentence() {
  if (!sessionRunning) return;
  turnState = "standby";
  setMicHardwareEnabled(false);
  updateTranslationButtonsUI();
  setStatus("✅ 한 문장 번역·TTS 완료 — 다음 문장은 [2. 문장 번역] 버튼을 누르세요", "standby");
}

/* ─── Microphone Stream Initialization ─── */
async function startMicrophone() {
  const selectedMicId = micSelect?.value || undefined;
  const audioConstraints = {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
  if (selectedMicId) audioConstraints.deviceId = { exact: selectedMicId };

  mediaStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
  // [2. 문장 번역] 버튼을 누르기 전에는 하드웨어 마이크 트랙을 비활성화 상태로 유지
  setMicHardwareEnabled(turnState === "listening");
  await refreshMicDevices(true);

  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
  } catch {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  await audioContext.resume();

  sourceNode = audioContext.createMediaStreamSource(mediaStream);

  analyserNode = audioContext.createAnalyser();
  analyserNode.fftSize = 128;
  sourceNode.connect(analyserNode);
  updateMeter();

  // 버퍼 크기를 2048로 낮춰 음성 스트리밍 지연시간을 42ms로 대폭 단축
  processorNode = audioContext.createScriptProcessor(2048, 1, 1);
  processorNode.onaudioprocess = (event) => {
    if (!isReady1 && !isReady2) return;

    // [2. 문장 번역] 버튼을 눌러 "listening" 상태일 때만 실제 마이크 음성을 전송
    // 듣기 상태가 아닐 때는 불필요한 무음 패킷 전송을 중단하여 대역폭 및 서버 버퍼 지연 제거
    if (turnState !== "listening") {
      return;
    }

    const input = event.inputBuffer.getChannelData(0);
    const mono16k =
      audioContext.sampleRate === 16000
        ? input
        : resampleLinear(input, audioContext.sampleRate, 16000);

    // "listening" 상태에서 한 문장 발화 시작 및 종료(침묵) 감지
    let sumSq = 0;
    for (let i = 0; i < mono16k.length; i++) {
      sumSq += mono16k[i] * mono16k[i];
    }
    const rms = Math.sqrt(sumSq / mono16k.length);
    const now = Date.now();

    if (rms >= 0.015) {
      if (!voiceDetectedInSentence) {
        voiceDetectedInSentence = true;
        voiceStartAt = now;
      }
      lastVoiceAt = now;
    } else if (voiceDetectedInSentence && lastVoiceAt > 0) {
      const spokenDuration = lastVoiceAt - voiceStartAt;
      const silenceDuration = now - lastVoiceAt;
      const hasRecognizedText = currentSource.trim().length >= 2;
      const hasTranslationText = (currentTarget1.trim().length > 0 || currentTarget2.trim().length > 0);

      // 발화 후 침묵 감지 최적화: 번역 텍스트가 이미 생성 중이면 280ms, 인식 텍스트 있으면 350ms 만에 즉시 확정
      if (
        (hasTranslationText && silenceDuration >= 280) ||
        (hasRecognizedText && silenceDuration >= 350) ||
        (spokenDuration >= 200 && silenceDuration >= 450)
      ) {
        lockMicrophoneForSingleSentence();
        return;
      }
    }

    const pcm16 = float32ToInt16(mono16k);
    const data = base64FromBytes(new Uint8Array(pcm16.buffer));
    const payload = JSON.stringify({
      realtimeInput: {
        audio: { data, mimeType: "audio/pcm;rate=16000" },
      },
    });

    if (ws1 && ws1.readyState === WebSocket.OPEN && isReady1) {
      try {
        ws1.send(payload);
      } catch (_) {}
    }
    if (ws2 && ws2.readyState === WebSocket.OPEN && isReady2) {
      try {
        ws2.send(payload);
      } catch (_) {}
    }
  };

  sourceNode.connect(processorNode);

  const muteNode = audioContext.createGain();
  muteNode.gain.value = 0;
  processorNode.connect(muteNode);
  muteNode.connect(audioContext.destination);
}

function stopMicrophone() {
  if (meterAnimFrame) {
    cancelAnimationFrame(meterAnimFrame);
    meterAnimFrame = null;
  }
  if (analyserNode) {
    try {
      analyserNode.disconnect();
    } catch (_) {}
    analyserNode = null;
  }
  if (micMeterBar) micMeterBar.style.width = "0%";
  if (processorNode) {
    processorNode.disconnect();
    processorNode.onaudioprocess = null;
    processorNode = null;
  }
  if (sourceNode) {
    sourceNode.disconnect();
    sourceNode = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
}

/* ─── WebSocket Connection Setup ─── */
function createTranslationWebSockets(wsUrl, config, onBothReady, onError) {
  isReady1 = false;
  isReady2 = false;

  let hasEnded = false;
  let setupTimer = null;

  const notifyError = (err) => {
    if (hasEnded) return;
    hasEnded = true;
    if (setupTimer) clearTimeout(setupTimer);
    if (onError) onError(err);
  };

  const checkBothReady = () => {
    if (hasEnded) return;
    if (isReady1 && isReady2) {
      if (setupTimer) clearTimeout(setupTimer);
      if (onBothReady) onBothReady();
    }
  };

  setupTimer = setTimeout(() => {
    if (!isReady1 || !isReady2) {
      notifyError(new Error("Gemini 실시간 번역 서버 연결 시간 초과 (12초). API 키 또는 네트워크 상태를 확인하세요."));
    }
  }, 12000);

  if (ws1) {
    try {
      ws1.close(1000, "Reconnect");
    } catch (_) {}
  }
  if (ws2) {
    try {
      ws2.close(1000, "Reconnect");
    } catch (_) {}
  }

  try {
    ws1 = new WebSocket(wsUrl);
  } catch (err) {
    notifyError(new Error(`1차 번역 연결 생성 실패: ${err.message}`));
    return;
  }

  try {
    ws2 = new WebSocket(wsUrl);
  } catch (err) {
    notifyError(new Error(`2차 번역 연결 생성 실패: ${err.message}`));
    return;
  }

  ws1.onerror = (e) => {
    console.error("ws1 error:", e);
    if (!isReady1) {
      notifyError(new Error("1차 번역(베트남어) 서버 연결 실패. API 키나 인터넷 연결을 확인해주세요."));
    }
  };

  ws2.onerror = (e) => {
    console.error("ws2 error:", e);
    if (!isReady2) {
      notifyError(new Error("2차 번역(영어) 서버 연결 실패. API 키나 인터넷 연결을 확인해주세요."));
    }
  };

  ws1.onclose = (e) => {
    if (!isReady1 && e.code !== 1000) {
      notifyError(new Error(`1차 번역 연결 종료 (코드: ${e.code})`));
    }
  };

  ws2.onclose = (e) => {
    if (!isReady2 && e.code !== 1000) {
      notifyError(new Error(`2차 번역 연결 종료 (코드: ${e.code})`));
    }
  };

  ws1.onopen = () => {
    const setupMsg = {
      setup: {
        model: MODEL,
        generationConfig: {
          responseModalities: ["AUDIO"],
          translationConfig: {
            targetLanguageCode: config.target1.code,
            echoTargetLanguage: false,
          },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
    };
    try {
      ws1.send(JSON.stringify(setupMsg));
    } catch (err) {
      notifyError(err);
    }
  };

  ws1.onmessage = async (event) => {
    if (turnState !== "listening" && turnState !== "finalizing") return;
    const raw = typeof event.data === "string" ? event.data : await event.data.text();
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.setupComplete) {
      isReady1 = true;
      checkBothReady();
      return;
    }

    const content = msg.serverContent;
    if (!content) return;

    if (content.inputTranscription?.text && !ws1TurnDone) {
      currentSource += content.inputTranscription.text;
      refreshAllPanels();
      emitThrottledStreamUpdate();
      if (turnState === "finalizing") {
        scheduleSingleSentenceFinalize(180);
      }
    }

    if (content.outputTranscription?.text) {
      currentTarget1 += content.outputTranscription.text;
      refreshAllPanels();
      emitThrottledStreamUpdate();

      if (turnState === "listening" && lastVoiceAt > 0 && Date.now() - lastVoiceAt >= 250) {
        lockMicrophoneForSingleSentence();
      } else if (turnState === "finalizing") {
        scheduleSingleSentenceFinalize(ws2TurnDone ? 80 : 180);
      }
    }

    if (content.turnComplete) {
      ws1TurnDone = true;
      if (turnState === "listening") {
        lockMicrophoneForSingleSentence();
      }
      if (turnState === "finalizing") {
        scheduleSingleSentenceFinalize(ws2TurnDone || currentTarget2.trim().length > 0 ? 60 : 180);
      }
    }
  };

  ws2.onopen = () => {
    const setupMsg = {
      setup: {
        model: MODEL,
        generationConfig: {
          responseModalities: ["AUDIO"],
          translationConfig: {
            targetLanguageCode: config.target2.code,
            echoTargetLanguage: false,
          },
        },
        outputAudioTranscription: {},
      },
    };
    try {
      ws2.send(JSON.stringify(setupMsg));
    } catch (err) {
      notifyError(err);
    }
  };

  ws2.onmessage = async (event) => {
    if (turnState !== "listening" && turnState !== "finalizing") return;
    const raw = typeof event.data === "string" ? event.data : await event.data.text();
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.setupComplete) {
      isReady2 = true;
      checkBothReady();
      return;
    }

    const content = msg.serverContent;
    if (!content) return;

    if (content.outputTranscription?.text) {
      currentTarget2 += content.outputTranscription.text;
      refreshAllPanels();
      emitThrottledStreamUpdate();

      if (turnState === "listening" && lastVoiceAt > 0 && Date.now() - lastVoiceAt >= 250) {
        lockMicrophoneForSingleSentence();
      } else if (turnState === "finalizing") {
        scheduleSingleSentenceFinalize(ws1TurnDone ? 80 : 180);
      }
    }

    if (content.turnComplete) {
      ws2TurnDone = true;
      if (turnState === "listening") {
        lockMicrophoneForSingleSentence();
      }
      if (turnState === "finalizing") {
        scheduleSingleSentenceFinalize(ws1TurnDone || currentTarget1.trim().length > 0 ? 60 : 180);
      }
    }
  };

  // SetupComplete 메시지 대기 처리 (turnState가 standby일 때도 setupComplete는 통과해야 함)
  const attachSetupInterceptor = (ws, idx) => {
    const origHandler = ws.onmessage;
    ws.onmessage = async (event) => {
      const raw = typeof event.data === "string" ? event.data : await event.data.text();
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (msg.setupComplete) {
        if (idx === 1) isReady1 = true;
        if (idx === 2) isReady2 = true;
        checkBothReady();
        return;
      }
      if (origHandler) origHandler(event);
    };
  };

  attachSetupInterceptor(ws1, 1);
  attachSetupInterceptor(ws2, 2);
}

async function reconnectWebSocketsIfNeeded() {
  const wsUrl = await getGeminiProxyUrl();
  const config = LANG_CONFIGS[selectedLang];
  await new Promise((resolve) => {
    createTranslationWebSockets(wsUrl, config, resolve, () => resolve());
    setTimeout(resolve, 3000);
  });
}

/* ─── [1. 번역 시작] Button Handler ─── */
async function start() {
  if (sessionRunning) return;

  if (!isUserAuthenticated()) {
    showAuthOverlay();
    return;
  }

  try {
    unlockAudio();
    stopTts();

    sessionRunning = true;
    turnState = "standby";
    setStatus("연결 준비 중...", "idle");
    startBtn.disabled = true;

    const config = LANG_CONFIGS[selectedLang];
    const wsUrl = await getGeminiProxyUrl();

    await startMicrophone();
    setMicHardwareEnabled(false);

    await new Promise((resolve, reject) => {
      createTranslationWebSockets(
        wsUrl,
        config,
        () => {
          if (!sessionRunning) return;
          turnState = "standby";
          setMicHardwareEnabled(false);
          updateTranslationButtonsUI();
          refreshAllPanels();

          if (!timerHandle) {
            startedAt = Date.now();
            timerHandle = setInterval(updateTimer, 1000);
          }

          setStatus(
            "✅ 번역 준비 완료 — [2. 문장 번역] 버튼을 누르고 한 문장씩 말씀하세요",
            "standby"
          );

          emitListenerEvent({
            type: "session_status",
            status: "live",
            sourceLang: selectedLang,
            sourceName: config.name,
            target1Lang: config.target1.code,
            target2Lang: config.target2.code,
          });
          resolve();
        },
        (err) => {
          reject(err);
        }
      );
    });
  } catch (error) {
    console.error("세션 시작 실패:", error);
    setStatus(`오류: ${error.message}`, "error");
    sessionRunning = false;
    turnState = "idle";
    startBtn.disabled = false;
    startBtn.textContent = "🚀 1. 번역 시작";
    startBtn.classList.remove("is-connected");
    updateTranslationButtonsUI();
    stop();
    alert(`번역 시작 실패:\n${error.message}`);
  }
}

/* ─── [중지] Button Handler ─── */
function stop() {
  sessionRunning = false;

  if (commitTimeout) {
    clearTimeout(commitTimeout);
    commitTimeout = null;
  }
  if (maxListenTimeout) {
    clearTimeout(maxListenTimeout);
    maxListenTimeout = null;
  }

  if (
    (turnState === "listening" || turnState === "finalizing") &&
    (currentSource.trim() || currentTarget1.trim() || currentTarget2.trim())
  ) {
    turnState = "finalizing";
    finalizeSingleSentence();
  }

  stopTts();
  stopMicrophone();

  if (ws1) {
    try {
      ws1.close(1000, "User stopped");
    } catch (_) {}
    ws1 = null;
  }
  if (ws2) {
    try {
      ws2.close(1000, "User stopped");
    } catch (_) {}
    ws2 = null;
  }

  isReady1 = false;
  isReady2 = false;
  turnState = "idle";
  updateTranslationButtonsUI();
  refreshAllPanels();

  clearInterval(timerHandle);
  timerHandle = null;
  if (timerBadge) timerBadge.textContent = "00:00";
  if (timerEl) timerEl.textContent = "00:00";

  setStatus("대기 중 ([1. 번역 시작] 버튼을 누르세요)", "idle");

  emitListenerEvent({
    type: "session_status",
    status: "idle",
  });
}

/* ─── Event Listeners ─── */
startBtn?.addEventListener("click", start);
sentenceTranslateBtn?.addEventListener("click", startSingleSentenceTurn);
stopBtn?.addEventListener("click", stop);

clearBtn?.addEventListener("click", () => {
  stopTts();
  if (historyList) historyList.innerHTML = "";
  currentSource = "";
  currentTarget1 = "";
  currentTarget2 = "";
  committedCurrent = null;
  allSpokenSourceLines = [];
  prevSourceLines = [];
  prevTarget1Lines = [];
  prevTarget2Lines = [];
  pendingShiftedTurn = null;
  if (currentTtsText) {
    currentTtsText.textContent = "문장 번역이 완료되면 자동으로 음성이 출력됩니다.";
  }
  refreshAllPanels();
  updateTranslationButtonsUI();

  emitListenerEvent({
    type: "clear",
  });
});

fontSizeEl?.addEventListener("input", () => {
  const sizeNum = Number(fontSizeEl.value);
  const currentPx = `${sizeNum}px`;
  const prevPx = `${Math.max(15, sizeNum - 8)}px`;
  if (target1CurrentText) target1CurrentText.style.fontSize = currentPx;
  if (target2CurrentText) target2CurrentText.style.fontSize = currentPx;
  document.querySelectorAll(".target-prev-list .prev-sentence-item").forEach((el) => {
    el.style.fontSize = prevPx;
  });
});

fullscreenBtn?.addEventListener("click", async () => {
  if (!document.fullscreenElement) {
    await document.documentElement.requestFullscreen();
  } else {
    await document.exitFullscreen();
  }
});

toggleSourceBtn?.addEventListener("click", () => togglePanel("source"));
toggleTarget1Btn?.addEventListener("click", () => togglePanel("target1"));
toggleTarget2Btn?.addEventListener("click", () => togglePanel("target2"));
translationOnlyBtn?.addEventListener("click", toggleTranslationOnlyMode);
optimizeScreenBtn?.addEventListener("click", toggleScreenOptimization);

preset2PartBtn?.addEventListener("click", () => {
  panelVisibility.source = true;
  if (panelVisibility.target1 && !panelVisibility.target2) {
    // 번역 2로 전환 (원문 + 번역 2 : 2개 부분만 표시)
    panelVisibility.target1 = false;
    panelVisibility.target2 = true;
  } else {
    // 번역 1로 전환 (원문 + 번역 1 : 2개 부분만 표시)
    panelVisibility.target1 = true;
    panelVisibility.target2 = false;
  }
  updatePanelVisibility();
});

preset3PartBtn?.addEventListener("click", () => {
  // 세부분 모드: 원문 + 번역 1 + 번역 2 (세부분 표시)
  panelVisibility.source = true;
  panelVisibility.target1 = true;
  panelVisibility.target2 = true;
  updatePanelVisibility();
});

// Initial Setup
setLanguage(selectedLang);
applyScreenOptimization();
updatePanelVisibility();
updateTranslationButtonsUI();

// 🔒 Security PIN 2026 Enforcement on Screen Access
if (!isUserAuthenticated()) {
  showAuthOverlay();
} else {
  hideAuthOverlay();
}
