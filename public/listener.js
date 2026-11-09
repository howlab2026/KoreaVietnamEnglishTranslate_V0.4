/**
 * Real-time Multilingual Translation & Multi-Voice Natural Neural TTS Listener
 * Supports Korean (ko), English (en), and Vietnamese (vi) with ultra-realistic AI neural voices.
 */

const $ = (id) => document.getElementById(id);

// UI Elements
const audioUnlockBanner = $("audioUnlockBanner");
const unlockAudioBtn = $("unlockAudioBtn");
const connectionStatus = $("connectionStatus");
const statusText = $("statusText");
const speakerBadge = $("speakerBadge");
const speakerLangDisplay = $("speakerLangDisplay");
const themeToggleBtn = $("themeToggleBtn");
const themeIcon = $("themeIcon");
const themeLabel = $("themeLabel");

// Current TTS Card Elements (Top-left display)
const currentTtsText = $("currentTtsText");
const currentTtsSourceText = $("currentTtsSourceText");
const currentTtsSourceContainer = $("currentTtsSourceContainer");
const replayCurrentTtsBtn = $("replayCurrentTtsBtn");
const stopTtsBtn = $("stopTtsBtn");
const ttsSpeakingIndicator = $("ttsSpeakingIndicator");

// Language Buttons (Strictly Korean, English, Vietnamese only)
const langBtns = {
  ko: $("targetKoBtn"),
  en: $("targetEnBtn"),
  vi: $("targetViBtn")
};

// TTS Controls
const autoTtsToggle = $("autoTtsToggle");
const voiceSelect = $("voiceSelect");
const voiceCountBadge = $("voiceCountBadge");
const testVoiceBtn = $("testVoiceBtn");
const ttsRate = $("ttsRate");
const ttsPitch = $("ttsPitch");
const ttsVolume = $("ttsVolume");
const rateValue = $("rateValue");
const pitchValue = $("pitchValue");
const volumeValue = $("volumeValue");

// Display Controls (Right Two-Pane Dialogue Area)
const fontSizeRange = $("fontSizeRange");
const fontSizeDisplay = $("fontSizeDisplay");
const showSourceCheckbox = $("showSourceCheckbox");
const liveCurrentText = $("liveCurrentText");
const liveTargetText = $("liveTargetText");
const historyLineCount = $("historyLineCount");
const liveSourceContainer = $("liveSourceContainer");
const liveSourceText = $("liveSourceText");
const currentLangTag = $("currentLangTag");
const clearLiveTextBtn = $("clearLiveTextBtn");

// Horizontal Split Resizer
const settingsSidebar = $("settingsSidebar");
const hResizerHandle = $("hResizerHandle");
const displayMain = $("displayMain");
const liveCard = $("liveCard");

// Language Metadata & Sample Sentences
const LANG_META = {
  ko: {
    code: "ko",
    name: "한국어",
    flag: "🇰🇷",
    welcome: "원어민이 발화를 시작하면 자연스러운 한국어 번역 문장이 실시간으로 여기에 표시되고 고음질 AI 음성으로 읽어줍니다.",
    sample: "안녕하세요! 선택하신 한국어 실시간 자연스러운 인공지능 통역 목소리입니다."
  },
  en: {
    code: "en",
    name: "English",
    flag: "🇺🇸",
    welcome: "When the speaker begins talking, natural English translated captions will appear here and be read with high-quality AI speech.",
    sample: "Hello! This is your selected English ultra-realistic live translation voice."
  },
  vi: {
    code: "vi",
    name: "Tiếng Việt",
    flag: "🇻🇳",
    welcome: "Khi người nói bắt đầu phát biểu, bản dịch tiếng Việt tự nhiên sẽ hiển thị ở đây và được đọc bằng giọng AI chất lượng cao.",
    sample: "Xin chào! Đây là giọng đọc dịch trực tiếp tiếng Việt siêu tự nhiên của bạn."
  }
};

// State
let selectedTargetLang = localStorage.getItem("listener_target_lang") || "ko";
if (!["ko", "en", "vi"].includes(selectedTargetLang)) {
  selectedTargetLang = "ko";
}

