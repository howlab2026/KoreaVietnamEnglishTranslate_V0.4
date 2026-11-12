/**
 * 3-Way Multilingual Live Captioning
 * Supports Korean (KO), English (EN), and Vietnamese (VI).
 * Uses dual parallel Gemini 3.5 Live Translate WebSocket connections.
 */

const MODEL = "models/gemini-3.5-live-translate-preview";
const WS_ENDPOINT_BASE = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent";

const LANG_CONFIGS = {
  ko: {
    code: "ko",
    name: "한국어",
    flag: "🇰🇷",
    title: "🇰🇷 한국어 → 🇻🇳 베트남어 · 🇺🇸 영어",
    sourceLabel: "🇰🇷 한국어 원문 (발화)",
    sourcePlaceholder: "마이크를 시작하고 한국어로 말씀하시면 음성이 여기에 인식됩니다.",
    target1: {
      code: "vi",
      name: "베트남어",
      flag: "🇻🇳",
      label: "🇻🇳 TIẾNG VIỆT (베트남어 번역)",
      placeholder: "베트남어 번역이 여기에 실시간으로 표시됩니다.",
      instruction: "Bạn là thông dịch viên. Hãy dịch lời nói sang tiếng Việt một cách tự nhiên và chính xác. Bắt buộc chỉ xuất bản dịch bằng tiếng Việt (Vietnamese)."
    },
    target2: {
      code: "en",
      name: "영어",
      flag: "🇺🇸",
      label: "🇺🇸 ENGLISH (영어 번역)",
      placeholder: "영어 번역이 여기에 실시간으로 표시됩니다.",
      instruction: "You are an interpreter. Translate spoken audio accurately into natural English. You must only output in English."
    }
  },
  en: {
    code: "en",
    name: "English",
    flag: "🇺🇸",
    title: "🇺🇸 English → 🇻🇳 베트남어 · 🇰🇷 한국어",
    sourceLabel: "🇺🇸 English Original (Speech)",
    sourcePlaceholder: "Start the mic and speak in English. Transcript will appear here.",
    target1: {
      code: "vi",
      name: "베트남어",
      flag: "🇻🇳",
      label: "🇻🇳 TIẾNG VIỆT (베트남어 번역)",
      placeholder: "베트남어 번역이 여기에 실시간으로 표시됩니다.",
      instruction: "Bạn là thông dịch viên. Hãy dịch lời nói sang tiếng Việt một cách tự nhiên và chính xác. Bắt buộc chỉ xuất bản dịch bằng tiếng Việt (Vietnamese)."
    },
    target2: {
      code: "ko",
      name: "한국어",
      flag: "🇰🇷",
      label: "🇰🇷 한국어 (Korean 번역)",
      placeholder: "한국어 번역이 여기에 실시간으로 표시됩니다.",
      instruction: "당신은 전문 통역사입니다. 들리는 음성을 자연스럽고 정확한 한국어로 번역하세요. 반드시 한국어로만 출력해야 합니다."
    }
  },
  vi: {
    code: "vi",
    name: "Tiếng Việt",
    flag: "🇻🇳",
    title: "🇻🇳 Tiếng Việt → 🇺🇸 영어 · 🇰🇷 한국어",
    sourceLabel: "🇻🇳 Tiếng Việt Nguyên bản (Phát biểu)",
    sourcePlaceholder: "Bật mic và nói tiếng Việt. Văn bản nhận diện sẽ hiển thị ở đây.",
    target1: {
      code: "en",
      name: "영어",
      flag: "🇺🇸",
      label: "🇺🇸 ENGLISH (영어 번역)",
      placeholder: "영어 번역이 여기에 실시간으로 표시됩니다.",
      instruction: "You are an interpreter. Translate spoken audio accurately into natural English. You must only output in English."
    },
    target2: {
      code: "ko",
      name: "한국어",
      flag: "🇰🇷",
      label: "🇰🇷 한국어 (Korean 번역)",
      placeholder: "한국어 번역이 여기에 실시간으로 표시됩니다.",
      instruction: "당신은 전문 통역사입니다. 들리는 음성을 자연스럽고 정확한 한국어로 번역하세요. 반드시 한국어로만 출력해야 합니다."
    }
  }
};

const $ = (id) => document.getElementById(id);

// UI Elements
const mainTitle = $("mainTitle");
const statusEl = $("status");
const themeToggleBtn = $("themeToggleBtn");
const themeIcon = $("themeIcon");
const themeLabel = $("themeLabel");

// History Modal Elements
const historyModalBtn = $("historyModalBtn");
const historyModal = $("historyModal");
const closeHistoryModalBtn = $("closeHistoryModalBtn");
const clearHistoryBtn = $("clearHistoryBtn");
const timerBadge = $("timerBadge");

const startBtn = $("startBtn");
const stopBtn = $("stopBtn");
const clearBtn = $("clearBtn");
const fullscreenBtn = $("fullscreenBtn");
const fontSizeEl = $("fontSize");
const micSelect = $("micSelect");
const micRefreshBtn = $("micRefreshBtn");
const micMeterBar = $("micMeterBar");
const timerEl = $("timer");
const historyList = $("historyList");

const sourceLabel = $("sourceLabel");
const target1Label = $("target1Label");
const target2Label = $("target2Label");
const sourceText = $("sourceText");
const target1Text = $("target1Text");
const target2Text = $("target2Text");

// Panel Toggle Buttons & Text Elements
const toggleSourceBtn = $("toggleSourceBtn");
const toggleTarget1Btn = $("toggleTarget1Btn");
const toggleTarget2Btn = $("toggleTarget2Btn");
const toggleSourceText = $("toggleSourceText");
const toggleTarget1Text = $("toggleTarget1Text");
const toggleTarget2Text = $("toggleTarget2Text");

