const MODEL_ID = "voxtral-mini-latest";
const PROVIDER_CONFIG = {
  label: "Mistral",
  endpoint: "https://api.mistral.ai/v1/audio/transcriptions",
};
const MAX_PARALLEL_REQUESTS = 3;
const MAX_TRANSCRIBE_ATTEMPTS = 3;
const RETRY_BACKOFF_BASE_MS = 700;
const RETRY_BACKOFF_MAX_MS = 8000;
const SEGMENT_TARGET_MINUTES = 25;
const SEGMENT_TARGET_SECONDS = SEGMENT_TARGET_MINUTES * 60;
const SEGMENT_OVERLAP_SECONDS = 10;
const FFMPEG_BASE_PATH = "vendor/ffmpeg/";
const FFMPEG_CORE_FILE = "ffmpeg-core.js";
const FFMPEG_WASM_FILE = "ffmpeg-core.wasm";
const STORAGE_KEY = "callSynthesis.apiKey";
const STORAGE_REMEMBER = "callSynthesis.remember";
const THEME_STORAGE = "callSynthesis.theme";
const OVERLAP_MIN_WORDS = 6;
const OVERLAP_MAX_WORDS = 80;

const elements = {
  apiKey: document.getElementById("apiKey"),
  rememberKey: document.getElementById("rememberKey"),
  clearKey: document.getElementById("clearKey"),
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
  usageHint: document.getElementById("usageHint"),
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

function normalizeForMatch(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function extractNormalizedWords(text) {
  const words = [];
  const regex = /[\p{L}\p{N}]+/gu;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const normalized = normalizeForMatch(match[0]);
    if (normalized) {
      words.push(normalized);
    }
  }
  return words;
}

function findOverlapWordCount(prevText, nextText) {
  const prevWords = extractNormalizedWords(prevText);
  const nextWords = extractNormalizedWords(nextText);
  if (!prevWords.length || !nextWords.length) return 0;
  const maxOverlap = Math.min(prevWords.length, nextWords.length, OVERLAP_MAX_WORDS);
  for (let size = maxOverlap; size >= OVERLAP_MIN_WORDS; size -= 1) {
    let matches = true;
    for (let i = 0; i < size; i += 1) {
      if (prevWords[prevWords.length - size + i] !== nextWords[i]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return size;
    }
  }
  return 0;
}

function trimLeadingWords(text, wordCount) {
  if (!wordCount) return text;
  const regex = /[\p{L}\p{N}]+/gu;
  let match;
  let count = 0;
  let cutIndex = 0;
  while ((match = regex.exec(text)) !== null) {
    count += 1;
    if (count === wordCount) {
      cutIndex = regex.lastIndex;
      break;
    }
  }
  if (count < wordCount) return "";
  const remainder = text.slice(cutIndex);
  return remainder.replace(/^[\s,;:.!?-]+/, "");
}

function removeOverlapFromStart(prevText, nextText) {
  const overlapWords = findOverlapWordCount(prevText, nextText);
  if (!overlapWords) return nextText.trim();
  return trimLeadingWords(nextText, overlapWords).trim();
}

function mergeTranscriptParts(parts) {
  let merged = "";
  let previousRaw = "";
  for (const part of parts) {
    const raw = (part || "").trim();
    if (!raw) {
      previousRaw = raw;
      continue;
    }
    if (!merged) {
      merged = raw;
      previousRaw = raw;
      continue;
    }
    const trimmed = removeOverlapFromStart(previousRaw, raw);
    if (trimmed) {
      merged = `${merged}\n\n${trimmed}`;
    }
    previousRaw = raw;
  }
  return merged;
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
  state.usage = { input: 0, output: 0, total: 0 };
  state.usageSeen = false;
  setProcessing(state.processing);
  elements.transcript.value = "";
  setTokens({ input: "—", output: "—", total: "—", estimate: "—" });
  updateUsageHint();
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
}

function sanitizeBaseName(name) {
  if (!name) return "audio";
  return name.replace(/\.[^/.]+$/, "").replace(/[^a-z0-9-_]+/gi, "-");
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

function buildSegmentPlan(durationSeconds) {
  const segments = [];
  let baseStart = 0;
  let index = 1;
  while (baseStart < durationSeconds) {
    const baseEnd = Math.min(durationSeconds, baseStart + SEGMENT_TARGET_SECONDS);
    const start = Math.max(0, baseStart - SEGMENT_OVERLAP_SECONDS);
    const end = Math.min(durationSeconds, baseEnd + SEGMENT_OVERLAP_SECONDS);
    segments.push({
      index,
      startSeconds: start,
      endSeconds: end,
      baseStartSeconds: baseStart,
      baseEndSeconds: baseEnd,
    });
    baseStart += SEGMENT_TARGET_SECONDS;
    index += 1;
  }
  return segments;
}

async function ffmpegSegmentByDuration(file, durationSeconds, options = {}) {
  const { signal } = options;
  throwIfAborted(signal);
  const totalSegments = Math.ceil(durationSeconds / SEGMENT_TARGET_SECONDS);
  setStatus(
    `Durée > ${formatDuration(SEGMENT_TARGET_SECONDS)} : découpe en ${totalSegments} segment(s) de ${formatDuration(
      SEGMENT_TARGET_SECONDS,
    )} avec chevauchement ${SEGMENT_OVERLAP_SECONDS}s.`,
  );
  const { instance: ffmpeg } = await loadFfmpeg();
  const inputExtension = getFileExtension(file);
  const inputName = `input.${inputExtension}`;
  const mimeType = mimeFromExtension(inputExtension);
  await ffmpeg.writeFile(inputName, await toUint8Array(file));

  const plan = buildSegmentPlan(durationSeconds);
  const chunks = [];
  try {
    for (const segment of plan) {
      throwIfAborted(signal);
      const segmentDuration = Math.max(0, segment.endSeconds - segment.startSeconds);
      const outputName = `segment-${String(segment.index).padStart(3, "0")}.${inputExtension}`;
      setProgressStatus(
        `Découpe FFmpeg : segment ${segment.index}/${plan.length} (${formatDuration(segmentDuration)}).`,
      );
      await ffmpeg.exec([
        "-ss",
        `${segment.startSeconds}`,
        "-i",
        inputName,
        "-t",
        `${segmentDuration}`,
        "-map",
        "0:a",
        "-c",
        "copy",
        outputName,
      ]);
      const data = await ffmpeg.readFile(outputName);
      await ffmpeg.deleteFile(outputName);
      chunks.push({
        blob: new Blob([data], { type: mimeType }),
        index: segment.index,
        extension: inputExtension,
        startSeconds: segment.startSeconds,
        endSeconds: segment.endSeconds,
      });
    }
  } finally {
    try {
      await ffmpeg.deleteFile(inputName);
    } catch (error) {
      // Ignore cleanup failures.
    }
  }
  progressLine = null;
  const totalSize = chunks.reduce((sum, chunk) => sum + chunk.blob.size, 0);
  setStatus(
    `Préparation terminée : ${chunks.length} segment(s) · ${formatBytes(totalSize)}.`,
  );
  return {
    chunks,
    totalSize,
    usedOriginal: false,
    usedCompression: true,
  };
}

async function prepareFile(file, options = {}) {
  const { signal } = options;
  throwIfAborted(signal);
  const duration = await getAudioDuration(file);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Durée audio invalide.");
  }
  throwIfAborted(signal);

  if (duration <= SEGMENT_TARGET_SECONDS) {
    setStatus("Fichier accepté sans découpage.");
    return {
      chunks: [{ blob: file, index: 1, isOriginal: true }],
      totalSize: file.size,
      usedOriginal: true,
    };
  }

  return ffmpegSegmentByDuration(file, duration, { signal });
}

function cancelTranscription() {
  if (!state.processing || !state.abortController) return;
  state.cancelRequested = true;
  state.abortController.abort();
  setStatus("Annulation demandee.");
}

async function transcribeChunkWithRetry({
  apiKey,
  language,
  chunk,
  chunkIndex,
  totalChunks,
  file,
  baseName,
  signal,
}) {
  const filename = buildSegmentFilename(baseName, file, chunk);
  for (let attempt = 1; attempt <= MAX_TRANSCRIBE_ATTEMPTS; attempt += 1) {
    throwIfAborted(signal);
    const attemptLabel =
      MAX_TRANSCRIBE_ATTEMPTS > 1 ? ` (tentative ${attempt}/${MAX_TRANSCRIBE_ATTEMPTS})` : "";
    setStatus(`Transcription segment ${chunkIndex + 1}/${totalChunks}${attemptLabel}...`);

    const formData = new FormData();
    formData.append("file", chunk.blob, filename);
    formData.append("model", MODEL_ID);
    if (language) {
      formData.append("language", language);
    }

    let response;
    try {
      response = await fetch(PROVIDER_CONFIG.endpoint, {
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
      const message = parsedMessage || errorText || `Erreur API ${PROVIDER_CONFIG.label}.`;
      throw new Error(message.trim());
    }

    return response.json();
  }
  throw new Error("Echec transcription segment.");
}

async function transcribe() {
  const apiKey = elements.apiKey.value.trim();
  const language = elements.language.value.trim();
  const file = state.file;

  if (!apiKey) {
    clearStatus();
    setStatus(`Veuillez renseigner votre clé API ${PROVIDER_CONFIG.label}.`);
    return;
  }
  if (!file) {
    clearStatus();
    setStatus("Veuillez sélectionner un fichier audio.");
    return;
  }

  state.cancelRequested = false;
  setProcessing(true);
  elements.transcribeBtn.textContent = "Traitement...";
  resetTranscriptionState();
  clearStatus();
  setStatus("Analyse du fichier audio…");

  try {
    const baseName = sanitizeBaseName(file.name);
    const controller = new AbortController();
    state.abortController = controller;
    const { signal } = controller;

    const { chunks, totalSize, usedOriginal } = await prepareFile(file, { signal });
    setSegments(chunks, file);
    if (!usedOriginal) {
      setStatus(`Taille finale : ${formatBytes(totalSize)}.`);
    }

    const totalChunks = chunks.length;
    if (!totalChunks) {
      throw new Error("Aucun segment a transcrire.");
    }
    const transcriptParts = new Array(totalChunks).fill("");
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

    const fullTranscript = mergeTranscriptParts(transcriptParts);
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
    setStatus("Transcription terminee. Chevauchements nettoyes.");
    return;
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
    const { chunks, totalSize } = await prepareFile(file);
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
clearStatus();
setStatus("Prêt pour une transcription.", true);
