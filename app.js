const MAX_FILE_BYTES = 25 * 1024 * 1024;
const SAFE_CHUNK_BYTES = 24 * 1024 * 1024;
const TARGET_SAMPLE_RATE = 16000;
const WAV_HEADER_BYTES = 44;
const COPY_SAFETY = 0.85;
const MAX_PARALLEL_REQUESTS = 3;
const MAX_TRANSCRIBE_ATTEMPTS = 3;
const RETRY_BACKOFF_BASE_MS = 700;
const RETRY_BACKOFF_MAX_MS = 8000;
const SEGMENT_TIME_MARGIN = 1.03;
const RETRY_SEGMENT_MINUTES = [15, 10, 8];
const DEFAULT_MAX_SEGMENT_MINUTES = 20;
const MODEL_CONFIG = {
  "gpt-4o-mini-transcribe": {
    provider: "openai",
    maxMinutes: 20,
    pricing: {
      perMinute: 0.003,
      textInputPer1M: 1.25,
      textOutputPer1M: 5.0,
      audioInputPer1M: 3.0,
    },
  },
  "voxtral-mini-latest": {
    provider: "mistral",
    maxMinutes: 20,
    pricing: null,
  },
};
const PROVIDER_CONFIG = {
  openai: {
    label: "OpenAI",
    endpoint: "https://api.openai.com/v1/audio/transcriptions",
    responseFormat: "json",
  },
  mistral: {
    label: "Mistral",
    endpoint: "https://api.mistral.ai/v1/audio/transcriptions",
  },
};
const FFMPEG_BASE_PATH = "vendor/ffmpeg/";
const FFMPEG_CORE_FILE = "ffmpeg-core.js";
const FFMPEG_WASM_FILE = "ffmpeg-core.wasm";
const STORAGE_KEY = "callSynthesis.apiKey";
const STORAGE_REMEMBER = "callSynthesis.remember";
const THEME_STORAGE = "callSynthesis.theme";
const PRICE_PER_MILLION = 1_000_000;