// Panel Visibility State (Default: all true)
const panelVisibility = {
  source: true,
  target1: true,
  target2: true
};

// Restore saved visibility preferences
try {
  const savedSource = localStorage.getItem("kv_panel_source");
  const savedTarget1 = localStorage.getItem("kv_panel_target1");
  const savedTarget2 = localStorage.getItem("kv_panel_target2");
  if (savedSource !== null) panelVisibility.source = savedSource === "true";
  if (savedTarget1 !== null) panelVisibility.target1 = savedTarget1 === "true";
  if (savedTarget2 !== null) panelVisibility.target2 = savedTarget2 === "true";

  // Prevent all being false
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
  if (icon) {
    icon.textContent = isVisible ? "👁️" : "🙈";
  }
}

function updatePanelVisibility() {
  const panelsEl = document.querySelector(".panels");
  if (!panelsEl) return;

  const sPanel = $("sourcePanel");
  const t1Panel = $("target1Panel");
  const t2Panel = $("target2Panel");

  // Toggle individual panel display
  sPanel?.classList.toggle("is-hidden", !panelVisibility.source);
  t1Panel?.classList.toggle("is-hidden", !panelVisibility.target1);
  t2Panel?.classList.toggle("is-hidden", !panelVisibility.target2);

  // Toggle container adaptive grid classes
  panelsEl.classList.toggle("hide-source", !panelVisibility.source);
  panelsEl.classList.toggle("hide-target-1", !panelVisibility.target1);
  panelsEl.classList.toggle("hide-target-2", !panelVisibility.target2);

  // Update button visual states
  updateToggleButtonState(toggleSourceBtn, panelVisibility.source);
  updateToggleButtonState(toggleTarget1Btn, panelVisibility.target1);
  updateToggleButtonState(toggleTarget2Btn, panelVisibility.target2);

  // Persist to localStorage
  try {
    localStorage.setItem("kv_panel_source", String(panelVisibility.source));
    localStorage.setItem("kv_panel_target1", String(panelVisibility.target1));
    localStorage.setItem("kv_panel_target2", String(panelVisibility.target2));
  } catch (_) {}
}

function togglePanel(panelKey) {
  const activeCount = Object.values(panelVisibility).filter(Boolean).length;
  // Prevent closing the last visible panel
  if (panelVisibility[panelKey] && activeCount <= 1) {
    alert("최소 1개의 창은 화면에 표시되어야 합니다.");
    return;
  }

  panelVisibility[panelKey] = !panelVisibility[panelKey];
  updatePanelVisibility();
}

const langBtns = {
  ko: $("langKoBtn"),
  en: $("langEnBtn"),
  vi: $("langViBtn")
};

// State
let selectedLang = "ko";
let ws1 = null; // target1
let ws2 = null; // target2
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

let currentSource = "";
let currentTarget1 = "";
let currentTarget2 = "";
let committedSourceLines = [];
let committedTarget1Lines = [];
let committedTarget2Lines = [];
let turnActive1 = false;
let turnActive2 = false;
let commitTimeout = null;
let ttsResumeTimeout = null;
let ttsSafetyTimeout = null;

// Continuous Session + Per-Sentence Lock & Anti-Howling State
let sessionRunning = false;
let sentenceMicLocked = false;
let hasCommittedSentence = false;
let isTtsGuardActive = false;
let ws1TurnDone = false;
let ws2TurnDone = false;
let voiceDetectedInSentence = false;
let voiceStartAt = 0;
let lastVoiceAt = 0;
let isTtsPlayingOnListener = false;

// Listener Broadcast Channel & WebSocket
const broadcastChannel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("live_translation_stream") : null;
let broadcastWs = null;

function handleListenerTtsStatus(speaking) {
  isTtsPlayingOnListener = Boolean(speaking);
  if (!sessionRunning) return;

  if (isTtsPlayingOnListener) {
    // TTS 재생이 시작되면 자동 재개 타이머를 취소하고 마이크 잠금 유지
    if (ttsResumeTimeout) {
      clearTimeout(ttsResumeTimeout);
      ttsResumeTimeout = null;
    }
    if (!sentenceMicLocked) {
      lockMicrophoneForSingleSentence();
    }
    setStatus("🔇 TTS 음성 출력 중 (하울링 차단 · 끝나면 자동 이어말하기)", "live");
  } else if (isTtsGuardActive || hasCommittedSentence) {
    // TTS 재생이 끝났으므로 스피커 잔향 소멸(600ms) 후 자동으로 다음 문장 마이크 활성화
    if (ttsResumeTimeout) clearTimeout(ttsResumeTimeout);
    ttsResumeTimeout = setTimeout(() => {
      resumeNextSentenceTurn();
    }, 600);
  }
}

if (broadcastChannel) {
  broadcastChannel.onmessage = (e) => {
    const data = e.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "tts_status") {
      handleListenerTtsStatus(data.speaking);
    }
  };
}

/* ─── Speaker Auth (토큰 또는 클라우드/로컬 지원) ─── */
const WS_PROTO = location.protocol === "https:" ? "wss:" : "ws:";
let speakerToken = "";
let isServerlessEnv = false;
try { speakerToken = sessionStorage.getItem("kv_speaker_token") || ""; } catch (_) {}

async function fetchSpeakerStatus() {
  const res = await fetch("/api/speaker-status", { cache: "no-store" });
  const data = await res.json();
  if (typeof data.serverless === "boolean") {
    isServerlessEnv = data.serverless;
  }
  return data;
}