let naturalVoiceList = []; // Neural voices fetched from server
let currentAudio = null;
let ttsQueue = [];
let isSpeaking = false;
let audioUnlocked = false;
let lastSpokenText = "";
let lastCommitKey = "";
let currentSentenceText = "";
let currentSourceSentence = "";
let historySentences = []; // 이전까지의 대화 문장들 (번역 단위별 보관)

/* ─── 1. Theme Management ─── */
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
  try { localStorage.setItem("app_theme", theme); } catch (_) {}
}
const initialTheme = localStorage.getItem("app_theme") || "light";
setTheme(initialTheme);
try {
  localStorage.removeItem("listener_live_card_height");
  if (liveCard) liveCard.style.height = "";
} catch (_) {}

themeToggleBtn?.addEventListener("click", () => {
  const isDark = document.body.classList.contains("dark-theme");
  setTheme(isDark ? "light" : "dark");
});

/* ─── 2. Audio Autoplay Unlock ─── */
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;

  try {
    const silent = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA");
    silent.volume = 0.01;
    silent.play().catch(() => {});
  } catch (_) {}

  if (audioUnlockBanner) {
    audioUnlockBanner.classList.add("hidden");
  }
  console.log("🔊 Natural Audio Player Unlocked");
}

unlockAudioBtn?.addEventListener("click", unlockAudio);
document.addEventListener("click", () => {
  if (!audioUnlocked) unlockAudio();
}, { once: true });