const elements = {
  apiKey: document.getElementById("apiKey"),
  rememberKey: document.getElementById("rememberKey"),
  clearKey: document.getElementById("clearKey"),
  model: document.getElementById("model"),
  modelPriceHint: document.getElementById("modelPriceHint"),
  language: document.getElementById("language"),
  dropzone: document.getElementById("dropzone"),
  fileInput: document.getElementById("fileInput"),
  fileMeta: document.getElementById("fileMeta"),
  audioPreview: document.getElementById("audioPreview"),
  transcribeBtn: document.getElementById("transcribeBtn"),
  testBtn: document.getElementById("testBtn"),
  cancelBtn: document.getElementById("cancelBtn"),
  statusLog: document.getElementById("statusLog"),
  transcript: document.getElementById("transcript"),
  copyBtn: document.getElementById("copyBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
  tokensInput: document.getElementById("tokensInput"),
  tokensOutput: document.getElementById("tokensOutput"),
  tokensTotal: document.getElementById("tokensTotal"),
  tokensEstimate: document.getElementById("tokensEstimate"),
  priceTotal: document.getElementById("priceTotal"),
  usageHint: document.getElementById("usageHint"),
  priceHint: document.getElementById("priceHint"),
  segmentsList: document.getElementById("segmentsList"),
  downloadSegmentsBtn: document.getElementById("downloadSegmentsBtn"),
  themeButtons: document.querySelectorAll("[data-theme-choice]"),
};

const state = {
  file: null,
  objectUrl: null,
  usage: { input: 0, output: 0, total: 0 },
  usageSeen: false,
  durationSeconds: null,
  activeModel: null,
  processing: false,
  abortController: null,
  cancelRequested: false,
  segments: [],
  segmentUrls: [],
};

const ffmpegState = {
  instance: null,
  loading: null,
};

let progressLine = null;

function getModelConfig(model) {
  return MODEL_CONFIG[model] || null;
}

function getProviderConfig(model) {
  const providerKey = getModelConfig(model)?.provider || "openai";
  return PROVIDER_CONFIG[providerKey] || PROVIDER_CONFIG.openai;
}

function getProviderLabel(model) {
  return getProviderConfig(model).label;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "—";
  const units = ["o", "Ko", "Mo", "Go"];
  let size = bytes;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  return `${size.toFixed(size >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const minutesTotal = Math.round(seconds / 60);
  if (minutesTotal < 60) return `${minutesTotal} min`;
  const hours = Math.floor(minutesTotal / 60);
  const minutes = minutesTotal % 60;
  return `${hours} h ${minutes} min`;
}

function createAbortError() {
  const error = new Error("Transcription annulee.");
  error.name = "AbortError";
  return error;
}

function isAbortError(error) {
  return error?.name === "AbortError";
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function sleep(ms, signal) {
  if (!Number.isFinite(ms) || ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let timer = null;
    const onAbort = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
      reject(createAbortError());
    };
    timer = setTimeout(() => {
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
      resolve();
    }, ms);
    if (!signal) return;
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function shouldRetryStatus(status) {
  return status === 408 || status === 409 || status === 429 || (status >= 500 && status <= 599);
}

function parseRetryAfterMs(response) {
  const header = response.headers.get("Retry-After");
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }
  return null;
}

function getRetryDelayMs(attempt, response) {
  const base = Math.min(
    RETRY_BACKOFF_MAX_MS,
    RETRY_BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1),
  );
  const jitter = base * (0.8 + Math.random() * 0.4);
  const retryAfter = response ? parseRetryAfterMs(response) : null;
  const delay = retryAfter != null ? Math.max(retryAfter, jitter) : jitter;
  return Math.round(delay);
}

function buildProgressiveTranscript(parts, total, isFinal) {
  if (isFinal) {
    const cleaned = parts.map((part) => (part || "").trim()).filter(Boolean);
    return cleaned.join("\n\n");
  }
  return parts
    .map((part, index) => {
      const label = `[Segment ${index + 1}/${total}]`;
      const trimmed = (part || "").trim();
      if (trimmed) {
        return `${label}\n${trimmed}`;
      }
      return `${label} en attente`;
    })
    .join("\n\n");
}

function updateTranscriptProgress(parts, total, isFinal) {
  const text = buildProgressiveTranscript(parts, total, isFinal);
  if (!isFinal && !text) {
    elements.transcript.value = "Transcription en cours...";
    return;
  }
  elements.transcript.value = text || "(Aucun texte retourne)";
}

function setStatus(message, isIdle = false) {
  const line = document.createElement("div");
  line.className = `status-line${isIdle ? " idle" : ""}`;
  line.textContent = message;
  elements.statusLog.appendChild(line);
  elements.statusLog.scrollTop = elements.statusLog.scrollHeight;
}

function clearStatus() {
  elements.statusLog.innerHTML = "";
  progressLine = null;
}

function setProgressStatus(message) {
  if (!progressLine) {
    progressLine = document.createElement("div");
    progressLine.className = "status-line";
    elements.statusLog.appendChild(progressLine);
  }
  progressLine.textContent = message;
  elements.statusLog.scrollTop = elements.statusLog.scrollHeight;
}

function setProcessing(isProcessing) {
  state.processing = isProcessing;
  const hasFile = Boolean(state.file);
  elements.transcribeBtn.disabled = isProcessing || !hasFile;
  if (elements.testBtn) {
    elements.testBtn.disabled = isProcessing || !hasFile;
  }
  if (elements.cancelBtn) {
    elements.cancelBtn.disabled = !isProcessing;
  }
}

function setTokens({ input, output, total, estimate }) {
  elements.tokensInput.textContent = input ?? "—";
  elements.tokensOutput.textContent = output ?? "—";
  elements.tokensTotal.textContent = total ?? "—";
  elements.tokensEstimate.textContent = estimate ?? "—";
}

function estimateTokens(text) {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.round(trimmed.length / 4));
}

function formatUsd(value, decimals) {
  if (!Number.isFinite(value)) return "—";
  return `$${value.toFixed(decimals)}`;
}

function formatRate(value) {
  const decimals = value < 1 ? 3 : 2;
  return formatUsd(value, decimals);
}

function formatCost(value) {
  const absValue = Math.abs(value);
  let decimals = 2;
  if (absValue < 0.1) {
    decimals = 4;
  } else if (absValue < 1) {
    decimals = 3;
  }
  return formatUsd(value, decimals);
}

function formatPerMillion(value) {
  return formatUsd(value, 2);
}

function buildModelPriceHint(model) {
  const config = getModelConfig(model);
  const pricing = config?.pricing;
  if (!pricing) {
    const provider = config ? PROVIDER_CONFIG[config.provider]?.label : null;
    return `Tarif indisponible pour ce modèle${provider ? ` (${provider})` : ""}.`;
  }
  const parts = [];
  if (Number.isFinite(pricing.perMinute)) {
    parts.push(`env. ${formatRate(pricing.perMinute)} / min`);
  }
  if (Number.isFinite(pricing.audioInputPer1M)) {
    parts.push(`Audio entrée ${formatPerMillion(pricing.audioInputPer1M)} / 1M tokens`);
  }
  if (Number.isFinite(pricing.textInputPer1M)) {
    parts.push(
      `Texte entrée (prompt) ${formatPerMillion(pricing.textInputPer1M)} / 1M tokens`,
    );
  }
  if (Number.isFinite(pricing.textOutputPer1M)) {
    parts.push(`Texte sortie ${formatPerMillion(pricing.textOutputPer1M)} / 1M tokens`);
  }
  return `Tarif : ${parts.join(" · ")}`;
}

function updateModelPriceHint() {
  if (!elements.modelPriceHint) return;
  const model = elements.model.value.trim();
  elements.modelPriceHint.textContent = buildModelPriceHint(model);
}

function estimatePriceFromUsage(pricing, usage) {
  if (!pricing || !usage) return null;
  const inputRate = Number.isFinite(pricing.audioInputPer1M)
    ? pricing.audioInputPer1M
    : pricing.textInputPer1M;
  const outputRate = pricing.textOutputPer1M;
  let total = 0;
  let used = false;

  if (Number.isFinite(usage.input) && Number.isFinite(inputRate)) {
    total += (usage.input / PRICE_PER_MILLION) * inputRate;
    used = true;
  }
  if (Number.isFinite(usage.output) && Number.isFinite(outputRate)) {
    total += (usage.output / PRICE_PER_MILLION) * outputRate;
    used = true;
  }

  return used ? total : null;
}

function estimatePriceFromDuration(pricing, durationSeconds) {
  if (!pricing || !Number.isFinite(pricing.perMinute)) return null;
  if (!Number.isFinite(durationSeconds)) return null;
  return (durationSeconds / 60) * pricing.perMinute;
}

function updatePriceDisplay() {
  if (!elements.priceTotal || !elements.priceHint) return;
  const model = (state.activeModel || elements.model.value || "").trim();
  const config = getModelConfig(model);
  const pricing = config?.pricing || null;
  const provider = config ? PROVIDER_CONFIG[config.provider]?.label : null;

  if (!pricing) {
    elements.priceTotal.textContent = "—";
    elements.priceHint.textContent = `Tarif indisponible pour ce modèle${
      provider ? ` (${provider})` : ""
    }.`;
    return;
  }

  if (!state.file && !state.usageSeen) {
    elements.priceTotal.textContent = "—";
    elements.priceHint.textContent = "Ajoutez un fichier pour estimer le prix.";
    return;
  }

  let cost = null;
  let note = "";

  if (state.usageSeen) {
    const usageCost = estimatePriceFromUsage(pricing, state.usage);
    if (usageCost != null) {
      cost = formatCost(usageCost);
      note = `Prix calculé à partir des tokens (${model}).`;
    }
  }

  if (cost == null) {
    const durationCost = estimatePriceFromDuration(pricing, state.durationSeconds);
    if (durationCost != null) {
      cost = formatCost(durationCost);
      note = `Prix estimé à partir de la durée audio (${model}).`;
    } else {
      cost = "—";
      note = `Durée audio indisponible pour estimer le prix (${model}).`;
    }
  }

  elements.priceTotal.textContent = cost;
  elements.priceHint.textContent = note;
}

function updateUsageHint() {
  elements.usageHint.textContent = state.usageSeen
    ? "Usage fourni par l'API."
    : "L'estimation se base sur le texte si l'API ne renvoie pas l'usage.";
}

function applyUsage(usage) {
  if (!usage) return;
  const inputTokens = Number(usage.input_tokens ?? usage.prompt_tokens ?? 0);
  const outputTokens = Number(usage.output_tokens ?? usage.completion_tokens ?? 0);
  const totalTokens = Number(usage.total_tokens ?? inputTokens + outputTokens);
  state.usage.input += inputTokens;
  state.usage.output += outputTokens;
  state.usage.total += totalTokens;
  state.usageSeen = true;
  setTokens({
    input: state.usage.input || "—",
    output: state.usage.output || "—",
    total: state.usage.total || "—",
    estimate: "—",
  });
  updateUsageHint();
  updatePriceDisplay();
}

function getMaxSegmentDurationSeconds(model) {
  const minutes = getModelConfig(model)?.maxMinutes ?? DEFAULT_MAX_SEGMENT_MINUTES;
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return minutes * 60;
}

function buildRetryDurationSteps(maxDurationSeconds) {
  const steps = [];
  if (Number.isFinite(maxDurationSeconds) && maxDurationSeconds > 0) {
    steps.push(maxDurationSeconds);
    for (const minutes of RETRY_SEGMENT_MINUTES) {
      const seconds = minutes * 60;
      if (seconds < maxDurationSeconds && !steps.includes(seconds)) {
        steps.push(seconds);
      }
    }
  }
  return steps.length ? steps : [20 * 60];
}

function clearSegments() {
  state.segments = [];
  if (state.segmentUrls.length) {
    for (const url of state.segmentUrls) {
      URL.revokeObjectURL(url);
    }
  }
  state.segmentUrls = [];
  if (!elements.segmentsList) return;
  elements.segmentsList.innerHTML = '<div class="segments-empty">Aucun segment généré.</div>';
  if (elements.downloadSegmentsBtn) {
    elements.downloadSegmentsBtn.disabled = true;
  }
}

function buildSegmentFilename(baseName, file, chunk) {
  const extension = chunk.extension || getFileExtension(file);
  if (chunk.isOriginal && file?.name) {
    return file.name;
  }
  return `${baseName}-part-${String(chunk.index).padStart(2, "0")}.${extension}`;
}

function setSegments(chunks, file) {
  clearSegments();
  if (!elements.segmentsList) return;
  if (!chunks || !chunks.length) return;

  const baseName = sanitizeBaseName(file?.name || "audio");
  const fragment = document.createDocumentFragment();
  state.segments = chunks.map((chunk) => {
    const filename = buildSegmentFilename(baseName, file, chunk);
    const url = URL.createObjectURL(chunk.blob);
    state.segmentUrls.push(url);

    const item = document.createElement("div");
    item.className = "segment-item";

    const name = document.createElement("span");
    name.className = "segment-name";
    name.textContent = filename;

    const size = document.createElement("span");
    size.className = "segment-size";
    size.textContent = formatBytes(chunk.blob.size);

    const button = document.createElement("button");
    button.className = "ghost";
    button.textContent = "Télécharger";
    button.addEventListener("click", () => {
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });

    item.appendChild(name);
    item.appendChild(size);
    item.appendChild(button);
    fragment.appendChild(item);

    return { filename, url };
  });

  elements.segmentsList.innerHTML = "";
  elements.segmentsList.appendChild(fragment);
  if (elements.downloadSegmentsBtn) {
    elements.downloadSegmentsBtn.disabled = false;
  }
}

function setFile(file) {
  state.file = file;
  state.durationSeconds = null;
  state.activeModel = null;
  state.usage = { input: 0, output: 0, total: 0 };
  state.usageSeen = false;
  setProcessing(state.processing);
  elements.transcript.value = "";
  setTokens({ input: "—", output: "—", total: "—", estimate: "—" });
  updateUsageHint();
  updatePriceDisplay();
  clearSegments();

  if (!file) {
    elements.fileMeta.textContent = "Aucun fichier chargé.";
    if (state.objectUrl) {
      URL.revokeObjectURL(state.objectUrl);
      state.objectUrl = null;
    }
    elements.audioPreview.hidden = true;
    return;
  }

  const details = `${file.name} · ${formatBytes(file.size)} · ${file.type || "audio"}`;
  elements.fileMeta.textContent = details;
  if (state.objectUrl) {
    URL.revokeObjectURL(state.objectUrl);
  }
  state.objectUrl = URL.createObjectURL(file);
  elements.audioPreview.src = state.objectUrl;
  elements.audioPreview.hidden = false;
}

function resetTranscriptionState() {
  elements.transcript.value = "";
  setTokens({ input: "—", output: "—", total: "—", estimate: "—" });
  state.usage = { input: 0, output: 0, total: 0 };
  state.usageSeen = false;
  updateUsageHint();
  updatePriceDisplay();
}

function sanitizeBaseName(name) {
  if (!name) return "audio";
  return name.replace(/\.[^/.]+$/, "").replace(/[^a-z0-9-_]+/gi, "-");
}

function isTokenLimitError(message) {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return (
    (normalized.includes("tokens") &&
      normalized.includes("audio") &&
      normalized.includes("too large")) ||
    normalized.includes("maximum context length") ||
    normalized.includes("context length") ||
    normalized.includes("token limit")
  );
}

function extractApiErrorMessage(errorText) {
  if (!errorText) return "";
  try {
    const parsed = JSON.parse(errorText);
    if (parsed.error?.message) return String(parsed.error.message);
    if (parsed.message) return String(parsed.message);
    if (Array.isArray(parsed.detail) && parsed.detail[0]?.msg) {
      return String(parsed.detail[0].msg);
    }
    if (parsed.detail) return String(parsed.detail);
  } catch (error) {
    // Ignore parse failures.
  }
  return "";
}

function extensionFromMimeType(mimeType) {
  const base = (mimeType || "audio/webm").split(";")[0];
  if (base.endsWith("webm")) return "webm";
  if (base.endsWith("mp4")) return "m4a";
  if (base.endsWith("aac")) return "aac";
  if (base.endsWith("mpeg")) return "mp3";
  return "webm";
}

function mimeFromExtension(extension) {
  const ext = extension.toLowerCase();
  if (ext === "m4a" || ext === "mp4") return "audio/mp4";
  if (ext === "aac") return "audio/aac";
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "wav") return "audio/wav";
  if (ext === "webm") return "audio/webm";
  return "audio/webm";
}

function getFileExtension(file) {
  const name = file?.name || "";
  const match = name.match(/\.([a-z0-9]+)$/i);
  if (match) {
    return match[1].toLowerCase();
  }
  if (file?.type) {
    return extensionFromMimeType(file.type);
  }
  return "m4a";
}

function parseFfmpegDuration(message) {
  if (!message) return null;
  const match = message.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }
  return hours * 3600 + minutes * 60 + seconds;
}

async function probeDurationWithFfmpeg(ffmpeg, inputName) {
  let duration = null;
  const onLog = ({ message }) => {
    if (duration != null) return;
    const parsed = parseFfmpegDuration(message);
    if (parsed != null) {
      duration = parsed;
    }
  };
  ffmpeg.on("log", onLog);
  try {
    await ffmpeg.exec(["-hide_banner", "-i", inputName]);
  } catch (error) {
    // Ignore probing errors.
  } finally {
    ffmpeg.off("log", onLog);
  }
  return duration;
}

function getDurationFromMetadata(file) {
  return new Promise((resolve, reject) => {
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(file);
    let settled = false;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      audio.src = "";
      audio.removeAttribute("src");
      URL.revokeObjectURL(url);
    };

    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      cleanup();
      if (Number.isFinite(duration) && duration > 0) {
        resolve(duration);
      } else {
        reject(new Error("Durée audio inconnue."));
      }
    };
    audio.onerror = () => {
      cleanup();
      reject(new Error("Impossible de lire les métadonnées audio."));
    };
    audio.src = url;
  });
}

async function getAudioDuration(file) {
  if (state.file === file && Number.isFinite(state.durationSeconds)) {
    return state.durationSeconds;
  }
  try {
    const duration = await getDurationFromMetadata(file);
    if (state.file === file) {
      state.durationSeconds = duration;
      updatePriceDisplay();
    }
    return duration;
  } catch (error) {
    const arrayBuffer = await file.arrayBuffer();
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    try {
      const decoded = await audioContext.decodeAudioData(arrayBuffer);
      const duration = decoded.duration;
      if (state.file === file) {
        state.durationSeconds = Number.isFinite(duration) ? duration : null;
        updatePriceDisplay();
      }
      return duration;
    } finally {
      if (audioContext.close) {
        audioContext.close();
      }
    }
  }
}

async function loadFfmpeg() {
  if (ffmpegState.instance) {
    return ffmpegState;
  }
  if (ffmpegState.loading) {
    return ffmpegState.loading;
  }
  ffmpegState.loading = (async () => {
    let ffmpeg;
    try {
      setProgressStatus("Initialisation de FFmpeg...");
      const ffmpegGlobal = window.FFmpegWASM;
      if (!ffmpegGlobal || !ffmpegGlobal.FFmpeg) {
        throw new Error("FFmpeg non chargé. Vérifiez vendor/ffmpeg/ffmpeg.js.");
      }
      ffmpeg = new ffmpegGlobal.FFmpeg();
      const baseURL = new URL(FFMPEG_BASE_PATH, window.location.href);
      const coreURL = new URL(FFMPEG_CORE_FILE, baseURL).toString();
      const wasmURL = new URL(FFMPEG_WASM_FILE, baseURL).toString();
      let slowTimer;
      let timeoutId;
      try {
        slowTimer = setTimeout(() => {
          setProgressStatus("Initialisation en cours... (peut prendre 1-2 min)");
        }, 15000);
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error("Initialisation FFmpeg trop longue."));
          }, 90000);
        });
        await Promise.race([ffmpeg.load({ coreURL, wasmURL }), timeoutPromise]);
      } finally {
        clearTimeout(slowTimer);
        clearTimeout(timeoutId);
      }
      progressLine = null;
      ffmpegState.instance = ffmpeg;
      ffmpegState.loading = null;
      return ffmpegState;
    } catch (error) {
      if (ffmpeg?.terminate) {
        try {
          ffmpeg.terminate();
        } catch (err) {
          // Ignore terminate failures.
        }
      }
      ffmpegState.loading = null;
      progressLine = null;
      throw error;
    }
  })();
  return ffmpegState.loading;
}

async function toUint8Array(file) {
  if (file instanceof Uint8Array) return file;
  if (file instanceof ArrayBuffer) return new Uint8Array(file);
  if (file?.arrayBuffer) {
    return new Uint8Array(await file.arrayBuffer());
  }
  return new Uint8Array();
}

function writeString(view, offset, value) {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + samples.length * 2);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = WAV_HEADER_BYTES;
  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}

async function readFfmpegSegments(ffmpeg, prefix, extension, mimeType) {
  const entries = await ffmpeg.listDir("/");
  const names = entries
    .map((entry) => entry.name)
    .filter((name) => name.startsWith(prefix) && name.endsWith(`.${extension}`))
    .sort();

  if (!names.length) {
    throw new Error("FFmpeg n'a retourné aucun segment.");
  }

  const chunks = [];
  for (let i = 0; i < names.length; i += 1) {
    const name = names[i];
    const data = await ffmpeg.readFile(name);
    chunks.push({
      blob: new Blob([data], { type: mimeType }),
      index: i + 1,
      extension,
    });
    await ffmpeg.deleteFile(name);
  }
  return chunks;
}

async function clearFfmpegSegments(ffmpeg, prefix) {
  const entries = await ffmpeg.listDir("/");
  const names = entries
    .map((entry) => entry.name)
    .filter((name) => name.startsWith(prefix));
  for (const name of names) {
    try {
      await ffmpeg.deleteFile(name);
    } catch (error) {
      // Ignore deletion failures.
    }
  }
}

async function ffmpegCopySegment(file, options = {}) {
  const { maxDurationSeconds, signal } = options;
  throwIfAborted(signal);
  setStatus("FFmpeg : découpe rapide sans ré-encodage.");
  const { instance: ffmpeg } = await loadFfmpeg();
  const inputExtension = getFileExtension(file);
  const inputName = `input.${inputExtension}`;
  await ffmpeg.writeFile(inputName, await toUint8Array(file));

  throwIfAborted(signal);
  const probedDuration = await probeDurationWithFfmpeg(ffmpeg, inputName);
  const duration = probedDuration ?? await getAudioDuration(file);
  if (!Number.isFinite(duration) || duration <= 0) {
    try {
      await ffmpeg.deleteFile(inputName);
    } catch (error) {
      // Ignore cleanup failures.
    }
    throw new Error("Durée audio invalide.");
  }
  if (state.file === file) {
    state.durationSeconds = duration;
    updatePriceDisplay();
  }

  const outputPrefix = "segment";
  const outputExtension = inputExtension;
  const outputPattern = `${outputPrefix}-%03d.${outputExtension}`;

  const estimatedBitrate = (file.size * 8) / duration;
  const maxSegmentSeconds = Math.max(
    1,
    Math.floor((SAFE_CHUNK_BYTES * 8 * COPY_SAFETY) / estimatedBitrate),
  );
  const sizeBasedCount = Math.ceil(file.size / (SAFE_CHUNK_BYTES * COPY_SAFETY));
  const timeBasedCount = Math.max(1, Math.ceil(duration / maxSegmentSeconds));
  const durationBasedCount = maxDurationSeconds
    ? Math.ceil(duration / (maxDurationSeconds / SEGMENT_TIME_MARGIN))
    : 1;
  const segmentCount = Math.max(sizeBasedCount, timeBasedCount, durationBasedCount);
  const segmentDuration = duration / segmentCount;
  let segmentTime = segmentDuration * SEGMENT_TIME_MARGIN;
  if (maxDurationSeconds) {
    segmentTime = Math.min(segmentTime, maxDurationSeconds);
  }
  const targetCount = Math.max(segmentCount, Math.ceil(duration / segmentTime));
  const durationLimitNote = maxDurationSeconds
    ? ` (limite ${formatDuration(maxDurationSeconds)})`
    : "";

  setStatus(
    `Découpe FFmpeg : cible ${targetCount} segment(s) d'env. ${formatDuration(segmentTime)}${durationLimitNote}.`,
  );

  try {
    await clearFfmpegSegments(ffmpeg, outputPrefix);
    await ffmpeg.exec([
      "-i",
      inputName,
      "-map",
      "0:a",
      "-c",
      "copy",
      "-f",
      "segment",
      "-segment_time",
      `${segmentTime}`,
      "-reset_timestamps",
      "1",
      outputPattern,
    ]);
  } finally {
    try {
      await ffmpeg.deleteFile(inputName);
    } catch (error) {
      // Ignore cleanup failures.
    }
  }

  throwIfAborted(signal);
  const mimeType = mimeFromExtension(outputExtension);
  const chunks = await readFfmpegSegments(ffmpeg, outputPrefix, outputExtension, mimeType);
  const totalSize = chunks.reduce((sum, chunk) => sum + chunk.blob.size, 0);
  const oversized = chunks.find((chunk) => chunk.blob.size > MAX_FILE_BYTES);
  if (oversized) {
    throw new Error("Un segment dépasse 25 Mo. Découpage WAV nécessaire.");
  }

  setStatus(
    `Préparation terminée : ${chunks.length} segment(s) · ${formatBytes(totalSize)}.`,
  );
  if (chunks.length > targetCount) {
    setStatus(
      "Note : la découpe dépend des points de coupe du fichier, le nombre de segments peut varier.",
    );
  }
  return {
    chunks,
    totalSize,
    usedOriginal: false,
    usedCompression: true,
    method: "ffmpeg-copy",
  };
}

