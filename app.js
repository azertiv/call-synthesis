const MAX_FILE_BYTES = 25 * 1024 * 1024;
const SAFE_CHUNK_BYTES = 24 * 1024 * 1024;
const TARGET_SAMPLE_RATE = 16000;
const WAV_HEADER_BYTES = 44;
const COMPRESSION_SAFETY = 0.9;
const COPY_SAFETY = 0.85;
const COMPRESSION_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
];
const FFMPEG_VERSION = "0.12.6";
const FFMPEG_UTIL_VERSION = "0.12.0";
const FFMPEG_JS_URL = `https://unpkg.com/@ffmpeg/ffmpeg@${FFMPEG_VERSION}/dist/esm/index.js`;
const FFMPEG_UTIL_URL = `https://unpkg.com/@ffmpeg/util@${FFMPEG_UTIL_VERSION}/dist/esm/index.js`;
const FFMPEG_CORE_BASE = `https://unpkg.com/@ffmpeg/core@${FFMPEG_VERSION}/dist/umd`;
const FFMPEG_CORE_URL = `${FFMPEG_CORE_BASE}/ffmpeg-core.js`;
const FFMPEG_WASM_URL = `${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`;
const STORAGE_KEY = "callSynthesis.apiKey";
const STORAGE_REMEMBER = "callSynthesis.remember";
const PRICE_PER_MILLION = 1_000_000;
const MODEL_PRICING = {
  "gpt-4o-mini-transcribe": {
    perMinute: 0.003,
    textInputPer1M: 1.25,
    textOutputPer1M: 5.0,
    audioInputPer1M: 3.0,
  },
  "gpt-4o-transcribe": {
    perMinute: 0.006,
    textInputPer1M: 2.5,
    textOutputPer1M: 10.0,
    audioInputPer1M: 6.0,
  },
  "whisper-1": {
    perMinute: 0.006,
  },
};

const elements = {
  apiKey: document.getElementById("apiKey"),
  rememberKey: document.getElementById("rememberKey"),
  clearKey: document.getElementById("clearKey"),
  model: document.getElementById("model"),
  modelPriceHint: document.getElementById("modelPriceHint"),
  language: document.getElementById("language"),
  largeFileMode: document.getElementById("largeFileMode"),
  compression: document.getElementById("compression"),
  dropzone: document.getElementById("dropzone"),
  fileInput: document.getElementById("fileInput"),
  fileMeta: document.getElementById("fileMeta"),
  audioPreview: document.getElementById("audioPreview"),
  transcribeBtn: document.getElementById("transcribeBtn"),
  testBtn: document.getElementById("testBtn"),
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
};

const state = {
  file: null,
  objectUrl: null,
  usage: { input: 0, output: 0, total: 0 },
  usageSeen: false,
  durationSeconds: null,
  activeModel: null,
  processing: false,
};

