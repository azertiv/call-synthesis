const MODEL_ID = "voxtral-mini-latest";
const PROVIDER_CONFIG = {
  label: "Mistral",
  endpoint: "https://api.mistral.ai/v1/audio/transcriptions",
};
const MAX_PARALLEL_REQUESTS = 3;
const FORCE_SEQUENTIAL_TRANSCRIPTION = true;
const MAX_TRANSCRIBE_ATTEMPTS = 3;
const RETRY_BACKOFF_BASE_MS = 700;
const RETRY_BACKOFF_MAX_MS = 8000;
const SEGMENT_TARGET_MINUTES = 20;
const SEGMENT_TARGET_SECONDS = SEGMENT_TARGET_MINUTES * 60;
const SEGMENT_OVERLAP_SECONDS = 10;
const FFMPEG_BASE_PATH = "vendor/ffmpeg/";
const FFMPEG_CORE_FILE = "ffmpeg-core.js";
const FFMPEG_WASM_FILE = "ffmpeg-core.wasm";
const STORAGE_KEY = "callSynthesis.apiKey";
const STORAGE_REMEMBER = "callSynthesis.remember";
const THEME_STORAGE = "callSynthesis.theme";
const HISTORY_STORAGE_KEY = "callSynthesis.history";
const HISTORY_ENABLED_KEY = "callSynthesis.historyEnabled";
const HISTORY_LIMIT = 30;
const HISTORY_PREVIEW_CHARS = 160;
const OVERLAP_MIN_WORDS = 6;
const OVERLAP_MAX_WORDS = 80;
const SEGMENT_DIAGNOSTICS_ENABLED = true;
const SEGMENT_DIAGNOSTIC_PREVIEW_CHARS = 80;
const SEGMENT_EMPTY_TEXT_MIN_SECONDS = 45;
const SEGMENT_EMPTY_TEXT_MIN_BYTES = 30000;
const SEGMENT_COVERAGE_TOLERANCE_SECONDS = 2;
const SEGMENT_SHORT_TEXT_MIN_SECONDS = 120;
const SEGMENT_SHORT_TEXT_CHARS_PER_SECOND = 0.5;
const SEGMENT_SHORT_TEXT_MIN_CHARS = 80;

const ICONS = {
  open:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"/><path d="M12 5h7v7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"/><path d="M11 13L19 5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"/></svg>',
  rename:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"/></svg>',
  delete:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.6"/><path d="M9 7V5h6v2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.6"/><path d="M7 7l1 12h8l1-12" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"/><path d="M10 11v6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.6"/><path d="M14 11v6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.6"/></svg>',
  copy:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="5" y="5" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
};