/** 토큰이 필요한 서버면 입력받고, 허용되지 않는 접속이면 오류를 던진다 */
async function ensureSpeakerAuth(forcePrompt = false) {
  const status = await fetchSpeakerStatus();
  if (status.tokenRequired) {
    if (forcePrompt || !speakerToken) {
      const input = (prompt("화자 인증 토큰(SPEAKER_TOKEN)을 입력하세요") || "").trim();
      if (!input) throw new Error("화자 인증 토큰이 필요합니다.");
      speakerToken = input;
      try { sessionStorage.setItem("kv_speaker_token", input); } catch (_) {}
    }
  } else if (status.allowed === false) {
    throw new Error("화자 모드는 서버 PC에서만 사용할 수 있습니다. 외부 접속은 서버 .env에 SPEAKER_TOKEN을 설정하세요.");
  }
  return status;
}

function clearSpeakerToken() {
  speakerToken = "";
  try { sessionStorage.removeItem("kv_speaker_token"); } catch (_) {}
}

async function connectBroadcastWs() {
  let status;
  try {
    status = await fetchSpeakerStatus();
  } catch (_) {
    return setTimeout(connectBroadcastWs, 3000);
  }
  // Vercel 등 서버리스 환경에서는 WebSocket 서버 대신 BroadcastChannel + HTTP 릴레이 사용
  if (status.serverless) return;
  // 스피커 권한이 없는 접속이면 방송 연결을 시도하지 않음(BroadcastChannel만 사용)
  if (!status.tokenRequired && status.allowed === false) return;
  // 토큰이 아직 없으면 세션 시작(start) 때 입력된 뒤 다시 시도
  if (status.tokenRequired && !speakerToken) return setTimeout(connectBroadcastWs, 3000);

  const wsUrl = `${WS_PROTO}//${location.host}/ws/broadcast?role=speaker&token=${encodeURIComponent(speakerToken)}`;
  let opened = false;
  try {
    broadcastWs = new WebSocket(wsUrl);
    broadcastWs.onopen = () => {
      opened = true;
      console.log("📡 Listener Broadcast WebSocket 연결됨 (화자)");
      // Send current state immediately
      emitListenerEvent({
        type: "session_status",
        status: sessionRunning ? "live" : "idle",
        sourceLang: selectedLang,
        target1Lang: LANG_CONFIGS[selectedLang]?.target1.code,
        target2Lang: LANG_CONFIGS[selectedLang]?.target2.code,
        currentSource,
        currentTarget1,
        currentTarget2,
      });
    };
    broadcastWs.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data?.type === "tts_status") {
          handleListenerTtsStatus(data.speaking);
        }
      } catch (_) {}
    };
    broadcastWs.onclose = () => {
      // 연결 자체가 거부된 경우(토큰 오류) 다시 입력받도록 토큰 초기화
      if (!opened && status.tokenRequired) clearSpeakerToken();
      setTimeout(connectBroadcastWs, 3000);
    };
    broadcastWs.onerror = () => {
      try { broadcastWs.close(); } catch (_) {}
    };
  } catch (err) {
    console.warn("Broadcast WS init error:", err);
    setTimeout(connectBroadcastWs, 3000);
  }
}
connectBroadcastWs();