async function downsampleAndChunk(file, signal) {
  throwIfAborted(signal);
  setStatus("Fichier > 25 Mo : rééchantillonnage 16kHz mono en cours…");
  const arrayBuffer = await file.arrayBuffer();
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  let decoded;
  try {
    decoded = await audioContext.decodeAudioData(arrayBuffer);
  } finally {
    if (audioContext.close) {
      audioContext.close();
    }
  }
  throwIfAborted(signal);

  const frameCount = Math.ceil(decoded.duration * TARGET_SAMPLE_RATE);
  const offline = new OfflineAudioContext(1, frameCount, TARGET_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start(0);
  const rendered = await offline.startRendering();
  const samples = rendered.getChannelData(0);
  const maxSamplesPerChunk = Math.floor((SAFE_CHUNK_BYTES - WAV_HEADER_BYTES) / 2);

  const chunks = [];
  let offset = 0;
  let index = 1;
  while (offset < samples.length) {
    throwIfAborted(signal);
    const end = Math.min(offset + maxSamplesPerChunk, samples.length);
    const slice = samples.subarray(offset, end);
    const wavBuffer = encodeWav(slice, rendered.sampleRate);
    const blob = new Blob([wavBuffer], { type: "audio/wav" });
    chunks.push({ blob, index, extension: "wav" });
    offset = end;
    index += 1;
  }
  const totalSize = chunks.reduce((sum, chunk) => sum + chunk.blob.size, 0);
  setStatus(
    `Préparation terminée : ${chunks.length} segment(s) · ${formatBytes(totalSize)}.`,
  );
  return { chunks, sampleRate: rendered.sampleRate, totalSize };
}

async function prepareFile(file, model, options = {}) {
  const { maxDurationOverrideSeconds: overrideSeconds, signal } = options;
  throwIfAborted(signal);
  const maxDurationSeconds =
    Number.isFinite(overrideSeconds) && overrideSeconds > 0
      ? overrideSeconds
      : getMaxSegmentDurationSeconds(model);
  let needsDurationSplit = false;
  if (file.size <= MAX_FILE_BYTES && maxDurationSeconds) {
    const duration = await getAudioDuration(file);
    needsDurationSplit = Number.isFinite(duration) && duration > maxDurationSeconds;
  }
  throwIfAborted(signal);

  if (file.size <= MAX_FILE_BYTES && !needsDurationSplit) {
    setStatus("Fichier accepté sans découpage.");
    return {
      chunks: [{ blob: file, index: 1, isOriginal: true }],
      totalSize: file.size,
      usedOriginal: true,
    };
  }

  try {
    return await ffmpegCopySegment(file, { maxDurationSeconds, signal });
  } catch (error) {
    setStatus("Découpe FFmpeg échouée, bascule en WAV.");
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message);
  }

  return {
    ...(await downsampleAndChunk(file, signal)),
    usedOriginal: false,
    usedCompression: false,
  };
}

