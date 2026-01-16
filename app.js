const MAX_FILE_BYTES = 25 * 1024 * 1024;
const SAFE_CHUNK_BYTES = 24 * 1024 * 1024;
const TARGET_SAMPLE_RATE = 16000;
const WAV_HEADER_BYTES = 44;
const STORAGE_KEY = "callSynthesis.apiKey";
const STORAGE_REMEMBER = "callSynthesis.remember";

const elements = {
  apiKey: document.getElementById("apiKey"),
  rememberKey: document.getElementById("rememberKey"),
  clearKey: document.getElementById("clearKey"),
  model: document.getElementById("model"),
  language: document.getElementById("language"),
  dropzone: document.getElementById("dropzone"),
  fileInput: document.getElementById("fileInput"),
  fileMeta: document.getElementById("fileMeta"),
  audioPreview: document.getElementById("audioPreview"),
  transcribeBtn: document.getElementById("transcribeBtn"),
  statusLog: document.getElementById("statusLog"),
  transcript: document.getElementById("transcript"),
  copyBtn: document.getElementById("copyBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
  tokensInput: document.getElementById("tokensInput"),
  tokensOutput: document.getElementById("tokensOutput"),
  tokensTotal: document.getElementById("tokensTotal"),
  tokensEstimate: document.getElementById("tokensEstimate"),
  usageHint: document.getElementById("usageHint"),
};

const state = {
  file: null,
  objectUrl: null,
  usage: { input: 0, output: 0, total: 0 },
  usageSeen: false,
};

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

function setStatus(message, isIdle = false) {
  const line = document.createElement("div");
  line.className = `status-line${isIdle ? " idle" : ""}`;
  line.textContent = message;
  elements.statusLog.appendChild(line);
  elements.statusLog.scrollTop = elements.statusLog.scrollHeight;
}

function clearStatus() {
  elements.statusLog.innerHTML = "";
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

function setFile(file) {
  state.file = file;
  elements.transcribeBtn.disabled = !file;
  elements.transcript.value = "";
  setTokens({ input: "—", output: "—", total: "—", estimate: "—" });
  state.usage = { input: 0, output: 0, total: 0 };
  state.usageSeen = false;
  updateUsageHint();

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
    chunks.push({ blob, index });
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

  return {
    ...(await downsampleAndChunk(file)),
    usedOriginal: false,
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

  elements.transcribeBtn.disabled = true;
  elements.transcribeBtn.textContent = "Traitement...";
  elements.transcript.value = "";
  setTokens({ input: "—", output: "—", total: "—", estimate: "—" });
  state.usage = { input: 0, output: 0, total: 0 };
  state.usageSeen = false;
  updateUsageHint();
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
      const filename = chunk.isOriginal && file.name
        ? file.name
        : `${baseName}-part-${String(chunk.index).padStart(2, "0")}.wav`;
      formData.append("file", chunk.blob, filename);
      formData.append("model", model);
      formData.append("response_format", "verbose_json");
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
    setStatus("Transcription terminée ✅");
  } catch (error) {
    setStatus("Erreur pendant la transcription.");
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message);
  } finally {
    elements.transcribeBtn.disabled = !state.file;
    elements.transcribeBtn.textContent = "Transcrire le call";
  }
}

elements.fileInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0] || null;
  setFile(file);
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
clearStatus();
setStatus("Prêt pour une transcription.", true);