function emitListenerEvent(payload) {
  try {
    if (broadcastChannel) {
      broadcastChannel.postMessage(payload);
    }
  } catch (err) {
    console.warn("BroadcastChannel error:", err);
  }

  if (broadcastWs && broadcastWs.readyState === WebSocket.OPEN) {
    try {
      broadcastWs.send(JSON.stringify(payload));
    } catch (err) {
      console.warn("Broadcast WS send error:", err);
    }
  } else if (isServerlessEnv && payload && payload.type !== "stream_update") {
    fetch(`/api/broadcast?token=${encodeURIComponent(speakerToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }
}

// Throttle stream updates for smoother rendering
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

/* ─── Theme Management (Default: Light / Bright White) ─── */
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
  } catch {}
}

// Initialize theme (Default is light mode)
const initialTheme = localStorage.getItem("app_theme") || "light";
setTheme(initialTheme);

themeToggleBtn?.addEventListener("click", () => {
  const isDark = document.body.classList.contains("dark-theme");
  setTheme(isDark ? "light" : "dark");
});

/* ─── Sentence Auto Line Break Helpers ─── */
/**
 * 한 문장이 끝나면(., ?, ! 등) 다음 줄로 자동 줄변환
 */
function formatSentences(text) {
  if (!text) return "";
  // 1. 문장 종결 부호(., ?, !) 뒤에 공백이 있으면 줄바꿈으로 치환
  let formatted = text.replace(/([.?!])\s+/g, "$1\n");
  // 2. 문장 종결 부호 뒤에 바로 다음 글자가 붙는 경우 줄바꿈 삽입
  formatted = formatted.replace(/([.?!])(?=[^\d\s\n.?!])/g, "$1\n");
  // 3. 3줄 이상의 불필요한 연속 개행 정리
  formatted = formatted.replace(/\n{3,}/g, "\n\n");
  return formatted;
}

/**
 * 새로운 문장 턴이 시작될 때 이전 문장 뒤에 개행을 붙여 다음 줄로 이어지게 함
 */
function appendTurnBreak(text, maxLines = 15) {
  if (!text || !text.trim()) return "";
  let trimmed = text.trim();
  if (!/[.?!]$/.test(trimmed)) {
    trimmed += ".";
  }
  const lines = trimmed.split("\n");
  const recent = lines.length > maxLines ? lines.slice(lines.length - maxLines) : lines;
  return recent.join("\n") + "\n";
}

/**
 * 패널 텍스트를 문장 줄바꿈 포맷팅하여 표시하고 아래로 자동 스크롤
 */
function updatePanel(element, rawText) {
  if (!element) return;
  element.textContent = formatSentences(rawText);
  element.scrollTop = element.scrollHeight;
}

/* ─── Status Badge ─── */
function setStatus(text, kind = "idle") {
  statusEl.textContent = text;
  statusEl.className = `status ${kind}`;
}

/* ─── Apply Language Selection ─── */
function setLanguage(langKey) {
  if (!LANG_CONFIGS[langKey]) return;
  if (ws1 || ws2) {
    stop();
  }

  selectedLang = langKey;
  const config = LANG_CONFIGS[langKey];

  // Update button active state
  Object.keys(langBtns).forEach((k) => {
    langBtns[k]?.classList.toggle("active", k === langKey);
  });

  // Update header & panel texts
  mainTitle.textContent = config.title;
  sourceLabel.textContent = config.sourceLabel;
  sourceText.textContent = config.sourcePlaceholder;
  target1Label.textContent = config.target1.label;
  target1Text.textContent = config.target1.placeholder;
  target2Label.textContent = config.target2.label;
  target2Text.textContent = config.target2.placeholder;

  const target1Panel = $("target1Panel");
  const target2Panel = $("target2Panel");
  if (target1Panel) target1Panel.dataset.targetLang = config.target1.code;
  if (target2Panel) target2Panel.dataset.targetLang = config.target2.code;

  // Update toggle button labels
  if (toggleSourceText) toggleSourceText.textContent = `원문 (${config.name})`;
  if (toggleTarget1Text) toggleTarget1Text.textContent = `번역 1 (${config.target1.name})`;
  if (toggleTarget2Text) toggleTarget2Text.textContent = `번역 2 (${config.target2.name})`;

  currentSource = "";
  currentTarget1 = "";
  currentTarget2 = "";
  committedSourceLines = [];
  committedTarget1Lines = [];
  committedTarget2Lines = [];
  turnActive1 = false;
  turnActive2 = false;

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

// Bind language buttons
Object.entries(langBtns).forEach(([langKey, btn]) => {
  btn?.addEventListener("click", () => setLanguage(langKey));
});

/* ─── Mic Device Monitoring & Auto-Refresh ─── */
let knownDeviceSignature = "";

/**
 * Request audio permission briefly if labels are obscured/blank,
 * allowing browser to show actual hardware names (e.g. USB Microphone).
 */
async function unlockMicLabels() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch (err) {
    console.warn("마이크 권한 요청 실패/거절됨:", err);
    return false;
  }
}

/**
 * Enumerates all audio input devices and updates the <select> element.
 * Skips unnecessary DOM rebuilds if device list has not changed.
 */
async function refreshMicDevices(force = false) {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter((d) => d.kind === "audioinput");

    const signature = audioInputs
      .map((d) => `${d.deviceId}::${d.label}`)
      .sort()
      .join("||");

    if (!force && signature === knownDeviceSignature) {
      return;
    }
    knownDeviceSignature = signature;

    const previousValue = micSelect.value || localStorage.getItem("preferred_mic_id") || "";
    let matched = false;

    micSelect.innerHTML = `<option value="">기본 마이크 (Default)</option>`;

    audioInputs.forEach((device, index) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      // If label is empty, indicate permission may be needed
      const displayName = device.label || `마이크 ${index + 1} (권한 필요)`;
      option.textContent = displayName;
      if (device.deviceId && device.deviceId === previousValue) {
        option.selected = true;
        matched = true;
      }
      micSelect.appendChild(option);
    });

    // If currently selected device was disconnected while streaming, fall back to default
    if (previousValue && !matched && previousValue !== "") {
      console.log("선택된 마이크 장치 연결 끊김 감지 → 기본 마이크로 전환");
      micSelect.value = "";
      localStorage.removeItem("preferred_mic_id");
      if (mediaStream) {
        stopMicrophone();
        await startMicrophone();
      }
    }
  } catch (err) {
    console.warn("마이크 장치 목록 확인 실패:", err);
  }
}

// 1. Continuous background polling (every 1.5s) to detect USB plug/unplug immediately
setInterval(() => refreshMicDevices(false), 1500);

// 2. Browser hardware change event
navigator.mediaDevices?.addEventListener("devicechange", () => {
  console.log("오디오 장치 변경 이벤트(devicechange) 감지");
  refreshMicDevices(true);
});

// 3. Update immediately when user clicks or opens the dropdown
micSelect?.addEventListener("focus", () => refreshMicDevices(true));
micSelect?.addEventListener("mousedown", () => refreshMicDevices(true));

// 4. Manual refresh button: spins icon, unlocks labels if needed, and forces enumeration
micRefreshBtn?.addEventListener("click", async () => {
  micRefreshBtn.classList.add("spinning");
  try {
    await unlockMicLabels();
  } finally {
    await refreshMicDevices(true);
    setTimeout(() => micRefreshBtn.classList.remove("spinning"), 600);
  }
});

// 5. Seamless live device switching during active translation
micSelect?.addEventListener("change", async () => {
  const newId = micSelect.value;
  if (newId) {
    localStorage.setItem("preferred_mic_id", newId);
  } else {
    localStorage.removeItem("preferred_mic_id");
  }

  if (mediaStream) {
    console.log("스트리밍 중 마이크 장치 변경됨 → 새 마이크로 전환:", newId);
    stopMicrophone();
    await startMicrophone();
  }
});

// Initial discovery
refreshMicDevices(true);

/* ─── Audio level meter ─── */
function updateMeter() {
  if (!analyserNode) return;
  const data = new Uint8Array(analyserNode.frequencyBinCount);
  analyserNode.getByteFrequencyData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  const pct = Math.min(100, Math.round((sum / data.length / 64) * 100));
  if (micMeterBar) micMeterBar.style.width = `${pct}%`;
  meterAnimFrame = requestAnimationFrame(updateMeter);
}

/* ─── Base64 encode ─── */
function base64FromBytes(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/* ─── History ─── */
function addHistory(src, t1, t2, config) {
  if (!src.trim() && !t1.trim() && !t2.trim()) return;

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

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ─── Timer ─── */
function updateTimer() {
  const sec = Math.floor((Date.now() - startedAt) / 1000);
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  const timeStr = `${mm}:${ss}`;
  if (timerEl) timerEl.textContent = timeStr;
  if (timerBadge) timerBadge.textContent = timeStr;
}

/* ─── History Modal Control ─── */
function openHistoryModal() {
  historyModal?.classList.remove("hidden");
}

function closeHistoryModal() {
  historyModal?.classList.add("hidden");
}

historyModalBtn?.addEventListener("click", openHistoryModal);
closeHistoryModalBtn?.addEventListener("click", closeHistoryModal);
clearHistoryBtn?.addEventListener("click", () => {
  if (historyList) historyList.innerHTML = "";
});

historyModal?.addEventListener("click", (e) => {
  if (e.target === historyModal) {
    closeHistoryModal();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !historyModal?.classList.contains("hidden")) {
    closeHistoryModal();
  }
});

/* ─── Audio Helpers ─── */
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

/* ─── Gemini 연결 URL (로컬 서버 프록시 또는 Vercel/클라우드 직접 연결) ─── */
let _cachedApiKey = null;
async function getGeminiProxyUrl() {
  const status = await ensureSpeakerAuth();
  if (status.serverless || !status.geminiConfigured) {
    if (!_cachedApiKey) {
      if (status.geminiConfigured) {
        const res = await fetch(`/api/key?token=${encodeURIComponent(speakerToken)}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || !data.key) {
          if (res.status === 401) clearSpeakerToken();
          throw new Error(data.error || "API 키 발급 실패");
        }
        _cachedApiKey = data.key;
      } else {
        let savedKey = "";
        try { savedKey = localStorage.getItem("kv_gemini_api_key") || ""; } catch (_) {}
        if (!savedKey) {
          savedKey = (prompt("Vercel 환경변수에 GEMINI_API_KEY가 아직 설정되지 않았습니다.\nGemini API 키를 입력하시면 바로 사용 가능합니다:") || "").trim();
          if (!savedKey) {
            throw new Error("Vercel 환경변수(GEMINI_API_KEY)를 설정하거나 API 키를 입력해주세요.");
          }
          try { localStorage.setItem("kv_gemini_api_key", savedKey); } catch (_) {}
        }
        _cachedApiKey = savedKey;
      }
    }
    return `${WS_ENDPOINT_BASE}?key=${encodeURIComponent(_cachedApiKey)}`;
  }
  return `${WS_PROTO}//${location.host}/ws/gemini?token=${encodeURIComponent(speakerToken)}`;
}