function cancelTranscription() {
  if (!state.processing || !state.abortController) return;
  state.cancelRequested = true;
  state.abortController.abort();
  setStatus("Annulation demandee.");
}

async function transcribeChunkWithRetry({
  apiKey,
  model,
  language,
  chunk,
  chunkIndex,
  totalChunks,
  file,
  baseName,
  signal,
}) {
  const filename = buildSegmentFilename(baseName, file, chunk);
  const providerConfig = getProviderConfig(model);
  for (let attempt = 1; attempt <= MAX_TRANSCRIBE_ATTEMPTS; attempt += 1) {
    throwIfAborted(signal);
    const attemptLabel =
      MAX_TRANSCRIBE_ATTEMPTS > 1 ? ` (tentative ${attempt}/${MAX_TRANSCRIBE_ATTEMPTS})` : "";
    setStatus(`Transcription segment ${chunkIndex + 1}/${totalChunks}${attemptLabel}...`);

    const formData = new FormData();
    formData.append("file", chunk.blob, filename);
    formData.append("model", model);
    if (providerConfig.responseFormat) {
      formData.append("response_format", providerConfig.responseFormat);
    }
    if (language) {
      formData.append("language", language);
    }

    let response;
    try {
      response = await fetch(providerConfig.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
        signal,
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      if (attempt < MAX_TRANSCRIBE_ATTEMPTS) {
        const delayMs = getRetryDelayMs(attempt);
        const delaySeconds = Math.round(delayMs / 100) / 10;
        setStatus(
          `Segment ${chunkIndex + 1}/${totalChunks} : erreur reseau, nouvelle tentative dans ${delaySeconds}s.`,
        );
        await sleep(delayMs, signal);
        continue;
      }
      throw error;
    }

    if (!response.ok) {
      if (shouldRetryStatus(response.status) && attempt < MAX_TRANSCRIBE_ATTEMPTS) {
        const delayMs = getRetryDelayMs(attempt, response);
        const delaySeconds = Math.round(delayMs / 100) / 10;
        setStatus(
          `Segment ${chunkIndex + 1}/${totalChunks} : erreur ${response.status}, nouvelle tentative dans ${delaySeconds}s.`,
        );
        await sleep(delayMs, signal);
        continue;
      }
      const errorText = await response.text();
      const parsedMessage = extractApiErrorMessage(errorText);
      const message =
        parsedMessage || errorText || `Erreur API ${providerConfig.label}.`;
      throw new Error(message.trim());
    }

    return response.json();
  }
  throw new Error("Echec transcription segment.");
}

async function transcribe() {
  const apiKey = elements.apiKey.value.trim();
  const model = elements.model.value.trim();
  const language = elements.language.value.trim();
  const file = state.file;

  if (!apiKey) {
    clearStatus();
    setStatus(`Veuillez renseigner votre clé API ${getProviderLabel(model)}.`);
    return;
  }
  if (!file) {
    clearStatus();
    setStatus("Veuillez sélectionner un fichier audio.");
    return;
  }

  state.activeModel = model;
  state.cancelRequested = false;
  setProcessing(true);
  elements.transcribeBtn.textContent = "Traitement...";
  resetTranscriptionState();
  clearStatus();
  setStatus("Analyse du fichier audio…");

  try {
    const baseName = sanitizeBaseName(file.name);
    const maxDurationSeconds = getMaxSegmentDurationSeconds(model);
    const retrySteps = buildRetryDurationSteps(maxDurationSeconds);

    for (let attempt = 0; attempt < retrySteps.length; attempt += 1) {
      const overrideSeconds = retrySteps[attempt];
      if (attempt > 0) {
        resetTranscriptionState();
        setStatus(
          `Nouvelle tentative avec des segments plus courts (limite ${formatDuration(overrideSeconds)}).`,
        );
      }

      try {
        const controller = new AbortController();
        state.abortController = controller;
        const { signal } = controller;

        const { chunks, totalSize, usedOriginal } = await prepareFile(file, model, {
          maxDurationOverrideSeconds: overrideSeconds,
          signal,
        });
        setSegments(chunks, file);
        if (!usedOriginal) {
          setStatus(`Taille finale : ${formatBytes(totalSize)}.`);
        }

        const totalChunks = chunks.length;
        if (!totalChunks) {
          throw new Error("Aucun segment a transcrire.");
        }
        const transcriptParts = new Array(totalChunks).fill("");
        updateTranscriptProgress(transcriptParts, totalChunks, false);
        setProgressStatus(`Transcription : 0/${totalChunks} segment(s) termines.`);

        const parallelLimit = Math.max(1, Math.min(MAX_PARALLEL_REQUESTS, totalChunks));
        let completed = 0;
        let active = 0;
        let nextIndex = 0;
        let finished = false;

        await new Promise((resolve, reject) => {
          const launchNext = () => {
            if (finished) return;
            if (signal.aborted) {
              finished = true;
              reject(createAbortError());
              return;
            }
            while (active < parallelLimit && nextIndex < totalChunks) {
              const chunkIndex = nextIndex;
              nextIndex += 1;
              const chunk = chunks[chunkIndex];
              active += 1;
              transcribeChunkWithRetry({
                apiKey,
                model,
                language,
                chunk,
                chunkIndex,
                totalChunks,
                file,
                baseName,
                signal,
              })
                .then((data) => {
                  if (finished) return;
                  const chunkText = (data.text || "").trim();
                  transcriptParts[chunkIndex] = chunkText;
                  applyUsage(data.usage);
                  completed += 1;
                  updateTranscriptProgress(transcriptParts, totalChunks, false);
                  setProgressStatus(
                    `Transcription : ${completed}/${totalChunks} segment(s) termines.`,
                  );
                  active -= 1;
                  if (completed >= totalChunks) {
                    finished = true;
                    resolve();
                    return;
                  }
                  launchNext();
                })
                .catch((error) => {
                  if (finished) return;
                  active -= 1;
                  if (!isAbortError(error)) {
                    finished = true;
                    controller.abort();
                    reject(error);
                    return;
                  }
                  if (signal.aborted) {
                    finished = true;
                    reject(error);
                  }
                });
            }
          };
          launchNext();
        });

        const fullTranscript = buildProgressiveTranscript(
          transcriptParts,
          totalChunks,
          true,
        );
        elements.transcript.value = fullTranscript || "(Aucun texte retourne)";
        const estimatedTokens = estimateTokens(fullTranscript);
        if (!state.usageSeen) {
          setTokens({
            input: "—",
            output: "—",
            total: "—",
            estimate: estimatedTokens || "—",
          });
        } else {
          elements.tokensEstimate.textContent = estimatedTokens || "—";
        }
        updatePriceDisplay();
        setStatus("Transcription terminee.");
        return;
      } catch (error) {
        if (state.abortController) {
          state.abortController = null;
        }
        if (state.cancelRequested || isAbortError(error)) {
          throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        if (isTokenLimitError(message) && attempt < retrySteps.length - 1) {
          setStatus("Limite de tokens atteinte pour ce modele.");
          continue;
        }
        throw error;
      } finally {
        if (state.abortController && state.abortController.signal.aborted) {
          state.abortController = null;
        }
      }
    }
  } catch (error) {
    if (state.cancelRequested || isAbortError(error)) {
      setStatus("Transcription annulee.");
    } else {
      setStatus("Erreur pendant la transcription.");
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message);
    }
  } finally {
    state.cancelRequested = false;
    setProcessing(false);
    elements.transcribeBtn.textContent = "Transcrire le call";
    state.abortController = null;
  }
}

async function testSegmentation() {
  const file = state.file;
  if (!file) {
    clearStatus();
    setStatus("Veuillez sélectionner un fichier audio.");
    return;
  }

  setProcessing(true);
  if (elements.testBtn) {
    elements.testBtn.textContent = "Test en cours...";
  }
  clearStatus();
  setStatus("Test découpage/segmentation (aucun appel API).");

  try {
    const model = elements.model.value.trim();
    const { chunks, totalSize } = await prepareFile(file, model);
    setSegments(chunks, file);
    setStatus(
      `Test terminé : ${chunks.length} segment(s) · ${formatBytes(totalSize)}.`,
    );
  } catch (error) {
    setStatus("Erreur pendant le test.");
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message);
  } finally {
    setProcessing(false);
    if (elements.testBtn) {
      elements.testBtn.textContent = "Tester découpage";
    }
  }
}