/* ─── 3. Natural AI Voice Management (Strictly KO, EN, VI only) ─── */
const DEFAULT_NEURAL_VOICES = {
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

function populateVoiceOptions(langCode, voices) {
  naturalVoiceList = voices;
  voiceSelect.innerHTML = "";
  if (voiceCountBadge) voiceCountBadge.textContent = `${voices.length}개 자연 음성`;

  const savedVoiceId = localStorage.getItem(`listener_voice_${langCode}`);
  let matched = false;

  voices.forEach((v, idx) => {
    const option = document.createElement("option");
    option.value = v.id;
    const genderIcon = v.gender === "Female" ? "👩" : "👨";
    option.textContent = `✨ ${genderIcon} ${v.name}`;
    if (savedVoiceId && v.id === savedVoiceId) {
      option.selected = true;
      matched = true;
    } else if (!savedVoiceId && idx === 0) {
      option.selected = true;
      matched = true;
    }
    voiceSelect.appendChild(option);
  });

  if (!matched && voices.length > 0) {
    voiceSelect.selectedIndex = 0;
  }
}

async function loadVoicesForLanguage(langCode) {
  if (!voiceSelect) return;
  voiceSelect.innerHTML = `<option value="">자연스러운 AI 목소리 로딩 중...</option>`;

  try {
    const res = await fetch(`/api/voices?lang=${langCode}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const voices = (Array.isArray(data.voices) && data.voices.length > 0)
      ? data.voices
      : (DEFAULT_NEURAL_VOICES[langCode] || []);
    populateVoiceOptions(langCode, voices);
  } catch (err) {
    console.warn("서버 음성 목록 로드 실패, 내장 프리셋 사용:", err);
    populateVoiceOptions(langCode, DEFAULT_NEURAL_VOICES[langCode] || []);
  }
}

voiceSelect?.addEventListener("change", () => {
  const selectedVoiceId = voiceSelect.value;
  if (selectedVoiceId) {
    localStorage.setItem(`listener_voice_${selectedTargetLang}`, selectedVoiceId);
    console.log(`선택된 자연스러운 음성 (${selectedTargetLang}):`, selectedVoiceId);
  }
});

/* ─── 4. Speech Tuning Sliders ─── */
ttsRate?.addEventListener("input", () => {
  rateValue.textContent = `${Number(ttsRate.value).toFixed(2)}x`;
  localStorage.setItem("listener_tts_rate", ttsRate.value);
  if (currentAudio) {
    currentAudio.playbackRate = Number(ttsRate.value);
  }
});

ttsPitch?.addEventListener("input", () => {
  pitchValue.textContent = Number(ttsPitch.value).toFixed(2);
  localStorage.setItem("listener_tts_pitch", ttsPitch.value);
});

ttsVolume?.addEventListener("input", () => {
  volumeValue.textContent = `${Math.round(Number(ttsVolume.value) * 100)}%`;
  localStorage.setItem("listener_tts_volume", ttsVolume.value);
  if (currentAudio) {
    currentAudio.volume = Number(ttsVolume.value);
  }
});

// Restore saved settings
try {
  const savedRate = localStorage.getItem("listener_tts_rate");
  const savedPitch = localStorage.getItem("listener_tts_pitch");
  const savedVolume = localStorage.getItem("listener_tts_volume");
  if (savedRate && ttsRate) { ttsRate.value = savedRate; rateValue.textContent = `${Number(savedRate).toFixed(2)}x`; }
  if (savedPitch && ttsPitch) { ttsPitch.value = savedPitch; pitchValue.textContent = Number(savedPitch).toFixed(2); }
  if (savedVolume && ttsVolume) { ttsVolume.value = savedVolume; volumeValue.textContent = `${Math.round(Number(savedVolume) * 100)}%`; }
} catch (_) {}

/* ─── 5. Ultra-Realistic Natural Audio Player Engine ─── */
function getSelectedVoiceId() {
  return voiceSelect?.value || (naturalVoiceList[0]?.id) || "ko-KR-SunHiNeural";
}

function calculateRateString(rateMultiplier) {
  const pct = Math.round((rateMultiplier - 1.0) * 100);
  if (pct >= 0) return `+${pct}%`;
  return `${pct}%`;
}

function calculatePitchString(pitchMultiplier) {
  const hz = Math.round((pitchMultiplier - 1.0) * 50);
  if (hz >= 0) return `+${hz}Hz`;
  return `${hz}Hz`;
}

function playNaturalSpeech(text, onEndedCallback) {
  if (!text || !text.trim()) {
    if (onEndedCallback) onEndedCallback();
    return;
  }

  stopCurrentAudio();

  const voice = getSelectedVoiceId();
  const speed = Number(ttsRate?.value || 1.0);
  const pitch = Number(ttsPitch?.value || 1.0);
  const volume = Number(ttsVolume?.value || 1.0);

  const rateStr = calculateRateString(speed);
  const pitchStr = calculatePitchString(pitch);

  const url = `/api/tts?text=${encodeURIComponent(text.trim())}&voice=${encodeURIComponent(voice)}&rate=${encodeURIComponent(rateStr)}&pitch=${encodeURIComponent(pitchStr)}`;

  const audio = new Audio(url);
  currentAudio = audio;
  audio.volume = volume;

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    isSpeaking = false;
    updateSpeakingIndicator(false);
    currentAudio = null;
    if (onEndedCallback) onEndedCallback();
  };

  audio.onplay = () => {
    isSpeaking = true;
    updateSpeakingIndicator(true);
  };

  audio.onended = finish;
  audio.onerror = (e) => {
    console.warn("AI 음성 재생 오류, Web Speech fallback 시도:", e);
    // Fallback to Web Speech API if server audio fails
    fallbackWebSpeech(text, finish);
  };

  audio.play().catch((err) => {
    console.warn("오디오 재생 권한 필요 또는 차단됨:", err);
    finish();
  });
}

function fallbackWebSpeech(text, callback) {
  if (!window.speechSynthesis) {
    if (callback) callback();
    return;
  }
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = LANG_META[selectedTargetLang]?.code || "ko";
  utt.rate = Number(ttsRate?.value || 1.0);
  utt.volume = Number(ttsVolume?.value || 1.0);
  utt.onend = () => { if (callback) callback(); };
  utt.onerror = () => { if (callback) callback(); };
  window.speechSynthesis.speak(utt);
}

function processTtsQueue() {
  if (isSpeaking || ttsQueue.length === 0) return;
  const nextText = ttsQueue.shift();
  if (!nextText || !nextText.trim()) {
    processTtsQueue();
    return;
  }

  playNaturalSpeech(nextText, () => {
    setTimeout(processTtsQueue, 200);
  });
}

function queueTts(text) {
  if (!autoTtsToggle?.checked) return;
  if (!text || !text.trim()) return;

  const clean = text.trim();
  if (clean === lastSpokenText) return;
  lastSpokenText = clean;

  ttsQueue.push(clean);
  processTtsQueue();
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
    try { window.speechSynthesis.cancel(); } catch (_) {}
  }
}

function stopTts() {
  ttsQueue = [];
  stopCurrentAudio();
  isSpeaking = false;
  updateSpeakingIndicator(false);
}

stopTtsBtn?.addEventListener("click", stopTts);

testVoiceBtn?.addEventListener("click", () => {
  unlockAudio();
  const sample = LANG_META[selectedTargetLang].sample;
  playNaturalSpeech(sample);
});

function updateSpeakingIndicator(active) {
  if (!ttsSpeakingIndicator) return;
  ttsSpeakingIndicator.classList.toggle("inactive", !active);
}

/* ─── 6. Language Selection Logic (Strictly ko, en, vi) ─── */
function setTargetLanguage(langCode) {
  if (!LANG_META[langCode]) return;
  selectedTargetLang = langCode;
  try { localStorage.setItem("listener_target_lang", langCode); } catch (_) {}

  // Update button active state
  Object.keys(langBtns).forEach((k) => {
    langBtns[k]?.classList.toggle("active", k === langCode);
  });

  const meta = LANG_META[langCode];
  if (currentLangTag) currentLangTag.textContent = `${meta.flag} ${meta.name}`;
  if (liveCurrentText) liveCurrentText.textContent = "원어민이 발화를 시작하면 현재 번역하고 있는 문장이 여기에 표시됩니다.";
  if (liveSourceText) liveSourceText.textContent = "대기 중...";
  if (currentTtsText) currentTtsText.textContent = "원어민이 발화를 시작하면 현재 TTS로 읽고 있는 문장이 여기에 표시됩니다.";
  if (currentTtsSourceText) currentTtsSourceText.textContent = "대기 중...";
  currentSentenceText = "";
  currentSourceSentence = "";
  historySentences = [];
  renderHistoryDisplay();

  stopTts();
  // Fetch strict neural voices for the selected language
  loadVoicesForLanguage(langCode);
}

Object.entries(langBtns).forEach(([langKey, btn]) => {
  btn?.addEventListener("click", () => setTargetLanguage(langKey));
});

// Initial load
setTargetLanguage(selectedTargetLang);

/* ─── 7. Font Size & Display Options ─── */
fontSizeRange?.addEventListener("input", () => {
  const size = `${fontSizeRange.value}px`;
  const currentSize = `${Math.max(22, parseInt(fontSizeRange.value, 10) + 4)}px`;
  if (fontSizeDisplay) fontSizeDisplay.textContent = size;
  if (liveTargetText) liveTargetText.style.fontSize = size;
  if (liveCurrentText) liveCurrentText.style.fontSize = currentSize;
  localStorage.setItem("listener_font_size", fontSizeRange.value);
});

try {
  const savedFontSize = localStorage.getItem("listener_font_size");
  if (savedFontSize && fontSizeRange) {
    fontSizeRange.value = savedFontSize;
    if (fontSizeDisplay) fontSizeDisplay.textContent = `${savedFontSize}px`;
    if (liveTargetText) liveTargetText.style.fontSize = `${savedFontSize}px`;
    if (liveCurrentText) liveCurrentText.style.fontSize = `${Math.max(22, parseInt(savedFontSize, 10) + 4)}px`;
  }
} catch (_) {}

showSourceCheckbox?.addEventListener("change", () => {
  if (liveSourceContainer) {
    liveSourceContainer.classList.toggle("hidden", !showSourceCheckbox.checked);
  }
  localStorage.setItem("listener_show_source", String(showSourceCheckbox.checked));
});

try {
  const savedShowSource = localStorage.getItem("listener_show_source");
  if (savedShowSource !== null && showSourceCheckbox) {
    showSourceCheckbox.checked = savedShowSource === "true";
    liveSourceContainer?.classList.toggle("hidden", !showSourceCheckbox.checked);
  }
} catch (_) {}

/* ─── 8. Two-Pane Right Dialogue Display (Current vs History) ─── */
/**
 * 상단 창: 현재 번역하고 있는 문장만을 표시
 */
function updateCurrentTranslationDisplay(sentence, source) {
  if (liveCurrentText && sentence && sentence.trim()) {
    liveCurrentText.textContent = sentence.trim();
  }
  if (liveSourceText && source && source.trim()) {
    liveSourceText.textContent = source.trim();
  }
}

/**
 * 하단 창: 이전까지의 대화문장 표시
 * 번역단위마다 한 줄을 띄워서(\n\n) 명확히 구분하고 가득 차면 자동 스크롤
 */
function renderHistoryDisplay() {
  if (!liveTargetText) return;
  if (!historySentences || historySentences.length === 0) {
    liveTargetText.textContent = "이전에 번역된 문장들이 여기에 번역 단위마다 줄을 띄워 쌓이며, 화면이 가득 차면 스크롤됩니다.";
    if (historyLineCount) historyLineCount.textContent = "0문장";
    return;
  }

  // 번역 단위마다 줄띄기를 해서 구분 (\n\n)
  liveTargetText.textContent = historySentences.join("\n\n");
  if (historyLineCount) historyLineCount.textContent = `${historySentences.length}문장`;

  // 화면이 가득 차면 아래로 스크롤하여 최근 대화가 보이도록 함
  requestAnimationFrame(() => {
    liveTargetText.scrollTop = liveTargetText.scrollHeight;
  });
}

/**
 * 새로운 번역 단위 문장이 완성되면 이전 대화 목록에 추가
 */
function appendHistorySentence(sentence) {
  if (!sentence || !sentence.trim()) return;
  const clean = sentence.trim();
  // 직전 문장과 동일하면 중복 누적 방지
  if (historySentences.length > 0 && historySentences[historySentences.length - 1] === clean) {
    return;
  }
  historySentences.push(clean);
  renderHistoryDisplay();
}

/**
 * 재접속(replay) 또는 전체 대화 수신 시 이전 문장들을 번역 단위별로 파싱하여 초기화
 */
function seedHistoryFromFullText(fullText, currentSentence) {
  if (!fullText || !fullText.trim()) return;
  const parts = fullText.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return;

  historySentences = [];
  for (const p of parts) {
    if (!historySentences.includes(p)) {
      historySentences.push(p);
    }
  }
  if (currentSentence && currentSentence.trim() && !historySentences.includes(currentSentence.trim())) {
    historySentences.push(currentSentence.trim());
  }
  renderHistoryDisplay();
}

/* ─── 9. Sentence Extraction (Target Language Mapping) ─── */
function extractLastSentence(text) {
  if (!text) return "";
  const clean = text.trim();
  const lines = clean.split(/\n+/).filter(Boolean);
  if (lines.length > 0) {
    const lastLine = lines[lines.length - 1].trim();
    const sentences = lastLine.split(/(?<=[.?!])\s+/).filter(Boolean);
    return (sentences[sentences.length - 1] || lastLine).trim();
  }
  return clean;
}

function extractMyTranslation(data) {
  if (!data) return { fullText: "", newSentence: "", source: "" };

  const target = selectedTargetLang;
  let fullText = "";
  let newSentence = "";
  let sourceText = "";

  if (data.sourceLang === target) {
    fullText = data.fullSource || data.sourceText || data.sourceSentence || "";
    newSentence = data.sourceSentence || extractLastSentence(data.sourceText || fullText);
    sourceText = newSentence;
  } else if (data.target1Lang === target) {
    fullText = data.fullTarget1 || data.target1Text || data.target1Sentence || "";
    newSentence = data.target1Sentence || extractLastSentence(data.target1Text || fullText);
    sourceText = data.sourceSentence || extractLastSentence(data.sourceText || data.fullSource || "");
  } else if (data.target2Lang === target) {
    fullText = data.fullTarget2 || data.target2Text || data.target2Sentence || "";
    newSentence = data.target2Sentence || extractLastSentence(data.target2Text || fullText);
    sourceText = data.sourceSentence || extractLastSentence(data.sourceText || data.fullSource || "");
  }

  return {
    fullText: fullText.trim(),
    newSentence: newSentence.trim(),
    source: sourceText.trim()
  };
}

/* ─── 10. Current TTS Card Management (Left Top Box) ─── */
function updateCurrentTtsDisplay(sentence, source) {
  if (!currentTtsText) return;
  if (sentence && sentence.trim()) {
    currentSentenceText = sentence.trim();
    currentTtsText.textContent = currentSentenceText;
  }
  if (source && currentTtsSourceText) {
    currentSourceSentence = source.trim();
    currentTtsSourceText.textContent = currentSourceSentence;
  }
}

// Current TTS Action Buttons
replayCurrentTtsBtn?.addEventListener("click", () => {
  if (!currentSentenceText) {
    const meta = LANG_META[selectedTargetLang];
    playNaturalSpeech(meta.sample);
    return;
  }
  unlockAudio();
  playNaturalSpeech(currentSentenceText);
});

stopTtsBtn?.addEventListener("click", () => {
  stopTts();
});

clearLiveTextBtn?.addEventListener("click", () => {
  historySentences = [];
  renderHistoryDisplay();
  if (liveCurrentText) liveCurrentText.textContent = "원어민이 발화를 시작하면 현재 번역하고 있는 문장이 여기에 표시됩니다.";
  if (liveSourceText) liveSourceText.textContent = "대기 중...";
  if (currentTtsText) currentTtsText.textContent = "원어민이 발화를 시작하면 현재 TTS로 읽고 있는 문장이 여기에 표시됩니다.";
  if (currentTtsSourceText) currentTtsSourceText.textContent = "대기 중...";
  currentSentenceText = "";
  currentSourceSentence = "";
  stopTts();
});

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ─── 11. Real-time Communication (BroadcastChannel & WebSocket) ─── */
function updateConnectionState(status, message) {
  if (!connectionStatus || !statusText) return;
  connectionStatus.className = `status-badge ${status}`;
  statusText.textContent = message;
}

function updateSpeakerInfo(langCode) {
  if (!speakerBadge || !speakerLangDisplay) return;
  const meta = LANG_META[langCode];
  if (meta) {
    speakerLangDisplay.textContent = `${meta.flag} ${meta.name}`;
  }
}

function handleIncomingEvent(event) {
  if (!event || !event.type) return;

  switch (event.type) {
    case "session_status": {
      if (event.status === "live") {
        updateConnectionState("live", "🟢 원어민 발화 중 (실시간)");
      } else {
        updateConnectionState("waiting", "⚪ 원어민 발화 대기 중");
      }
      if (event.sourceLang) updateSpeakerInfo(event.sourceLang);
      break;
    }

    case "lang_changed": {
      if (event.sourceLang) updateSpeakerInfo(event.sourceLang);
      break;
    }

    case "stream_update": {
      updateConnectionState("live", "🟢 원어민 발화 중 (실시간)");
      if (event.sourceLang) updateSpeakerInfo(event.sourceLang);

      const { fullText, newSentence, source } = extractMyTranslation(event);
      const activeSentence = newSentence || extractLastSentence(fullText);

      // 1. 우측 상단 창: 현재 번역하고 있는 문장만을 실시간 표시
      if (activeSentence) {
        updateCurrentTranslationDisplay(activeSentence, source);
      }

      // 2. 왼쪽 맨 위 카드: 현재 말하고 있는 문장 실시간 프리뷰
      if (activeSentence) {
        updateCurrentTtsDisplay(activeSentence, source);
      }
      break;
    }

    case "sentence_commit": {
      // 같은 이벤트가 BroadcastChannel과 WebSocket으로 두 번 오는 경우 한 번만 처리
      const commitKey = `${event.timestamp || ""}|${event.sourceSentence || ""}|${event.target1Sentence || ""}`;
      if (event.timestamp && commitKey === lastCommitKey) break;
      lastCommitKey = commitKey;

      updateConnectionState("live", event.replay ? "🟢 이전 대화 복원됨" : "🟢 문장 수신 완료");
      const { fullText, newSentence, source } = extractMyTranslation(event);

      // 1. 우측 상단 창: 이번에 완성된 현재 번역 문장 표시
      if (newSentence) {
        updateCurrentTranslationDisplay(newSentence, source);
      }

      // 2. 우측 하단 창: 이전까지의 대화 문장들을 번역단위마다 줄띄기(\n\n)하여 누적 표시
      if (event.replay && fullText) {
        seedHistoryFromFullText(fullText, newSentence);
      } else if (newSentence) {
        appendHistorySentence(newSentence);
      }

      // 3. 왼쪽 맨 위의 화면: 현재 TTS를 한 내용만 단독 표시 & 재생
      if (newSentence) {
        updateCurrentTtsDisplay(newSentence, source);
        // 재접속 복원(replay)은 화면만 갱신하고 음성은 재생하지 않음
        if (!event.replay) queueTts(newSentence);
      }
      break;
    }

    case "clear": {
      historySentences = [];
      renderHistoryDisplay();
      if (liveCurrentText) liveCurrentText.textContent = "원어민이 발화를 시작하면 현재 번역하고 있는 문장이 여기에 표시됩니다.";
      if (liveSourceText) liveSourceText.textContent = "대기 중...";
      if (currentTtsText) currentTtsText.textContent = "원어민이 발화를 시작하면 현재 TTS로 읽고 있는 문장이 여기에 표시됩니다.";
      if (currentTtsSourceText) currentTtsSourceText.textContent = "대기 중...";
      currentSentenceText = "";
      currentSourceSentence = "";
      stopTts();
      break;
    }
  }
}

// 1. BroadcastChannel (Same browser instant inter-tab communication)
if (typeof BroadcastChannel !== "undefined") {
  const bc = new BroadcastChannel("live_translation_stream");
  bc.onmessage = (e) => {
    handleIncomingEvent(e.data);
  };
}

// 2. WebSocket (/ws/broadcast) for local server & HTTP polling (/api/broadcast) for Vercel serverless
let lastBroadcastSeq = 0;

async function startServerlessBroadcastPolling() {
  updateConnectionState("waiting", "원어민 발화 대기 중");
  const poll = async () => {
    try {
      const res = await fetch(`/api/broadcast?since=${lastBroadcastSeq}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (lastBroadcastSeq === 0) {
          if (data.sessionStatus) handleIncomingEvent(data.sessionStatus);
          if (data.lastCommit) handleIncomingEvent({ ...data.lastCommit, replay: true });
        }
        if (Array.isArray(data.events)) {
          for (const ev of data.events) {
            handleIncomingEvent(ev);
          }
        }
        if (typeof data.seq === "number") {
          lastBroadcastSeq = data.seq;
        }
      }
    } catch (_) {}
    setTimeout(poll, 1500);
  };
  poll();
}