/* ─── Single-Sentence Turn Lock & Auto-Resume (연속 번역 유지 + 하울링 원천 차단) ─── */
function buildDisplayText(committedArr, activeSentence) {
  const lines = [...committedArr];
  const cleanActive = (activeSentence || "").replace(/\s+/g, " ").trim();
  if (cleanActive) lines.push(cleanActive);
  return lines.join("\n");
}

function refreshAllPanels() {
  const sDisplay = buildDisplayText(committedSourceLines, currentSource);
  const t1Display = buildDisplayText(committedTarget1Lines, currentTarget1);
  const t2Display = buildDisplayText(committedTarget2Lines, currentTarget2);

  if (sDisplay) updatePanel(sourceText, sDisplay);
  if (t1Display) updatePanel(target1Text, t1Display);
  if (t2Display) updatePanel(target2Text, t2Display);
}

function lockMicrophoneForSingleSentence() {
  if (sentenceMicLocked || hasCommittedSentence) return;
  sentenceMicLocked = true;

  // 하드웨어 마이크 트랙 즉시 음소거 (하울링/추가 발화 유입 차단)
  if (mediaStream) {
    mediaStream.getAudioTracks().forEach((track) => {
      track.enabled = false;
    });
  }
  if (micMeterBar) micMeterBar.style.width = "0%";

  setStatus("🔒 문장 번역 확정 중... (하울링 방지 마이크 일시 차단)", "live");
  scheduleSingleSentenceFinalize(1000);
}

function scheduleSingleSentenceFinalize(delayMs = 550) {
  if (hasCommittedSentence) return;
  if (commitTimeout) clearTimeout(commitTimeout);
  commitTimeout = setTimeout(() => {
    finalizeSingleSentence();
  }, delayMs);
}

function resumeNextSentenceTurn() {
  if (!sessionRunning) return;

  if (ttsResumeTimeout) {
    clearTimeout(ttsResumeTimeout);
    ttsResumeTimeout = null;
  }
  if (ttsSafetyTimeout) {
    clearTimeout(ttsSafetyTimeout);
    ttsSafetyTimeout = null;
  }

  currentSource = "";
  currentTarget1 = "";
  currentTarget2 = "";
  sentenceMicLocked = false;
  hasCommittedSentence = false;
  isTtsGuardActive = false;
  ws1TurnDone = false;
  ws2TurnDone = false;
  voiceDetectedInSentence = false;
  voiceStartAt = 0;
  lastVoiceAt = 0;

  // 마이크 트랙 다시 활성화 (번역 시작 버튼을 다시 누를 필요 없이 즉시 다음 문장 대기)
  if (mediaStream) {
    mediaStream.getAudioTracks().forEach((track) => {
      track.enabled = true;
    });
  }

  const config = LANG_CONFIGS[selectedLang];
  setStatus(`🎤 번역 중 — 다음 문장을 말씀하세요 (${config.flag} → ${config.target1.flag} · ${config.target2.flag})`, "live");
}