const ffmpegState = {
  instance: null,
  util: null,
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

function createDownloadReporter(label) {
  let lastPercent = -1;
  let lastUpdate = 0;
  return (event) => {
    const now = Date.now();
    if (!event) return;
    if (!event.total || event.total <= 0) {
      if (!event.done && now - lastUpdate < 800) return;
      const received = Number.isFinite(event.received) ? formatBytes(event.received) : "…";
      setProgressStatus(`Téléchargement ${label} : ${received}`);
      lastUpdate = now;
      return;
    }
    const percent = Math.min(100, Math.round((event.received / event.total) * 100));
    if (!event.done && percent === lastPercent && now - lastUpdate < 500) return;
    lastPercent = percent;
    lastUpdate = now;
    setProgressStatus(`Téléchargement ${label} : ${percent}%`);
  };
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
  const pricing = MODEL_PRICING[model];
  if (!pricing) return "Tarif indisponible pour ce modèle.";
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

function estimatePriceFromUsage(model, usage) {
  const pricing = MODEL_PRICING[model];
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

function estimatePriceFromDuration(model, durationSeconds) {
  const pricing = MODEL_PRICING[model];
  if (!pricing || !Number.isFinite(pricing.perMinute)) return null;
  if (!Number.isFinite(durationSeconds)) return null;
  return (durationSeconds / 60) * pricing.perMinute;
}

function updatePriceDisplay() {
  if (!elements.priceTotal || !elements.priceHint) return;
  const model = (state.activeModel || elements.model.value || "").trim();
  const pricing = MODEL_PRICING[model];

  if (!pricing) {
    elements.priceTotal.textContent = "—";
    elements.priceHint.textContent = "Tarif indisponible pour ce modèle.";
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
    const usageCost = estimatePriceFromUsage(model, state.usage);
    if (usageCost != null) {
      cost = formatCost(usageCost);
      note = `Prix calculé à partir des tokens (${model}).`;
    }
  }

  if (cost == null) {
    const durationCost = estimatePriceFromDuration(model, state.durationSeconds);
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

function sanitizeBaseName(name) {
  if (!name) return "audio";
  return name.replace(/\.[^/.]+$/, "").replace(/[^a-z0-9-_]+/gi, "-");
}

function resolveResponseFormat(model) {
  if (model === "whisper-1") {
    return "verbose_json";
  }
  return "json";
}

function getCompressionSettings() {
  const value = elements.compression?.value ?? "128";
  const bitrateKbps = Number(value);
  const fallback = 128;
  const safeKbps = Number.isFinite(bitrateKbps) && bitrateKbps > 0 ? bitrateKbps : fallback;
  return {
    bitrate: safeKbps * 1000,
    label: `${safeKbps} kbit/s`,
  };
}

function getLargeFileMode() {
  return elements.largeFileMode?.value || "ffmpeg-copy";
}

function updateCompressionControls() {
  if (!elements.compression || !elements.largeFileMode) return;
  const mode = getLargeFileMode();
  const usesBitrate = mode === "ffmpeg-encode" || mode === "mediarecorder";
  elements.compression.disabled = !usesBitrate;
}

function pickCompressionMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  if (typeof MediaRecorder.isTypeSupported !== "function") {
    return "audio/webm";
  }
  for (const type of COMPRESSION_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return null;
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
    try {
      setProgressStatus("Chargement de FFmpeg.wasm (~32 Mo)...");
      const [{ FFmpeg }, util] = await Promise.all([
        import(FFMPEG_JS_URL),
        import(FFMPEG_UTIL_URL),
      ]);
      const ffmpeg = new FFmpeg();
      const coreURL = await util.toBlobURL(
        FFMPEG_CORE_URL,
        "text/javascript",
        true,
        createDownloadReporter("ffmpeg-core.js"),
      );
      const wasmURL = await util.toBlobURL(
        FFMPEG_WASM_URL,
        "application/wasm",
        true,
        createDownloadReporter("ffmpeg-core.wasm"),
      );
      setProgressStatus("Initialisation de FFmpeg...");
      await ffmpeg.load({ coreURL, wasmURL });
      progressLine = null;
      ffmpegState.instance = ffmpeg;
      ffmpegState.util = util;
      ffmpegState.loading = null;
      return ffmpegState;
    } catch (error) {
      ffmpegState.loading = null;
      progressLine = null;
      throw error;
    }
  })();
  return ffmpegState.loading;
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

async function recordSegment(audioContext, buffer, startTime, duration, mimeType, bitrate) {
  await audioContext.resume();
  return new Promise((resolve, reject) => {
    const destination = audioContext.createMediaStreamDestination();
    const source = audioContext.createBufferSource();
    const mute = audioContext.createGain();
    mute.gain.value = 0;
    source.buffer = buffer;
    source.connect(destination);
    source.connect(mute);
    mute.connect(audioContext.destination);

    const options = {};
    if (mimeType) {
      options.mimeType = mimeType;
    }
    if (bitrate) {
      options.audioBitsPerSecond = bitrate;
    }

    let recorder;
    try {
      recorder = new MediaRecorder(destination.stream, options);
    } catch (error) {
      reject(error);
      return;
    }

    const chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    recorder.onerror = (event) => {
      reject(event.error || new Error("Erreur MediaRecorder."));
    };
    recorder.onstop = () => {
      source.disconnect();
      mute.disconnect();
      destination.disconnect();
      const resolvedType = recorder.mimeType || mimeType || "audio/webm";
      resolve({
        blob: new Blob(chunks, { type: resolvedType }),
        mimeType: resolvedType,
      });
    };

    const safeDuration = Math.max(0.01, duration);
    source.onended = () => {
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
    };

    recorder.start();
    source.start(0, startTime, safeDuration);
  });
}

async function compressAndSegment(file, compression, mimeType) {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  audioContext.resume().catch(() => {});
  const arrayBuffer = await file.arrayBuffer();
  let decoded;
  try {
    decoded = await audioContext.decodeAudioData(arrayBuffer);
  } catch (error) {
    if (audioContext.close) {
      await audioContext.close();
    }
    throw error;
  }

  const duration = decoded.duration || 0;
  if (!Number.isFinite(duration) || duration <= 0) {
    if (audioContext.close) {
      await audioContext.close();
    }
    throw new Error("Durée audio invalide.");
  }
  const maxSegmentSeconds = Math.max(
    1,
    Math.floor((SAFE_CHUNK_BYTES * 8 * COMPRESSION_SAFETY) / compression.bitrate),
  );
  const segmentCount = Math.max(1, Math.ceil(duration / maxSegmentSeconds));
  const segmentDuration = duration / segmentCount;

  setStatus(
    `Compression ${compression.label} en temps réel (~${formatDuration(duration)}).`,
  );

  const chunks = [];
  try {
    for (let i = 0; i < segmentCount; i += 1) {
      const start = i * segmentDuration;
      const length = i === segmentCount - 1 ? duration - start : segmentDuration;
      setStatus(
        `Compression segment ${i + 1}/${segmentCount} (~${formatDuration(length)})…`,
      );
      const result = await recordSegment(
        audioContext,
        decoded,
        start,
        length,
        mimeType,
        compression.bitrate,
      );
      if (result.blob.size > MAX_FILE_BYTES) {
        throw new Error(
          "Segment compressé trop volumineux. Réduisez le débit ou utilisez la découpe WAV.",
        );
      }
      chunks.push({
        blob: result.blob,
        index: i + 1,
        extension: extensionFromMimeType(result.mimeType),
      });
    }
  } finally {
    if (audioContext.close) {
      await audioContext.close();
    }
  }

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

async function ffmpegCopySegment(file) {
  setStatus("FFmpeg : découpe rapide sans ré-encodage.");
  const { instance: ffmpeg, util } = await loadFfmpeg();
  const duration = await getAudioDuration(file);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Durée audio invalide.");
  }

  const inputExtension = getFileExtension(file);
  const inputName = `input.${inputExtension}`;
  const outputPrefix = "segment";
  const outputExtension = inputExtension;
  const outputPattern = `${outputPrefix}-%03d.${outputExtension}`;

  await ffmpeg.writeFile(inputName, await util.fetchFile(file));

  const estimatedBitrate = (file.size * 8) / duration;
  const maxSegmentSeconds = Math.max(
    1,
    Math.floor((SAFE_CHUNK_BYTES * 8 * COPY_SAFETY) / estimatedBitrate),
  );
  const sizeBasedCount = Math.ceil(file.size / (SAFE_CHUNK_BYTES * COPY_SAFETY));
  const timeBasedCount = Math.max(1, Math.ceil(duration / maxSegmentSeconds));
  const segmentCount = Math.max(sizeBasedCount, timeBasedCount);
  const segmentDuration = duration / segmentCount;

  setStatus(
    `Découpe FFmpeg : ${segmentCount} segment(s) d'env. ${formatDuration(segmentDuration)}.`,
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
      `${segmentDuration}`,
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

  const mimeType = mimeFromExtension(outputExtension);
  const chunks = await readFfmpegSegments(ffmpeg, outputPrefix, outputExtension, mimeType);
  const totalSize = chunks.reduce((sum, chunk) => sum + chunk.blob.size, 0);
  const oversized = chunks.find((chunk) => chunk.blob.size > MAX_FILE_BYTES);
  if (oversized) {
    throw new Error("Un segment dépasse 25 Mo. Essayez le ré-encodage FFmpeg.");
  }

  setStatus(
    `Préparation terminée : ${chunks.length} segment(s) · ${formatBytes(totalSize)}.`,
  );
  return {
    chunks,
    totalSize,
    usedOriginal: false,
    usedCompression: true,
    method: "ffmpeg-copy",
  };
}

async function ffmpegReencodeSegment(file, compression) {
  setStatus("FFmpeg : ré-encodage rapide.");
  const { instance: ffmpeg, util } = await loadFfmpeg();
  const duration = await getAudioDuration(file);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Durée audio invalide.");
  }

  const inputExtension = getFileExtension(file);
  const inputName = `input.${inputExtension}`;
  const outputPrefix = "segment";
  const outputExtension = "m4a";
  const outputPattern = `${outputPrefix}-%03d.${outputExtension}`;

  await ffmpeg.writeFile(inputName, await util.fetchFile(file));

  const maxSegmentSeconds = Math.max(
    1,
    Math.floor((SAFE_CHUNK_BYTES * 8 * COMPRESSION_SAFETY) / compression.bitrate),
  );
  const segmentCount = Math.max(1, Math.ceil(duration / maxSegmentSeconds));
  const segmentDuration = duration / segmentCount;

  setStatus(
    `Ré-encodage ${compression.label} : ${segmentCount} segment(s) d'env. ${formatDuration(
      segmentDuration,
    )}.`,
  );

  try {
    await clearFfmpegSegments(ffmpeg, outputPrefix);
    await ffmpeg.exec([
      "-i",
      inputName,
      "-vn",
      "-ac",
      "1",
      "-ar",
      `${TARGET_SAMPLE_RATE}`,
    "-c:a",
    "aac",
      "-b:a",
      `${Math.round(compression.bitrate / 1000)}k`,
      "-f",
      "segment",
      "-segment_time",
      `${segmentDuration}`,
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

  const mimeType = mimeFromExtension(outputExtension);
  const chunks = await readFfmpegSegments(ffmpeg, outputPrefix, outputExtension, mimeType);
  const totalSize = chunks.reduce((sum, chunk) => sum + chunk.blob.size, 0);
  const oversized = chunks.find((chunk) => chunk.blob.size > MAX_FILE_BYTES);
  if (oversized) {
    throw new Error("Un segment dépasse 25 Mo. Réduisez le débit.");
  }

  setStatus(
    `Préparation terminée : ${chunks.length} segment(s) · ${formatBytes(totalSize)}.`,
  );
  return {
    chunks,
    totalSize,
    usedOriginal: false,
    usedCompression: true,
    method: "ffmpeg-encode",
  };
}

async function downsampleAndChunk(file) {
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

async function prepareFile(file) {
  if (file.size <= MAX_FILE_BYTES) {
    setStatus("Fichier accepté sans compression.");
    return {
      chunks: [{ blob: file, index: 1, isOriginal: true }],
      totalSize: file.size,
      usedOriginal: true,
    };
  }

  const mode = getLargeFileMode();
  const compression = getCompressionSettings();

  if (mode === "ffmpeg-copy") {
    try {
      return await ffmpegCopySegment(file);
    } catch (error) {
      setStatus("Découpe FFmpeg impossible, tentative de ré-encodage.");
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message);
      try {
        return await ffmpegReencodeSegment(file, compression);
      } catch (innerError) {
        setStatus("Ré-encodage FFmpeg échoué, bascule en WAV.");
        const innerMessage = innerError instanceof Error ? innerError.message : String(innerError);
        setStatus(innerMessage);
      }
    }
  } else if (mode === "ffmpeg-encode") {
    try {
      return await ffmpegReencodeSegment(file, compression);
    } catch (error) {
      setStatus("Ré-encodage FFmpeg échoué, bascule en WAV.");
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message);
    }
  } else if (mode === "mediarecorder") {
    const mimeType = pickCompressionMimeType();
    if (mimeType === null) {
      setStatus("MediaRecorder indisponible, bascule en WAV.");
    } else {
      try {
        return await compressAndSegment(file, compression, mimeType);
      } catch (error) {
        setStatus("Compression temps réel échouée, bascule en WAV.");
        const message = error instanceof Error ? error.message : String(error);
        setStatus(message);
      }
    }
  } else {
    setStatus("Mode WAV sélectionné.");
  }

  return {
    ...(await downsampleAndChunk(file)),
    usedOriginal: false,
    usedCompression: false,
  };
}

async function transcribe() {
  const apiKey = elements.apiKey.value.trim();
  const model = elements.model.value.trim();
  const language = elements.language.value.trim();
  const file = state.file;

  if (!apiKey) {
    clearStatus();
    setStatus("Veuillez renseigner votre clé API OpenAI.");
    return;
  }
  if (!file) {
    clearStatus();
    setStatus("Veuillez sélectionner un fichier audio.");
    return;
  }

  state.activeModel = model;
  setProcessing(true);
  elements.transcribeBtn.textContent = "Traitement...";
  elements.transcript.value = "";
  setTokens({ input: "—", output: "—", total: "—", estimate: "—" });
  state.usage = { input: 0, output: 0, total: 0 };
  state.usageSeen = false;
  updateUsageHint();
  updatePriceDisplay();
  clearStatus();
  setStatus("Analyse du fichier audio…");

  try {
    const { chunks, totalSize, usedOriginal } = await prepareFile(file);
    const baseName = sanitizeBaseName(file.name);
    if (!usedOriginal) {
      setStatus(`Taille finale : ${formatBytes(totalSize)}.`);
    }

    const transcriptParts = [];
    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i];
      setStatus(`Transcription segment ${i + 1}/${chunks.length}…`);

      const formData = new FormData();
      const extension = chunk.extension || "wav";
      const filename = chunk.isOriginal && file.name
        ? file.name
        : `${baseName}-part-${String(chunk.index).padStart(2, "0")}.${extension}`;
      formData.append("file", chunk.blob, filename);
      formData.append("model", model);
      formData.append("response_format", resolveResponseFormat(model));
      if (language) {
        formData.append("language", language);
      }

      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        let message = errorText || "Erreur API OpenAI.";
        try {
          const parsed = JSON.parse(errorText);
          if (parsed.error?.message) {
            message = parsed.error.message;
          }
        } catch (err) {
          // Ignore JSON parse errors.
        }
        throw new Error(message);
      }

      const data = await response.json();
      const chunkText = (data.text || "").trim();
      transcriptParts.push(chunkText);

      if (data.usage) {
        const inputTokens = Number(data.usage.input_tokens ?? 0);
        const outputTokens = Number(data.usage.output_tokens ?? 0);
        const totalTokens = Number(data.usage.total_tokens ?? inputTokens + outputTokens);
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
    }

    const fullTranscript = transcriptParts.filter(Boolean).join("\n\n");
    elements.transcript.value = fullTranscript || "(Aucun texte retourné)";
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
    setStatus("Transcription terminée ✅");
  } catch (error) {
    setStatus("Erreur pendant la transcription.");
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message);
  } finally {
    setProcessing(false);
    elements.transcribeBtn.textContent = "Transcrire le call";
  }
}

async function testCompression() {
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
  setStatus("Test compression/segmentation (aucun appel API).");

  try {
    const { chunks, totalSize } = await prepareFile(file);
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
      elements.testBtn.textContent = "Tester compression";
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

if (elements.largeFileMode) {
  elements.largeFileMode.addEventListener("change", () => {
    updateCompressionControls();
  });
}

elements.transcribeBtn.addEventListener("click", () => {
  transcribe();
});

if (elements.testBtn) {
  elements.testBtn.addEventListener("click", () => {
    testCompression();
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
updateModelPriceHint();
updateCompressionControls();
updatePriceDisplay();
clearStatus();
setStatus("Prêt pour une transcription.", true);