const elements = {
  apiKey: document.getElementById("apiKey"),
  rememberKey: document.getElementById("rememberKey"),
  clearKey: document.getElementById("clearKey"),
  language: document.getElementById("language"),
  dropzone: document.getElementById("dropzone"),
  globalDrop: document.getElementById("globalDrop"),
  fileInput: document.getElementById("fileInput"),
  fileMeta: document.getElementById("fileMeta"),
  audioPreview: document.getElementById("audioPreview"),
  transcribeBtn: document.getElementById("transcribeBtn"),
  cancelBtn: document.getElementById("cancelBtn"),
  statusLog: document.getElementById("statusLog"),
  progressBlock: document.getElementById("progressBlock"),
  progressTrack: document.getElementById("progressTrack"),
  progressFill: document.getElementById("progressFill"),
  progressLabel: document.getElementById("progressLabel"),
  progressValue: document.getElementById("progressValue"),
  progressMeta: document.getElementById("progressMeta"),
  transcript: document.getElementById("transcript"),
  copyBtn: document.getElementById("copyBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
  tokensInput: document.getElementById("tokensInput"),
  tokensOutput: document.getElementById("tokensOutput"),
  tokensTotal: document.getElementById("tokensTotal"),
  tokensEstimate: document.getElementById("tokensEstimate"),
  usageHint: document.getElementById("usageHint"),
  segmentsPanel: document.getElementById("segmentsPanel"),
  segmentsList: document.getElementById("segmentsList"),
  segmentsToggleBtn: document.getElementById("toggleSegmentsBtn"),
  segmentsCount: document.getElementById("segmentsCount"),
  downloadSegmentsBtn: document.getElementById("downloadSegmentsBtn"),
  themeButtons: document.querySelectorAll("[data-theme-choice]"),
  historyToggle: document.getElementById("historyToggle"),
  historyDrawer: document.getElementById("historyDrawer"),
  historyBackdrop: document.getElementById("historyBackdrop"),
  historyCloseBtn: document.getElementById("historyCloseBtn"),
  historyEnabled: document.getElementById("historyEnabled"),
  historySearch: document.getElementById("historySearch"),
  historyCount: document.getElementById("historyCount"),
  historyClearBtn: document.getElementById("historyClearBtn"),
  historyExportBtn: document.getElementById("historyExportBtn"),
  historyList: document.getElementById("historyList"),
  historyEmpty: document.getElementById("historyEmpty"),
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
  prepared: null,
  segmentsVisible: false,
  history: [],
  historyEnabled: true,
  historyQuery: "",
  activeHistoryId: null,
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

function formatTimestamp(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;
  if (hours) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function getSegmentDurationSeconds(chunk) {
  const start = Number(chunk?.startSeconds);
  const end = Number(chunk?.endSeconds);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, end - start);
}

function sortSegments(chunks) {
  return [...chunks].sort((a, b) => {
    const aStart = Number.isFinite(a?.startSeconds) ? a.startSeconds : 0;
    const bStart = Number.isFinite(b?.startSeconds) ? b.startSeconds : 0;
    if (aStart !== bStart) return aStart - bStart;
    const aIndex = Number.isFinite(a?.index) ? a.index : 0;
    const bIndex = Number.isFinite(b?.index) ? b.index : 0;
    return aIndex - bIndex;
  });
}

function normalizeSegments(chunks, durationSeconds) {
  if (!Array.isArray(chunks)) return [];
  const normalized = chunks.map((chunk, idx) => {
    const startSeconds = Number.isFinite(chunk?.startSeconds) ? chunk.startSeconds : 0;
    const endSeconds = Number.isFinite(chunk?.endSeconds)
      ? chunk.endSeconds
      : Number.isFinite(durationSeconds)
        ? durationSeconds
        : null;
    const index = Number.isFinite(chunk?.index) ? chunk.index : idx + 1;
    return { ...chunk, index, startSeconds, endSeconds };
  });
  return sortSegments(normalized);
}

function logSegmentPlan(chunks, durationSeconds) {
  if (!SEGMENT_DIAGNOSTICS_ENABLED) return;
  const durationLabel = Number.isFinite(durationSeconds)
    ? formatDuration(durationSeconds)
    : "—";
  setStatus(`Segments préparés : ${chunks.length} · durée audio ${durationLabel}.`, true);
  chunks.forEach((chunk, idx) => {
    const label = Number.isFinite(chunk?.index) ? chunk.index : idx + 1;
    const start = formatTimestamp(chunk?.startSeconds);
    const end = formatTimestamp(chunk?.endSeconds);
    const segmentDuration = getSegmentDurationSeconds(chunk);
    const durationText = Number.isFinite(segmentDuration)
      ? formatDuration(segmentDuration)
      : "—";
    const bytes = formatBytes(chunk?.blob?.size ?? 0);
    setStatus(`Segment ${label} : ${start} -> ${end} (${durationText}) · ${bytes}.`, true);
  });
  console.info(
    "Segments préparés",
    chunks.map((chunk, idx) => ({
      index: Number.isFinite(chunk?.index) ? chunk.index : idx + 1,
      startSeconds: chunk?.startSeconds ?? null,
      endSeconds: chunk?.endSeconds ?? null,
      bytes: chunk?.blob?.size ?? 0,
    })),
  );
}

function logSegmentResults(chunks, transcriptParts) {
  if (!SEGMENT_DIAGNOSTICS_ENABLED) return;
  setStatus("Segments transcrits :", true);
  chunks.forEach((chunk, idx) => {
    const label = Number.isFinite(chunk?.index) ? chunk.index : idx + 1;
    const text = (transcriptParts[idx] || "").trim();
    const normalized = text.replace(/\s+/g, " ").trim();
    const preview = normalized.slice(0, SEGMENT_DIAGNOSTIC_PREVIEW_CHARS);
    const suffix = normalized.length > SEGMENT_DIAGNOSTIC_PREVIEW_CHARS ? "..." : "";
    setStatus(
      `Segment ${label} : ${text.length} caract. · "${preview}${suffix}"`,
      true,
    );
  });
  console.info(
    "Segments transcrits",
    chunks.map((chunk, idx) => {
      const text = (transcriptParts[idx] || "").trim();
      return {
        index: Number.isFinite(chunk?.index) ? chunk.index : idx + 1,
        textLength: text.length,
        preview: text.replace(/\s+/g, " ").trim().slice(0, SEGMENT_DIAGNOSTIC_PREVIEW_CHARS),
      };
    }),
  );
}

function checkSegmentCoverage(chunks, durationSeconds) {
  const errors = [];
  const warnings = [];
  if (!Number.isFinite(durationSeconds) || !chunks.length) {
    return { errors, warnings };
  }
  const expected = Math.max(1, Math.ceil(durationSeconds / SEGMENT_TARGET_SECONDS));
  if (chunks.length !== expected) {
    errors.push(`Segments attendus : ${expected}, reçus : ${chunks.length}.`);
  }
  const indexSet = new Set();
  const duplicates = [];
  const missing = [];
  chunks.forEach((chunk, idx) => {
    const label = Number.isFinite(chunk?.index) ? chunk.index : idx + 1;
    if (indexSet.has(label)) {
      duplicates.push(label);
    }
    indexSet.add(label);
  });
  for (let i = 1; i <= expected; i += 1) {
    if (!indexSet.has(i)) {
      missing.push(i);
    }
  }
  if (missing.length) {
    errors.push(`Segments manquants : ${missing.join(", ")}.`);
  }
  if (duplicates.length) {
    errors.push(`Segments dupliqués : ${duplicates.join(", ")}.`);
  }
  const starts = chunks
    .map((chunk) => chunk?.startSeconds)
    .filter((value) => Number.isFinite(value));
  const ends = chunks
    .map((chunk) => chunk?.endSeconds)
    .filter((value) => Number.isFinite(value));
  if (starts.length && ends.length) {
    const minStart = Math.min(...starts);
    const maxEnd = Math.max(...ends);
    if (minStart > SEGMENT_COVERAGE_TOLERANCE_SECONDS) {
      warnings.push(
        `Couverture segments démarre à ${formatTimestamp(minStart)}.`,
      );
    }
    if (maxEnd < durationSeconds - SEGMENT_COVERAGE_TOLERANCE_SECONDS) {
      warnings.push(
        `Couverture segments s'arrête à ${formatTimestamp(maxEnd)}.`,
      );
    }
  }
  return { errors, warnings };
}

function isSuspiciousEmptyTranscript(chunk, text) {
  const trimmed = (text || "").trim();
  if (trimmed) return false;
  const duration = getSegmentDurationSeconds(chunk);
  const size = Number(chunk?.blob?.size ?? 0);
  if (Number.isFinite(duration) && duration < SEGMENT_EMPTY_TEXT_MIN_SECONDS) {
    return false;
  }
  if (Number.isFinite(size) && size < SEGMENT_EMPTY_TEXT_MIN_BYTES) {
    return false;
  }
  return true;
}

function isSuspiciouslyShortTranscript(chunk, text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return false;
  const duration = getSegmentDurationSeconds(chunk);
  if (!Number.isFinite(duration) || duration < SEGMENT_SHORT_TEXT_MIN_SECONDS) {
    return false;
  }
  const minChars = Math.max(
    SEGMENT_SHORT_TEXT_MIN_CHARS,
    Math.round(duration * SEGMENT_SHORT_TEXT_CHARS_PER_SECOND),
  );
  return trimmed.length < minChars;
}

function findTranscriptIssues(chunks, transcriptParts) {
  const missing = [];
  const empty = [];
  chunks.forEach((chunk, idx) => {
    const label = Number.isFinite(chunk?.index) ? chunk.index : idx + 1;
    if (typeof transcriptParts[idx] !== "string") {
      missing.push(label);
      return;
    }
    if (isSuspiciousEmptyTranscript(chunk, transcriptParts[idx])) {
      empty.push(label);
    }
  });
  return { missing, empty };
}

function formatHistoryDate(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}

function getFileBaseName(name) {
  if (!name) return "";
  return name.replace(/\.[^/.]+$/, "");
}

function buildHistoryTitle(file) {
  const baseName = getFileBaseName(file?.name || "");
  if (baseName.trim()) return baseName.trim();
  return `Transcription ${formatHistoryDate(Date.now())}`;
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
  resetProgressBar();
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

function setProgressBar({ label, current, total }) {
  if (!elements.progressBlock || !elements.progressTrack || !elements.progressFill) return;
  const safeTotal = Number.isFinite(total) && total > 0 ? total : 0;
  const safeCurrent = Number.isFinite(current) ? Math.max(0, current) : 0;
  const clampedCurrent = safeTotal ? Math.min(safeCurrent, safeTotal) : safeCurrent;
  const percent = safeTotal ? Math.round((clampedCurrent / safeTotal) * 100) : 0;
  elements.progressBlock.hidden = false;
  if (elements.progressLabel) {
    elements.progressLabel.textContent = label || "Transcription en cours";
  }
  if (elements.progressValue) {
    elements.progressValue.textContent = `${percent}%`;
  }
  if (elements.progressMeta) {
    elements.progressMeta.textContent = safeTotal
      ? `${clampedCurrent}/${safeTotal} segment${safeTotal > 1 ? "s" : ""}`
      : "Preparation...";
  }
  elements.progressTrack.setAttribute("aria-valuenow", String(percent));
  elements.progressFill.style.width = `${percent}%`;
}

function resetProgressBar() {
  if (!elements.progressBlock || !elements.progressTrack || !elements.progressFill) return;
  elements.progressBlock.hidden = true;
  elements.progressFill.style.width = "0%";
  elements.progressTrack.setAttribute("aria-valuenow", "0");
  if (elements.progressValue) {
    elements.progressValue.textContent = "0%";
  }
  if (elements.progressMeta) {
    elements.progressMeta.textContent = "0/0 segments";
  }
  if (elements.progressLabel) {
    elements.progressLabel.textContent = "Transcription en cours";
  }
}

function setProcessing(isProcessing) {
  state.processing = isProcessing;
  const hasFile = Boolean(state.file);
  elements.transcribeBtn.disabled = isProcessing || !hasFile;
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
  if (!elements.usageHint) return;
  elements.usageHint.textContent = state.usageSeen ? "Usage API." : "Estimation locale.";
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

function updateSegmentsCount() {
  if (!elements.segmentsCount) return;
  const count = state.segments.length;
  elements.segmentsCount.textContent = count ? String(count) : "—";
}

function setSegmentsVisibility(visible) {
  state.segmentsVisible = Boolean(visible);
  if (elements.segmentsPanel) {
    elements.segmentsPanel.classList.toggle("is-collapsed", !state.segmentsVisible);
  }
  if (elements.segmentsToggleBtn) {
    const label = state.segmentsVisible ? "Masquer les segments" : "Afficher les segments";
    elements.segmentsToggleBtn.setAttribute(
      "aria-expanded",
      state.segmentsVisible ? "true" : "false",
    );
    elements.segmentsToggleBtn.setAttribute("aria-label", label);
    elements.segmentsToggleBtn.title = label;
    const labelNode = elements.segmentsToggleBtn.querySelector(".sr-only");
    if (labelNode) {
      labelNode.textContent = label;
    }
  }
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
  elements.segmentsList.innerHTML = '<div class="segments-empty">Aucun segment.</div>';
  if (elements.downloadSegmentsBtn) {
    elements.downloadSegmentsBtn.disabled = true;
  }
  updateSegmentsCount();
}

function loadHistoryEntries() {
  const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const text = typeof entry.text === "string" ? entry.text : "";
        if (!text.trim()) return null;
        const createdAt = Number.isFinite(entry.createdAt) ? entry.createdAt : Date.now();
        const tokens = entry.tokens && typeof entry.tokens === "object" ? entry.tokens : {};
        return {
          id:
            typeof entry.id === "string"
              ? entry.id
              : `hist-${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
          title:
            typeof entry.title === "string" && entry.title.trim()
              ? entry.title.trim()
              : "Transcription sans titre",
          createdAt,
          text,
          fileName: typeof entry.fileName === "string" ? entry.fileName : "",
          durationSeconds: Number.isFinite(entry.durationSeconds) ? entry.durationSeconds : null,
          usageSeen: Boolean(entry.usageSeen),
          tokens: {
            input: Number(tokens.input) || 0,
            output: Number(tokens.output) || 0,
            total: Number(tokens.total) || 0,
            estimate: Number(tokens.estimate) || 0,
          },
        };
      })
      .filter(Boolean)
      .slice(0, HISTORY_LIMIT);
  } catch (error) {
    return [];
  }
}

function saveHistoryEntries() {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(state.history));
  } catch (error) {
    setStatus("Impossible de sauvegarder l'historique (stockage local plein ?).");
  }
}

function updateHistoryToggleLabel(isOpen) {
  if (!elements.historyToggle) return;
  const label = isOpen ? "Fermer l'historique" : "Ouvrir l'historique";
  elements.historyToggle.setAttribute("aria-label", label);
  elements.historyToggle.title = label;
  const labelNode = elements.historyToggle.querySelector(".sr-only");
  if (labelNode) {
    labelNode.textContent = label;
  }
}

function setHistoryDrawerOpen(isOpen) {
  if (!elements.historyDrawer) return;
  document.body.classList.toggle("history-open", isOpen);
  elements.historyDrawer.setAttribute("aria-hidden", isOpen ? "false" : "true");
  if (elements.historyBackdrop) {
    elements.historyBackdrop.setAttribute("aria-hidden", isOpen ? "false" : "true");
  }
  if (elements.historyToggle) {
    elements.historyToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }
  updateHistoryToggleLabel(isOpen);
  if (isOpen && elements.historySearch && !elements.historySearch.disabled) {
    elements.historySearch.focus();
  }
}

function normalizeHistoryQuery(query) {
  return (query || "").trim().toLowerCase();
}

function filterHistoryEntries(entries, query) {
  const normalizedQuery = normalizeHistoryQuery(query);
  if (!normalizedQuery) return entries;
  return entries.filter((entry) => {
    const haystack = `${entry.title} ${entry.fileName} ${entry.text}`.toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

function getHistoryPreview(text) {
  if (typeof text !== "string") return "";
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  if (cleaned.length <= HISTORY_PREVIEW_CHARS) return cleaned;
  return `${cleaned.slice(0, HISTORY_PREVIEW_CHARS)}...`;
}

function updateHistorySummary(filteredCount, totalCount, query) {
  if (!elements.historyCount) return;
  if (!state.historyEnabled) {
    elements.historyCount.textContent = "Historique désactivé";
    return;
  }
  if (!totalCount) {
    elements.historyCount.textContent = "Aucune transcription";
    return;
  }
  const suffix = totalCount > 1 ? "s" : "";
  if (query) {
    elements.historyCount.textContent = `${filteredCount} sur ${totalCount} transcription${suffix}`;
  } else {
    elements.historyCount.textContent = `${totalCount} transcription${suffix}`;
  }
}

function updateHistoryControls() {
  const hasHistory = state.history.length > 0;
  const enabled = state.historyEnabled;
  if (elements.historySearch) {
    elements.historySearch.disabled = !enabled;
  }
  if (elements.historyClearBtn) {
    elements.historyClearBtn.disabled = !enabled || !hasHistory;
  }
  if (elements.historyExportBtn) {
    elements.historyExportBtn.disabled = !enabled || !hasHistory;
  }
}

function setHistoryQuery(query) {
  state.historyQuery = (query || "").trim();
  renderHistory();
}

function renderHistory() {
  if (!elements.historyList) return;
  elements.historyList.innerHTML = "";
  const query = state.historyQuery;
  const filteredHistory = filterHistoryEntries(state.history, query);
  updateHistorySummary(filteredHistory.length, state.history.length, query);
  updateHistoryControls();
  if (!state.historyEnabled) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = "Historique désactivé.";
    elements.historyList.appendChild(empty);
    return;
  }
  if (!state.history.length) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = "Aucune transcription sauvegardée.";
    elements.historyList.appendChild(empty);
    return;
  }
  if (query && !filteredHistory.length) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = `Aucun résultat pour "${query}".`;
    elements.historyList.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  filteredHistory.forEach((entry) => {
    const item = document.createElement("div");
    item.className = `history-item${entry.id === state.activeHistoryId ? " active" : ""}`;
    item.tabIndex = 0;
    item.setAttribute("role", "button");
    item.addEventListener("click", () => openHistoryEntry(entry.id));
    item.addEventListener("keydown", (event) => {
      if (event.target !== item) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openHistoryEntry(entry.id);
      }
    });

    const titleRow = document.createElement("div");
    titleRow.className = "history-title";
    const title = document.createElement("span");
    title.className = "history-name";
    title.textContent = entry.title;
    titleRow.appendChild(title);
    if (entry.id === state.activeHistoryId) {
      const badge = document.createElement("span");
      badge.className = "history-badge";
      badge.textContent = "Actif";
      titleRow.appendChild(badge);
    }

    const metaRow = document.createElement("div");
    metaRow.className = "history-meta";
    const metaParts = [];
    if (entry.fileName) {
      metaParts.push(entry.fileName);
    }
    if (Number.isFinite(entry.durationSeconds)) {
      metaParts.push(`Durée ${formatDuration(entry.durationSeconds)}`);
    }
    if (entry.tokens?.total) {
      metaParts.push(`Tokens ${entry.tokens.total}`);
    } else if (entry.tokens?.estimate) {
      metaParts.push(`Tokens estimés ${entry.tokens.estimate}`);
    }
    const dateLabel = formatHistoryDate(entry.createdAt);
    if (dateLabel) {
      metaParts.push(dateLabel);
    }
    metaParts.forEach((part) => {
      const tag = document.createElement("span");
      tag.className = "history-tag";
      tag.textContent = part;
      metaRow.appendChild(tag);
    });

    const previewText = getHistoryPreview(entry.text);
    const preview = document.createElement("p");
    preview.className = "history-preview";
    preview.textContent = previewText;

    const actions = document.createElement("div");
    actions.className = "history-actions";

    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "ghost icon";
    openBtn.title = "Ouvrir";
    openBtn.setAttribute("aria-label", "Ouvrir");
    openBtn.innerHTML = `${ICONS.open}<span class="sr-only">Ouvrir</span>`;
    openBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      openHistoryEntry(entry.id);
    });

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "ghost icon";
    copyBtn.title = "Copier";
    copyBtn.setAttribute("aria-label", "Copier");
    copyBtn.innerHTML = `${ICONS.copy}<span class="sr-only">Copier</span>`;
    copyBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      copyHistoryEntry(entry.id);
    });

    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.className = "ghost icon";
    renameBtn.title = "Renommer";
    renameBtn.setAttribute("aria-label", "Renommer");
    renameBtn.innerHTML = `${ICONS.rename}<span class="sr-only">Renommer</span>`;
    renameBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      renameHistoryEntry(entry.id);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "ghost icon";
    deleteBtn.title = "Supprimer";
    deleteBtn.setAttribute("aria-label", "Supprimer");
    deleteBtn.innerHTML = `${ICONS.delete}<span class="sr-only">Supprimer</span>`;
    deleteBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteHistoryEntry(entry.id);
    });

    actions.appendChild(openBtn);
    actions.appendChild(copyBtn);
    actions.appendChild(renameBtn);
    actions.appendChild(deleteBtn);

    item.appendChild(titleRow);
    if (metaParts.length) {
      item.appendChild(metaRow);
    }
    if (previewText) {
      item.appendChild(preview);
    }
    item.appendChild(actions);
    fragment.appendChild(item);
  });

  elements.historyList.appendChild(fragment);
}

function setHistoryEnabled(enabled) {
  state.historyEnabled = Boolean(enabled);
  if (elements.historyEnabled) {
    elements.historyEnabled.checked = state.historyEnabled;
  }
  localStorage.setItem(HISTORY_ENABLED_KEY, state.historyEnabled ? "true" : "false");
  renderHistory();
}

function createHistoryEntry({ text, file, durationSeconds, usage, usageSeen, estimate }) {
  const createdAt = Date.now();
  const id = `hist-${createdAt}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    title: buildHistoryTitle(file),
    createdAt,
    text,
    fileName: file?.name || "",
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
    usageSeen: Boolean(usageSeen),
    tokens: {
      input: Number(usage?.input) || 0,
      output: Number(usage?.output) || 0,
      total: Number(usage?.total) || 0,
      estimate: Number(estimate) || 0,
    },
  };
}

function addHistoryEntry(entry) {
  if (!entry || typeof entry.text !== "string" || !entry.text.trim()) return;
  state.history = [entry, ...state.history.filter((item) => item.id !== entry.id)];
  if (state.history.length > HISTORY_LIMIT) {
    state.history = state.history.slice(0, HISTORY_LIMIT);
  }
  saveHistoryEntries();
  state.activeHistoryId = entry.id;
  if (state.historyEnabled) {
    renderHistory();
  }
}

function openHistoryEntry(id) {
  const entry = state.history.find((item) => item.id === id);
  if (!entry) return;
  elements.transcript.value = entry.text;
  const estimatedTokens = entry.tokens?.estimate || estimateTokens(entry.text);
  if (entry.usageSeen) {
    state.usage = {
      input: entry.tokens.input || 0,
      output: entry.tokens.output || 0,
      total: entry.tokens.total || 0,
    };
    state.usageSeen = true;
    setTokens({
      input: state.usage.input || "—",
      output: state.usage.output || "—",
      total: state.usage.total || "—",
      estimate: estimatedTokens || "—",
    });
  } else {
    state.usage = { input: 0, output: 0, total: 0 };
    state.usageSeen = false;
    setTokens({
      input: "—",
      output: "—",
      total: "—",
      estimate: estimatedTokens || "—",
    });
  }
  updateUsageHint();
  state.activeHistoryId = entry.id;
  renderHistory();
  setStatus(`Transcription chargée : ${entry.title}.`);
}

async function copyHistoryEntry(id) {
  const entry = state.history.find((item) => item.id === id);
  if (!entry) return;
  try {
    await navigator.clipboard.writeText(entry.text);
    setStatus(`Transcription copiée : ${entry.title}.`);
  } catch (error) {
    setStatus("Impossible de copier la transcription.");
  }
}

function renameHistoryEntry(id) {
  const entry = state.history.find((item) => item.id === id);
  if (!entry) return;
  const nextName = window.prompt("Nouveau nom pour la transcription :", entry.title);
  if (!nextName) return;
  const trimmed = nextName.trim();
  if (!trimmed) return;
  entry.title = trimmed;
  saveHistoryEntries();
  renderHistory();
}

function deleteHistoryEntry(id) {
  const entry = state.history.find((item) => item.id === id);
  if (!entry) return;
  const confirmed = window.confirm(`Supprimer "${entry.title}" de l'historique ?`);
  if (!confirmed) return;
  state.history = state.history.filter((item) => item.id !== id);
  if (state.activeHistoryId === id) {
    state.activeHistoryId = null;
  }
  saveHistoryEntries();
  renderHistory();
}

function clearHistoryEntries() {
  if (!state.history.length) return;
  const confirmed = window.confirm("Tout effacer de l'historique local ?");
  if (!confirmed) return;
  state.history = [];
  state.activeHistoryId = null;
  saveHistoryEntries();
  renderHistory();
  setStatus("Historique effacé.");
}

function exportHistoryEntries() {
  if (!state.history.length) return;
  const payload = {
    exportedAt: new Date().toISOString(),
    entries: state.history,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `neurow-transcribe-historique-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  setStatus("Historique exporté.");
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
  updateSegmentsCount();
}

function setFile(file) {
  state.file = file;
  state.durationSeconds = null;
  state.usage = { input: 0, output: 0, total: 0 };
  state.usageSeen = false;
  state.prepared = null;
  setProcessing(state.processing);
  elements.transcript.value = "";
  setTokens({ input: "—", output: "—", total: "—", estimate: "—" });
  updateUsageHint();
  clearSegments();
  setSegmentsVisibility(false);

  if (!file) {
    elements.fileMeta.textContent = "Aucun fichier.";
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
  void analyzeFile(file);
}

function resetTranscriptionState() {
  elements.transcript.value = "";
  setTokens({ input: "—", output: "—", total: "—", estimate: "—" });
  state.usage = { input: 0, output: 0, total: 0 };
  state.usageSeen = false;
  updateUsageHint();
  resetProgressBar();
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
    const chunks = normalizeSegments(
      [{ blob: file, index: 1, isOriginal: true, startSeconds: 0, endSeconds: duration }],
      duration,
    );
    return {
      chunks,
      totalSize: file.size,
      usedOriginal: true,
      durationSeconds: duration,
    };
  }

  const segmented = await ffmpegSegmentByDuration(file, duration, { signal });
  const chunks = normalizeSegments(segmented.chunks, duration);
  return { ...segmented, chunks, durationSeconds: duration };
}

async function analyzeFile(file) {
  if (!file || state.processing) return;
  state.cancelRequested = false;
  setProcessing(true);
  clearStatus();
  setStatus("Analyse du fichier audio…");

  const controller = new AbortController();
  state.abortController = controller;

  try {
    const prepared = await prepareFile(file, { signal: controller.signal });
    if (state.file !== file) return;
    state.prepared = { ...prepared, file };
    setSegments(prepared.chunks, file);
    if (!prepared.usedOriginal) {
      setStatus(`Taille finale : ${formatBytes(prepared.totalSize)}.`);
    }
  } catch (error) {
    if (state.cancelRequested || isAbortError(error)) {
      setStatus("Analyse annulee.");
    } else {
      setStatus("Erreur pendant l'analyse.");
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message);
    }
  } finally {
    state.cancelRequested = false;
    setProcessing(false);
    state.abortController = null;
  }
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

    const data = await response.json();
    const text = (data.text || "").trim();
    if (isSuspiciousEmptyTranscript(chunk, text)) {
      if (attempt < MAX_TRANSCRIBE_ATTEMPTS) {
        const delayMs = getRetryDelayMs(attempt);
        const delaySeconds = Math.round(delayMs / 100) / 10;
        setStatus(
          `Segment ${chunkIndex + 1}/${totalChunks} : transcription vide, nouvelle tentative dans ${delaySeconds}s.`,
        );
        await sleep(delayMs, signal);
        continue;
      }
      throw new Error(
        `Segment ${chunkIndex + 1}/${totalChunks} : transcription vide apres ${MAX_TRANSCRIBE_ATTEMPTS} tentative(s).`,
      );
    }
    if (isSuspiciouslyShortTranscript(chunk, text)) {
      if (attempt < MAX_TRANSCRIBE_ATTEMPTS) {
        const delayMs = getRetryDelayMs(attempt);
        const delaySeconds = Math.round(delayMs / 100) / 10;
        setStatus(
          `Segment ${chunkIndex + 1}/${totalChunks} : texte trop court, nouvelle tentative dans ${delaySeconds}s.`,
        );
        await sleep(delayMs, signal);
        continue;
      }
      throw new Error(
        `Segment ${chunkIndex + 1}/${totalChunks} : texte trop court (${text.length} caract.).`,
      );
    }

    return data;
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

    const cached = state.prepared && state.prepared.file === file;
    const prepared = cached ? state.prepared : await prepareFile(file, { signal });
    if (!cached) {
      state.prepared = { ...prepared, file };
    }
    const durationSeconds = Number.isFinite(prepared.durationSeconds)
      ? prepared.durationSeconds
      : state.durationSeconds;
    let { chunks, totalSize, usedOriginal } = prepared;
    chunks = normalizeSegments(chunks, durationSeconds);
    prepared.chunks = chunks;
    if (!state.segments.length) {
      setSegments(chunks, file);
    }
    if (!usedOriginal && !cached) {
      setStatus(`Taille finale : ${formatBytes(totalSize)}.`);
    }

    const totalChunks = chunks.length;
    if (!totalChunks) {
      throw new Error("Aucun segment a transcrire.");
    }
    logSegmentPlan(chunks, durationSeconds);
    const coverageCheck = checkSegmentCoverage(chunks, durationSeconds);
    coverageCheck.warnings.forEach((warning) => {
      setStatus(warning, true);
    });
    if (coverageCheck.errors.length) {
      throw new Error(coverageCheck.errors.join(" "));
    }
    const transcriptParts = new Array(totalChunks).fill("");
    setProgressStatus(`Transcription : 0/${totalChunks} segment(s) termines.`);
    setProgressBar({ label: "Transcription en cours", current: 0, total: totalChunks });

    const parallelLimit = FORCE_SEQUENTIAL_TRANSCRIPTION
      ? 1
      : Math.max(1, Math.min(MAX_PARALLEL_REQUESTS, totalChunks));
    if (FORCE_SEQUENTIAL_TRANSCRIPTION && totalChunks > 1) {
      setStatus("Mode sequentiel actif : transcription segment par segment.", true);
    }
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
              setProgressBar({
                label: "Transcription en cours",
                current: completed,
                total: totalChunks,
              });
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

    logSegmentResults(chunks, transcriptParts);
    const transcriptIssues = findTranscriptIssues(chunks, transcriptParts);
    if (transcriptIssues.missing.length || transcriptIssues.empty.length) {
      const details = [];
      if (transcriptIssues.missing.length) {
        details.push(`manquants: ${transcriptIssues.missing.join(", ")}`);
      }
      if (transcriptIssues.empty.length) {
        details.push(`sans texte: ${transcriptIssues.empty.join(", ")}`);
      }
      throw new Error(`Transcription incomplète (${details.join("; ")}).`);
    }

    const fullTranscript = mergeTranscriptParts(transcriptParts);
    const transcriptValue = fullTranscript || "(Aucun texte retourne)";
    elements.transcript.value = transcriptValue;
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
    if (state.historyEnabled && fullTranscript.trim()) {
      const entry = createHistoryEntry({
        text: transcriptValue,
        file,
        durationSeconds: state.durationSeconds,
        usage: state.usage,
        usageSeen: state.usageSeen,
        estimate: estimatedTokens,
      });
      addHistoryEntry(entry);
    }
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
    elements.transcribeBtn.textContent = "Transcrire";
    state.abortController = null;
    resetProgressBar();
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
  event.stopPropagation();
  elements.dropzone.classList.remove("dragover");
  dragDepth = 0;
  setGlobalDragActive(false);
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

if (elements.segmentsToggleBtn) {
  elements.segmentsToggleBtn.addEventListener("click", () => {
    setSegmentsVisibility(!state.segmentsVisible);
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

function isFileDrag(event) {
  const types = event.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes("Files");
}

let dragDepth = 0;

function setGlobalDragActive(isActive) {
  if (isActive) {
    document.body.classList.add("is-dragging");
    elements.dropzone.classList.add("dragover");
  } else {
    document.body.classList.remove("is-dragging");
    elements.dropzone.classList.remove("dragover");
  }
}

document.addEventListener("dragenter", (event) => {
  if (!isFileDrag(event)) return;
  dragDepth += 1;
  setGlobalDragActive(true);
});

document.addEventListener("dragover", (event) => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
});

document.addEventListener("dragleave", (event) => {
  if (!isFileDrag(event)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) {
    setGlobalDragActive(false);
  }
});

document.addEventListener("drop", (event) => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  dragDepth = 0;
  setGlobalDragActive(false);
  const file = event.dataTransfer?.files?.[0] || null;
  if (file) {
    setFile(file);
  }
});

document.addEventListener("dragend", () => {
  dragDepth = 0;
  setGlobalDragActive(false);
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

function loadHistoryState() {
  const stored = localStorage.getItem(HISTORY_ENABLED_KEY);
  state.historyEnabled = stored !== "false";
  if (elements.historyEnabled) {
    elements.historyEnabled.checked = state.historyEnabled;
  }
  state.history = loadHistoryEntries();
  renderHistory();
}

if (elements.themeButtons?.length) {
  elements.themeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setThemeChoice(button.dataset.themeChoice);
    });
  });
}

if (elements.historyToggle) {
  elements.historyToggle.addEventListener("click", () => {
    const isOpen = document.body.classList.contains("history-open");
    setHistoryDrawerOpen(!isOpen);
  });
}

if (elements.historyBackdrop) {
  elements.historyBackdrop.addEventListener("click", () => {
    setHistoryDrawerOpen(false);
  });
}

if (elements.historyCloseBtn) {
  elements.historyCloseBtn.addEventListener("click", () => {
    setHistoryDrawerOpen(false);
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (document.body.classList.contains("history-open")) {
    setHistoryDrawerOpen(false);
  }
});

if (elements.historySearch) {
  elements.historySearch.addEventListener("input", (event) => {
    setHistoryQuery(event.target.value);
  });
}

if (elements.historyClearBtn) {
  elements.historyClearBtn.addEventListener("click", () => {
    clearHistoryEntries();
  });
}

if (elements.historyExportBtn) {
  elements.historyExportBtn.addEventListener("click", () => {
    exportHistoryEntries();
  });
}

if (elements.historyEnabled) {
  elements.historyEnabled.addEventListener("change", (event) => {
    setHistoryEnabled(event.target.checked);
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
loadHistoryState();
setHistoryDrawerOpen(false);
setSegmentsVisibility(false);
clearStatus();
setStatus("Prêt.", true);