function finalizeSingleSentence() {
  if (hasCommittedSentence) return;

  const sFinal = currentSource.replace(/\s+/g, " ").trim();
  const t1Final = currentTarget1.replace(/\s+/g, " ").trim();
  const t2Final = currentTarget2.replace(/\s+/g, " ").trim();

  if (!sFinal && !t1Final && !t2Final) {
    // 인식된 문장이 없으면 바로 다음 문장 대기 상태로 복귀
    resumeNextSentenceTurn();
    return;
  }

  hasCommittedSentence = true;
  sentenceMicLocked = true;
  isTtsGuardActive = true;

  if (commitTimeout) {
    clearTimeout(commitTimeout);
    commitTimeout = null;
  }

  // 1. 마이크 하드웨어 트랙을 확실히 잠근 상태에서 완성된 문장을 확정 목록에 고정 (절대 다른 말로 변하지 않음)
  if (mediaStream) {
    mediaStream.getAudioTracks().forEach((track) => {
      track.enabled = false;
    });
  }
  if (micMeterBar) micMeterBar.style.width = "0%";

  if (sFinal) {
    committedSourceLines.push(sFinal);
    if (committedSourceLines.length > 15) committedSourceLines.shift();
  }
  if (t1Final) {
    committedTarget1Lines.push(t1Final);
    if (committedTarget1Lines.length > 15) committedTarget1Lines.shift();
  }
  if (t2Final) {
    committedTarget2Lines.push(t2Final);
    if (committedTarget2Lines.length > 15) committedTarget2Lines.shift();
  }

  // 현재 턴 버퍼 즉시 초기화 (이전 문장이 수정되는 현상 원천 차단)
  currentSource = "";
  currentTarget1 = "";
  currentTarget2 = "";

  // 2. 화면 패널 및 번역 기록(히스토리) 갱신
  refreshAllPanels();
  addHistory(sFinal, t1Final, t2Final, LANG_CONFIGS[selectedLang]);

  // 3. 청취자 화면(TTS)으로 완성된 1문장 전송
  emitListenerEvent({
    type: "sentence_commit",
    sourceLang: selectedLang,
    sourceSentence: sFinal,
    fullSource: committedSourceLines.join("\n"),
    target1Lang: LANG_CONFIGS[selectedLang].target1.code,
    target1Sentence: t1Final,
    fullTarget1: committedTarget1Lines.join("\n"),
    target2Lang: LANG_CONFIGS[selectedLang].target2.code,
    target2Sentence: t2Final,
    fullTarget2: committedTarget2Lines.join("\n"),
    timestamp: Date.now()
  });

  if (!sessionRunning) return;

  setStatus("🔇 문장 확정 완료 (TTS 하울링 차단 중 · 잠시 후 자동 마이크 켜짐)", "live");

  // 4. 청취자 화면에서 TTS가 실행되지 않는 경우에도 850ms 후 자동으로 마이크를 다시 켜서 계속 말할 수 있게 함
  //    (만약 청취자 화면에서 TTS가 시작되면 handleListenerTtsStatus가 이 타이머를 취소하고 TTS 종료 시점에 재개함)
  if (ttsResumeTimeout) clearTimeout(ttsResumeTimeout);
  ttsResumeTimeout = setTimeout(() => {
    if (!isTtsPlayingOnListener) {
      resumeNextSentenceTurn();
    }
  }, 850);

  // 안전 타이머: TTS 종료 신호가 누락되더라도 최대 대기 시간 후 자동으로 마이크 재개
  const maxWaitMs = Math.min(10000, Math.max(3000, Math.max(t1Final.length, t2Final.length) * 120));
  if (ttsSafetyTimeout) clearTimeout(ttsSafetyTimeout);
  ttsSafetyTimeout = setTimeout(() => {
    isTtsPlayingOnListener = false;
    resumeNextSentenceTurn();
  }, maxWaitMs);
}

/* ─── Microphone ─── */
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

  processorNode = audioContext.createScriptProcessor(4096, 1, 1);
  processorNode.onaudioprocess = (event) => {
    if (!isReady1 && !isReady2) return;

    const input = event.inputBuffer.getChannelData(0);
    const mono16k =
      audioContext.sampleRate === 16000
        ? input
        : resampleLinear(input, audioContext.sampleRate, 16000);

    // 마이크가 잠긴 상태(1문장 발화 직후 번역 확정 대기 또는 TTS 재생 중)에는
    // 순수 무음(0)만 전송하여 Gemini가 즉시 문장 번역을 끝내게 하고 외부 소리/하울링 유입을 원천 차단
    if (sentenceMicLocked || isTtsPlayingOnListener || isTtsGuardActive || hasCommittedSentence) {
      const silentPcm = new Int16Array(mono16k.length);
      const silentData = base64FromBytes(new Uint8Array(silentPcm.buffer));
      const silentPayload = JSON.stringify({
        realtimeInput: {
          audio: { data: silentData, mimeType: "audio/pcm;rate=16000" },
        },
      });
      if (ws1 && ws1.readyState === WebSocket.OPEN && isReady1) {
        try { ws1.send(silentPayload); } catch {}
      }
      if (ws2 && ws2.readyState === WebSocket.OPEN && isReady2) {
        try { ws2.send(silentPayload); } catch {}
      }
      return;
    }

    // 음성 에너지(RMS) 측정으로 한 문장 발화 시작 및 종료(침묵) 감지
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

      // 한 문장 발화 후 짧은 침묵(0.55초~0.75초)이 감지되면 즉시 마이크 입력을 끊고 해당 문장만 번역 확정
      if (
        (hasRecognizedText && silenceDuration >= 550) ||
        (spokenDuration >= 300 && silenceDuration >= 750)
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

    // Broadcast to both WebSockets in parallel
    if (ws1 && ws1.readyState === WebSocket.OPEN && isReady1) {
      try { ws1.send(payload); } catch (e) { console.error("WS1 send error:", e); }
    }
    if (ws2 && ws2.readyState === WebSocket.OPEN && isReady2) {
      try { ws2.send(payload); } catch (e) { console.error("WS2 send error:", e); }
    }
  };

  sourceNode.connect(processorNode);

  // Mute local output to avoid feedback loop
  const muteNode = audioContext.createGain();
  muteNode.gain.value = 0;
  processorNode.connect(muteNode);
  muteNode.connect(audioContext.destination);
}