elements.fileInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0] || null;
  setFile(file);
});

elements.audioPreview.addEventListener("loadedmetadata", () => {
  const duration = elements.audioPreview.duration;
  state.durationSeconds = Number.isFinite(duration) ? duration : null;
  updatePriceDisplay();
});

elements.dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  elements.dropzone.classList.add("dragover");
});

elements.dropzone.addEventListener("dragleave", () => {
  elements.dropzone.classList.remove("dragover");
});

elements.dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  elements.dropzone.classList.remove("dragover");
  const file = event.dataTransfer.files?.[0] || null;
  if (file) {
    setFile(file);
  }
});

elements.model.addEventListener("change", () => {
  updateModelPriceHint();
  updatePriceDisplay();
});

elements.transcribeBtn.addEventListener("click", () => {
  transcribe();
});

if (elements.cancelBtn) {
  elements.cancelBtn.addEventListener("click", () => {
    cancelTranscription();
  });
}

if (elements.testBtn) {
  elements.testBtn.addEventListener("click", () => {
    testSegmentation();
  });
}

if (elements.downloadSegmentsBtn) {
  elements.downloadSegmentsBtn.addEventListener("click", () => {
    if (!state.segments.length) return;
    for (const segment of state.segments) {
      const link = document.createElement("a");
      link.href = segment.url;
      link.download = segment.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    setStatus("Téléchargement des segments lancé.");
  });
}

elements.copyBtn.addEventListener("click", async () => {
  const text = elements.transcript.value;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    setStatus("Transcription copiée.");
  } catch (error) {
    setStatus("Impossible de copier dans le presse-papier.");
  }
});