async function connectListenerWs() {
  try {
    const statusRes = await fetch("/api/speaker-status", { cache: "no-store" });
    if (statusRes.ok) {
      const statusData = await statusRes.json();
      if (statusData.serverless) {
        console.log("☁️ Serverless 환경 감지: BroadcastChannel + HTTP 폴링 모드 활성화");
        return startServerlessBroadcastPolling();
      }
    }
  } catch (_) {}

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${location.host}/ws/broadcast`;
  let ws;

  try {
    ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      console.log("🌐 Listener WebSocket 연결 완료");
      updateConnectionState("waiting", "원어민 발화 대기 중");
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        handleIncomingEvent(data);
      } catch (err) {
        console.warn("WS 메시지 파싱 오류:", err);
      }
    };

    ws.onclose = () => {
      if (!connectionStatus?.classList.contains("live")) {
        updateConnectionState("waiting", "원어민 발화 대기 중");
      }
      setTimeout(connectListenerWs, 3000);
    };

    ws.onerror = () => {
      try { ws.close(); } catch (_) {}
    };
  } catch (err) {
    console.warn("WebSocket 연결 실패:", err);
    setTimeout(connectListenerWs, 4000);
  }
}
connectListenerWs();

/* ─── 12. Mouse Drag Resizing (Horizontal Split Width) ─── */
function initHorizontalResizer() {
  if (!hResizerHandle || !settingsSidebar) return;

  // Restore saved sidebar width
  const savedWidth = localStorage.getItem("listener_sidebar_width");
  if (savedWidth) {
    settingsSidebar.style.width = `${savedWidth}px`;
  }

  let startX = 0;
  let startWidth = 0;
  let isDragging = false;

  const onMouseMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const newWidth = Math.max(280, Math.min(700, startWidth + dx));
    settingsSidebar.style.width = `${newWidth}px`;
  };

  const onMouseUp = () => {
    if (!isDragging) return;
    isDragging = false;
    hResizerHandle.classList.remove("is-dragging");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);

    const finalWidth = parseInt(settingsSidebar.style.width, 10);
    if (!isNaN(finalWidth)) {
      localStorage.setItem("listener_sidebar_width", String(finalWidth));
    }
  };

  hResizerHandle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    isDragging = true;
    startX = e.clientX;
    startWidth = settingsSidebar.getBoundingClientRect().width;
    hResizerHandle.classList.add("is-dragging");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  });
}

// Initialize Resizer
initHorizontalResizer();