function stopMicrophone() {
  if (meterAnimFrame) { cancelAnimationFrame(meterAnimFrame); meterAnimFrame = null; }
  if (analyserNode) { try { analyserNode.disconnect(); } catch {} analyserNode = null; }
  if (micMeterBar) micMeterBar.style.width = "0%";
  if (processorNode) { processorNode.disconnect(); processorNode.onaudioprocess = null; processorNode = null; }
  if (sourceNode) { sourceNode.disconnect(); sourceNode = null; }
  if (mediaStream) { mediaStream.getTracks().forEach((t) => t.stop()); mediaStream = null; }
  if (audioContext) { audioContext.close(); audioContext = null; }
}

/* ─── Start Dual Live Translation Session (Continuous + Per-Sentence Clean Cut) ─── */
async function start() {
  if (ws1 || ws2) return;

  try {
    sessionRunning = true;
    isTtsPlayingOnListener = false;
    emitListenerEvent({ type: "stop_tts" });

    setStatus("연결 준비 중...", "idle");
    startBtn.disabled = true;

    const config = LANG_CONFIGS[selectedLang];

    // 서버 프록시(/ws/gemini) 또는 클라우드 직접 연결
    const wsUrl = await getGeminiProxyUrl();

    turnActive1 = false;
    turnActive2 = false;
    isReady1 = false;
    isReady2 = false;
    sentenceMicLocked = false;
    hasCommittedSentence = false;
    isTtsGuardActive = false;
    ws1TurnDone = false;
    ws2TurnDone = false;
    voiceDetectedInSentence = false;
    voiceStartAt = 0;
    lastVoiceAt = 0;
    currentSource = "";
    currentTarget1 = "";
    currentTarget2 = "";

    if (committedSourceLines.length === 0) sourceText.textContent = "...";
    if (committedTarget1Lines.length === 0) target1Text.textContent = "...";
    if (committedTarget2Lines.length === 0) target2Text.textContent = "...";

    // Setup 1 (Target 1 + Input Audio Transcription)
    ws1 = new WebSocket(wsUrl);
    ws1.onopen = () => {
      console.log(`WS1 (${config.target1.name}: ${config.target1.code}) 연결됨`);
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
      ws1.send(JSON.stringify(setupMsg));
    };

    ws1.onmessage = async (event) => {
      if (hasCommittedSentence || isTtsGuardActive) return;
      const raw = typeof event.data === "string" ? event.data : await event.data.text();
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      if (msg.setupComplete) {
        console.log(`✅ WS1 (${config.target1.name}: ${config.target1.code}) setup 완료`);
        isReady1 = true;
        checkAllReady();
        return;
      }

      const content = msg.serverContent;
      if (!content) return;

      // 1문장 원문 음성 인식 (WS1 턴이 완료되기 전까지만 반영하여 다른 말로 변하는 현상 방지)
      if (content.inputTranscription?.text && !ws1TurnDone) {
        currentSource += content.inputTranscription.text;
        refreshAllPanels();
        emitThrottledStreamUpdate();
        if (sentenceMicLocked) {
          scheduleSingleSentenceFinalize(600);
        }
      }

      // Target 1 번역문 (outputTranscription만 사용하여 모델 내부 텍스트 혼입 차단)
      if (content.outputTranscription?.text) {
        currentTarget1 += content.outputTranscription.text;
        refreshAllPanels();
        emitThrottledStreamUpdate();

        // 번역 출력이 시작되었고 사용자가 말을 멈춘 상태라면 즉시 마이크 잠금
        if (!sentenceMicLocked && lastVoiceAt > 0 && Date.now() - lastVoiceAt >= 380) {
          lockMicrophoneForSingleSentence();
        } else if (sentenceMicLocked) {
          scheduleSingleSentenceFinalize(ws2TurnDone ? 220 : 600);
        }
      }

      if (content.turnComplete) {
        ws1TurnDone = true;
        lockMicrophoneForSingleSentence();
        if (ws2TurnDone || currentTarget2.trim().length > 0) {
          scheduleSingleSentenceFinalize(180);
        } else {
          scheduleSingleSentenceFinalize(600);
        }
      }
    };

    ws1.onerror = (e) => console.error("WS1 오류:", e);
    ws1.onclose = (e) => {
      console.log("WS1 종료:", e.code, e.reason);
      if (e.code !== 1000 && sessionRunning) {
        if (!isReady1) {
          _cachedApiKey = null;
          try { localStorage.removeItem("kv_gemini_api_key"); } catch (_) {}
          startBtn.disabled = false;
          sessionRunning = false;
        } else if (ws1 || ws2) {
          setStatus(`WS1 연결 끊김 (${e.code})`, "error");
        }
      }
    };

    // Setup 2 (Target 2 translation)
    ws2 = new WebSocket(wsUrl);
    ws2.onopen = () => {
      console.log(`WS2 (${config.target2.name}: ${config.target2.code}) 연결됨`);
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
      ws2.send(JSON.stringify(setupMsg));
    };

    ws2.onmessage = async (event) => {
      if (hasCommittedSentence || isTtsGuardActive) return;
      const raw = typeof event.data === "string" ? event.data : await event.data.text();
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      if (msg.setupComplete) {
        console.log(`✅ WS2 (${config.target2.name}: ${config.target2.code}) setup 완료`);
        isReady2 = true;
        checkAllReady();
        return;
      }

      const content = msg.serverContent;
      if (!content) return;

      // Target 2 번역문 (outputTranscription만 사용)
      if (content.outputTranscription?.text) {
        currentTarget2 += content.outputTranscription.text;
        refreshAllPanels();
        emitThrottledStreamUpdate();

        if (!sentenceMicLocked && lastVoiceAt > 0 && Date.now() - lastVoiceAt >= 380) {
          lockMicrophoneForSingleSentence();
        } else if (sentenceMicLocked) {
          scheduleSingleSentenceFinalize(ws1TurnDone ? 220 : 600);
        }
      }

      if (content.turnComplete) {
        ws2TurnDone = true;
        lockMicrophoneForSingleSentence();
        if (ws1TurnDone || currentTarget1.trim().length > 0) {
          scheduleSingleSentenceFinalize(180);
        } else {
          scheduleSingleSentenceFinalize(600);
        }
      }
    };

    ws2.onerror = (e) => console.error("WS2 오류:", e);
    ws2.onclose = (e) => {
      console.log("WS2 종료:", e.code, e.reason);
      if (e.code !== 1000 && sessionRunning && (ws1 || ws2)) {
        setStatus(`WS2 연결 끊김 (${e.code})`, "error");
      }
    };

    async function checkAllReady() {
      if (isReady1 && isReady2 && !mediaStream) {
        setStatus(`🎤 번역 중 — 말씀하세요 (${config.flag} → ${config.target1.flag} · ${config.target2.flag})`, "live");
        stopBtn.disabled = false;
        startedAt = Date.now();
        timerHandle = setInterval(updateTimer, 1000);
        await startMicrophone();

        emitListenerEvent({
          type: "session_status",
          status: "live",
          sourceLang: selectedLang,
          sourceName: config.name,
          target1Lang: config.target1.code,
          target2Lang: config.target2.code,
        });
      }
    }
  } catch (error) {
    console.error("세션 시작 실패:", error);
    setStatus(`오류: ${error.message}`, "error");
    sessionRunning = false;
    startBtn.disabled = false;
    stop();
  }
}