elements.downloadBtn.addEventListener("click", () => {
  const text = elements.transcript.value;
  if (!text) return;
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "transcription.txt";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
});

function normalizeThemeChoice(choice) {
  if (choice === "light" || choice === "dark" || choice === "system") {
    return choice;
  }
  return "system";
}

function applyThemeChoice(choice) {
  const normalized = normalizeThemeChoice(choice);
  if (normalized === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", normalized);
  }
  if (elements.themeButtons?.length) {
    elements.themeButtons.forEach((button) => {
      const isActive = button.dataset.themeChoice === normalized;
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }
}

function setThemeChoice(choice) {
  const normalized = normalizeThemeChoice(choice);
  applyThemeChoice(normalized);
  localStorage.setItem(THEME_STORAGE, normalized);
}

function loadThemeChoice() {
  const stored = localStorage.getItem(THEME_STORAGE);
  applyThemeChoice(stored || "system");
}

if (elements.themeButtons?.length) {
  elements.themeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setThemeChoice(button.dataset.themeChoice);
    });
  });
}

elements.rememberKey.addEventListener("change", (event) => {
  const remember = event.target.checked;
  if (remember) {
    localStorage.setItem(STORAGE_REMEMBER, "true");
    const key = elements.apiKey.value.trim();
    if (key) {
      localStorage.setItem(STORAGE_KEY, key);
    }
  } else {
    localStorage.removeItem(STORAGE_REMEMBER);
    localStorage.removeItem(STORAGE_KEY);
  }
});

elements.apiKey.addEventListener("input", () => {
  if (elements.rememberKey.checked) {
    localStorage.setItem(STORAGE_KEY, elements.apiKey.value.trim());
  }
});

elements.clearKey.addEventListener("click", () => {
  elements.apiKey.value = "";
  elements.rememberKey.checked = false;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_REMEMBER);
  setStatus("Clé API effacée.");
});

function loadStoredKey() {
  const remember = localStorage.getItem(STORAGE_REMEMBER) === "true";
  if (remember) {
    const key = localStorage.getItem(STORAGE_KEY);
    if (key) {
      elements.apiKey.value = key;
      elements.rememberKey.checked = true;
    }
  }
}

loadStoredKey();
loadThemeChoice();
updateModelPriceHint();
updatePriceDisplay();
clearStatus();
setStatus("Prêt pour une transcription.", true);