/* ─── Stop Session ─── */
function stop() {
  sessionRunning = false;

  if (commitTimeout) {
    clearTimeout(commitTimeout);
    commitTimeout = null;
  }
  if (ttsResumeTimeout) {
    clearTimeout(ttsResumeTimeout);
    ttsResumeTimeout = null;
  }
  if (ttsSafetyTimeout) {
    clearTimeout(ttsSafetyTimeout);
    ttsSafetyTimeout = null;
  }

  // 아직 확정되지 않은 텍스트가 있으면 마지막 문장으로 확정 처리
  if (!hasCommittedSentence && (currentSource.trim() || currentTarget1.trim() || currentTarget2.trim())) {
    finalizeSingleSentence();
  }

  stopMicrophone();

  if (ws1) { try { ws1.close(1000, "User stopped"); } catch {} ws1 = null; }
  if (ws2) { try { ws2.close(1000, "User stopped"); } catch {} ws2 = null; }

  isReady1 = false;
  isReady2 = false;
  turnActive1 = false;
  turnActive2 = false;
  sentenceMicLocked = false;
  hasCommittedSentence = false;
  isTtsGuardActive = false;
  stopBtn.disabled = true;
  startBtn.disabled = false;

  clearInterval(timerHandle);
  timerHandle = null;
  if (timerBadge) timerBadge.textContent = "00:00";
  if (timerEl) timerEl.textContent = "00:00";

  setStatus("대기 중", "idle");

  emitListenerEvent({
    type: "session_status",
    status: "idle",
  });
}

/* ─── Event Listeners ─── */
startBtn.addEventListener("click", start);
stopBtn.addEventListener("click", stop);

clearBtn.addEventListener("click", () => {
  historyList.innerHTML = "";
  const config = LANG_CONFIGS[selectedLang];
  sourceText.textContent = config.sourcePlaceholder;
  target1Text.textContent = config.target1.placeholder;
  target2Text.textContent = config.target2.placeholder;
  currentSource = "";
  currentTarget1 = "";
  currentTarget2 = "";
  committedSourceLines = [];
  committedTarget1Lines = [];
  committedTarget2Lines = [];
  turnActive1 = false;
  turnActive2 = false;

  emitListenerEvent({
    type: "clear",
  });
});

fontSizeEl.addEventListener("input", () => {
  const size = `${fontSizeEl.value}px`;
  target1Text.style.fontSize = size;
  target2Text.style.fontSize = size;
});

fullscreenBtn.addEventListener("click", async () => {
  if (!document.fullscreenElement) {
    await document.documentElement.requestFullscreen();
  } else {
    await document.exitFullscreen();
  }
});

/* ─── Panel Toggle Event Listeners ─── */
toggleSourceBtn?.addEventListener("click", () => togglePanel("source"));
toggleTarget1Btn?.addEventListener("click", () => togglePanel("target1"));
toggleTarget2Btn?.addEventListener("click", () => togglePanel("target2"));

// Initial setup
setLanguage(selectedLang);
updatePanelVisibility();

