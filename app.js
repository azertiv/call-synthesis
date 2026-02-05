const MODEL_ID = "voxtral-mini-latest";
const OPENAI_SUMMARY_MODEL_ID = "gpt-5-mini";
const OPENAI_SUMMARY_ENDPOINT = "https://api.openai.com/v1/responses";
const OPENAI_SUMMARY_MODEL_STORAGE = "callSynthesis.openAiSummaryModel";
const OPENAI_SUMMARY_REASONING_STORAGE = "callSynthesis.openAiSummaryReasoning";
const PROVIDER_CONFIG = {
  label: "Mistral",
  endpoint: "https://api.mistral.ai/v1/audio/transcriptions",
};
const STORAGE_KEY = "callSynthesis.apiKey";
const STORAGE_REMEMBER = "callSynthesis.remember";
const OPENAI_STORAGE_KEY = "callSynthesis.openAiApiKey";
const OPENAI_STORAGE_REMEMBER = "callSynthesis.openAiRemember";
const THEME_STORAGE = "callSynthesis.theme";
const HISTORY_STORAGE_KEY = "callSynthesis.history";
const HISTORY_ENABLED_KEY = "callSynthesis.historyEnabled";
const HISTORY_LIMIT = 30;
const PDF_FONT_FAMILY = "times";
// Ajuster selon vos tarifs API.
const TOKEN_PRICE_EUR_PER_1K = 0.002;

const ICONS = {
  open:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"/><path d="M12 5h7v7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"/><path d="M11 13L19 5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"/></svg>',
  rename:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"/></svg>',
  delete:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.6"/><path d="M9 7V5h6v2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.6"/><path d="M7 7l1 12h8l1-12" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"/><path d="M10 11v6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.6"/><path d="M14 11v6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.6"/></svg>',
  copy:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="5" y="5" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  clock:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.6"/></svg>',
};

const elements = {
  apiKey: document.getElementById("apiKey"),
  rememberKey: document.getElementById("rememberKey"),
  clearKey: document.getElementById("clearKey"),
  language: document.getElementById("language"),
  diarizationToggle: document.getElementById("diarizationToggle"),
  streamingToggle: document.getElementById("streamingToggle"),
  openAiKey: document.getElementById("openAiKey"),
  rememberOpenAiKey: document.getElementById("rememberOpenAiKey"),
  clearOpenAiKey: document.getElementById("clearOpenAiKey"),
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
  summarizeBtn: document.getElementById("summarizeBtn"),
  downloadSummaryBtn: document.getElementById("downloadSummaryBtn"),
  summaryOutput: document.getElementById("summaryOutput"),
  summaryTitleRow: document.getElementById("summaryTitleRow"),
  summaryTitleInput: document.getElementById("summaryTitleInput"),
  summaryModel: document.getElementById("summaryModel"),
  summaryReasoning: document.getElementById("summaryReasoning"),
  tokensInput: document.getElementById("tokensInput"),
  tokensOutput: document.getElementById("tokensOutput"),
  tokensTotal: document.getElementById("tokensTotal"),
  tokensEstimate: document.getElementById("tokensEstimate"),
  tokensPrice: document.getElementById("tokensPrice"),
  usageHint: document.getElementById("usageHint"),
  themeButtons: document.querySelectorAll("[data-theme-choice]"),
  themeCycle: document.getElementById("themeCycle"),
  topbar: document.querySelector(".topbar"),
  historyToggle: document.getElementById("historyToggle"),
  historyPanel: document.getElementById("historyPanel"),
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
  history: [],
  historyEnabled: true,
  historyQuery: "",
  activeHistoryId: null,
  summaryText: "",
  summaryTitle: "",
  summaryProcessing: false,
};

let progressLine = null;
let tokenLine = null;
const THEME_CHOICES = ["system", "light", "dark"];
const themeIconMap = {};
let topbarObserver = null;

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

function formatSpeakerLabel(segment) {
  if (!segment || typeof segment !== "object") return "";
  const raw =
    segment.speaker ??
    segment.speaker_id ??
    segment.speakerId ??
    segment.speaker_label ??
    segment.speakerLabel ??
    segment.speaker_name ??
    segment.speakerName;
  if (raw == null) return "";
  const value = String(raw).trim();
  if (!value) return "";
  const speakerMatch = value.match(/speaker[\s_-]*(\d+)/i);
  if (speakerMatch) return `Locuteur ${speakerMatch[1]}`;
  const locuteurMatch = value.match(/locuteur[\s_-]*(\d+)/i);
  if (locuteurMatch) return `Locuteur ${locuteurMatch[1]}`;
  if (/speaker|locuteur/i.test(value)) return value;
  if (value === "0") return "Locuteur 0";
  if (value === "1") return "Locuteur 1";
  return `Locuteur ${value}`;
}

function buildTranscriptFromSegments(segments, { diarize = false } = {}) {
  if (!Array.isArray(segments) || !segments.length) return "";
  return segments
    .map((segment) => {
      const text = (segment?.text || "").trim();
      if (!text) return "";
      if (!diarize) return text;
      const speaker = formatSpeakerLabel(segment);
      if (!speaker) return text;
      return `${speaker}: ${text}`;
    })
    .filter(Boolean)
    .join("\n");
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
  tokenLine = null;
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

function setProgressBar({ label, current, total, meta }) {
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
    if (meta) {
      elements.progressMeta.textContent = meta;
    } else {
      elements.progressMeta.textContent = safeTotal
        ? `${formatDuration(clampedCurrent)} / ${formatDuration(safeTotal)}`
        : "Preparation...";
    }
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
    elements.progressMeta.textContent = "—";
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
  updateSummaryControls();
}

function toTokenNumber(value) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatPriceEUR(value) {
  const formatted = value.toFixed(2).replace(".", ",");
  return `${formatted} €`;
}

function updateTokenStatusLine({ input, output, total, estimate }) {
  if (!elements.statusLog) return;
  if (!tokenLine) {
    tokenLine = document.createElement("div");
    tokenLine.className = "status-line tokens";
  }
  const parts = [
    `input ${input ?? "—"}`,
    `output ${output ?? "—"}`,
    `total ${total ?? "—"}`,
    `estimé ${estimate ?? "—"}`,
  ];
  tokenLine.textContent = `Tokens : ${parts.join(" · ")}`;
  elements.statusLog.appendChild(tokenLine);
  elements.statusLog.scrollTop = elements.statusLog.scrollHeight;
}

function setTokens({ input, output, total, estimate }) {
  if (elements.tokensInput) {
    elements.tokensInput.textContent = input ?? "—";
  }
  if (elements.tokensOutput) {
    elements.tokensOutput.textContent = output ?? "—";
  }
  if (elements.tokensTotal) {
    elements.tokensTotal.textContent = total ?? "—";
  }
  if (elements.tokensEstimate) {
    elements.tokensEstimate.textContent = estimate ?? "—";
  }
  const totalValue = toTokenNumber(total);
  const estimateValue = toTokenNumber(estimate);
  const tokenCount = totalValue ?? estimateValue;
  if (elements.tokensPrice) {
    if (tokenCount === null) {
      elements.tokensPrice.textContent = "—";
    } else {
      const price = (tokenCount / 1000) * TOKEN_PRICE_EUR_PER_1K;
      elements.tokensPrice.textContent = formatPriceEUR(price);
    }
  }
  updateTokenStatusLine({ input, output, total, estimate });
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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatSummaryHtml(text) {
  const escaped = escapeHtml(text);
  return escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function stripBoldMarkers(text) {
  return text.replace(/\*\*/g, "");
}

function setSummaryText(text) {
  const normalized = typeof text === "string" ? text.trim() : "";
  state.summaryText = normalized;
  if (!elements.summaryOutput) return;
  if (!normalized) {
    elements.summaryOutput.classList.add("is-empty");
    elements.summaryOutput.textContent = "La synthèse apparaîtra ici...";
    updateSummaryTitleVisibility();
    updateSummaryControls();
    return;
  }
  elements.summaryOutput.classList.remove("is-empty");
  elements.summaryOutput.innerHTML = formatSummaryHtml(normalized);
  updateSummaryTitleVisibility();
  updateSummaryControls();
}

function updateSummaryTitleVisibility() {
  if (!elements.summaryTitleRow) return;
  const hasSummary = Boolean(state.summaryText);
  elements.summaryTitleRow.hidden = !hasSummary;
  if (!hasSummary && elements.summaryTitleInput) {
    elements.summaryTitleInput.value = "";
  }
}

function sanitizeSummaryTitle(title) {
  if (!title) return "";
  return title
    .replace(/^#+\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/["'«»]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function setSummaryTitle(title, options = {}) {
  state.summaryTitle = sanitizeSummaryTitle(title);
  if (options.syncInput === false) return;
  if (elements.summaryTitleInput) {
    elements.summaryTitleInput.value = state.summaryTitle;
  }
}

function updateActiveHistoryTitle(title) {
  const nextTitle = sanitizeSummaryTitle(title);
  if (!nextTitle || !state.historyEnabled) return;
  const entry = state.history.find((item) => item.id === state.activeHistoryId);
  if (!entry) return;
  entry.title = nextTitle;
  saveHistoryEntries();
  renderHistory();
}

function clearSummary() {
  setSummaryText("");
  setSummaryTitle("");
}

function updateSummaryControls() {
  const transcriptText = elements.transcript?.value?.trim() || "";
  const canSummarize =
    Boolean(transcriptText) && !state.processing && !state.summaryProcessing;
  document.body.classList.toggle("has-transcript", Boolean(transcriptText));
  if (elements.summarizeBtn) {
    elements.summarizeBtn.disabled = !canSummarize;
    elements.summarizeBtn.textContent = state.summaryProcessing
      ? "Synthèse..."
      : "Générer la synthèse";
  }
  if (elements.downloadSummaryBtn) {
    elements.downloadSummaryBtn.disabled = !state.summaryText || state.summaryProcessing;
  }
}

function normalizeSummaryReasoning(value) {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }
  return "medium";
}

function buildOpenAiSummaryInput(transcript) {
  const system = [
    "Tu es un assistant expert en synthèse de calls professionnels.",
    "Tu écris en français clair, précis et factuel.",
  ].join(" ");
  const user = `Tu es un assistant destiné aux consultants en stratégie. Tu produis des comptes rendus clairs, structurés, exhaustifs et factuellement fiables à partir de notes, brouillons ou transcriptions (même imparfaites). Ton rôle est de restituer fidèlement et précisément le contenu d’un call, dans la langue source (français ou anglais), selon un format à deux niveaux.

# Key Points
- synthèse concise des points essentiels.

# Summary
- compte rendu complet, structuré et linéaire.

STRUCTURE DU LIVRABLE (STRICTE)

Tu dois produire uniquement le format ci-dessous, sans aucun texte avant ni après, sans introduction, sans conclusion, sans séparateurs.

# Key Points
- Point clé 1
- Point clé 2
- ...

# Summary

## 1. [Titre de section correspondant à une partie du call]
- ...
- ...

## 2. [Titre suivant]
- ...
- ...

[Optionnel — uniquement si pertinent]
## Decisions & Next Steps
- **Action** : … | **Owner** : … | **Deadline** : …
- **Decision** : …
- **Open point** : …

RÈGLES DE SYNTHÈSE

1) Key Points
- 5 à 10 bullets maximum.
- Résume les constats / enseignements clés du call.
- Aucune interprétation, aucune analyse, aucune recommandation.
- Chaque point est autonome, précis, et informatif.
- Mettre en **gras** tous les éléments clés : **data points, chiffres, dates, lieux, acteurs, noms propres, conclusions factuelles, décisions, actions**.
- Ne jamais omettre : chiffres, dates, noms propres, engagements, contraintes, oppositions/désaccords, questions ouvertes, décisions, actions/next steps.

2) Summary
- Doit être exhaustif dans le contenu (ne pas omettre d’informations pertinentes), mais concis dans la formulation.
- Respecte strictement le déroulé chronologique du call : ne pas réorganiser par logique “idéale”.
- Structuré en sections numérotées correspondant aux thèmes abordés au fil du call.
- Bullets courts, précis, factuels.
- Titres de sections descriptifs et clairs (ex. “Project Context”, “Operating Model”, “Key Constraints”, “Partnerships”, etc.).
- Si l’intervenant annonce une structure (“je vois trois points”), tu la restitues avec des sous-points numérotés i), ii), iii), etc.
- Mettre en **gras** tous les éléments clés : **noms propres, organisations, acronymes, chiffres, dates, lieux, métriques, décisions, actions**.
- Pas de verbes de parole (ex. “il dit”, “elle précise”, “ils mentionnent”), pas de formulations inutiles : aller droit au fait.
- Ne jamais omettre : chiffres, dates, noms propres, engagements, contraintes, oppositions/désaccords, questions ouvertes, décisions, actions/next steps.
- Ne pas multiplier les sous-bullets sans nécessité.

CORRECTION ET STANDARDISATION INTELLIGENTE (SILENCIEUSE)

Tu appliques une correction linguistique et contextuelle intelligente pour fiabiliser le texte :
- Corriger fautes de transcription, erreurs de frappe, grammaire.
- Identifier et rectifier les noms propres, marques, entreprises, produits, institutions, acronymes lorsqu’ils sont manifestement erronés mais reconnaissables.
- Harmoniser les formulations techniques / concepts sectoriels selon l’usage courant.
- Uniformiser les noms d’acteurs même s’ils sont mal orthographiés dans le texte source.
- Les corrections sont silencieuses : tu ne les annonces pas, tu les appliques directement.

SECTION “DECISIONS & NEXT STEPS” (QUAND PERTINENT)
- Ajouter une section “Decisions & Next Steps” à la fin du Summary uniquement si le call contient des décisions, actions, prochaines étapes, demandes ou points à clarifier.
- Inclure :
  - Actions avec Owner et Deadline si disponibles (sinon omettre le champ manquant).
  - Decisions explicites.
  - Open points (questions en suspens / informations à fournir / validations attendues).

À NE JAMAIS FAIRE
- Réorganiser le contenu pour “rendre plus logique”.
- Ajouter, extrapoler, interpréter ou recommander.
- Inventer des informations absentes.
- Ajouter une introduction, une conclusion, ou du méta-commentaire.
- Utiliser des séparateurs décoratifs.

Transcription :
${transcript}`;
  return [
    { role: "system", content: [{ type: "input_text", text: system }] },
    { role: "user", content: [{ type: "input_text", text: user }] },
  ];
}

function buildOpenAiTitleInput(summaryText) {
  const system = [
    "Tu génères des titres courts et clairs pour des comptes rendus de calls.",
    "Le titre est factuel, professionnel et sans fioritures.",
  ].join(" ");
  const user = `Donne un titre concis (4 à 7 mots) qui résume le call.
- Langue identique au call.
- Pas de guillemets, pas de ponctuation finale, pas de markdown.
- Évite les termes vagues (ex. "discussion", "réunion").

Synthèse :
${summaryText}`;
  return [
    { role: "system", content: [{ type: "input_text", text: system }] },
    { role: "user", content: [{ type: "input_text", text: user }] },
  ];
}

function extractOpenAiResponseText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }
  const output = Array.isArray(data?.output) ? data.output : [];
  const chunks = [];
  output.forEach((item) => {
    const content = Array.isArray(item?.content) ? item.content : [];
    content.forEach((part) => {
      if (typeof part?.text === "string") {
        chunks.push(part.text);
      }
    });
  });
  return chunks.join("").trim();
}

async function requestOpenAiSummary({ apiKey, transcript, model, reasoning }) {
  const payload = {
    model: model || OPENAI_SUMMARY_MODEL_ID,
    input: buildOpenAiSummaryInput(transcript),
    reasoning: { effort: normalizeSummaryReasoning(reasoning) },
  };
  const response = await fetch(OPENAI_SUMMARY_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const parsedMessage = extractApiErrorMessage(errorText);
    const message = parsedMessage || errorText || "Erreur API OpenAI.";
    throw new Error(message.trim());
  }

  const data = await response.json();
  const content = extractOpenAiResponseText(data);
  if (!content) {
    throw new Error("Réponse de synthèse vide.");
  }
  return {
    text: content,
    usage: data.usage,
  };
}

async function requestOpenAiTitle({ apiKey, summary, model, reasoning }) {
  const payload = {
    model: model || OPENAI_SUMMARY_MODEL_ID,
    input: buildOpenAiTitleInput(summary),
    reasoning: { effort: normalizeSummaryReasoning(reasoning) },
  };
  const response = await fetch(OPENAI_SUMMARY_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const parsedMessage = extractApiErrorMessage(errorText);
    const message = parsedMessage || errorText || "Erreur API OpenAI.";
    throw new Error(message.trim());
  }

  const data = await response.json();
  const content = extractOpenAiResponseText(data);
  if (!content) {
    throw new Error("Réponse de titre vide.");
  }
  return {
    text: content,
    usage: data.usage,
  };
}

async function summarizeTranscript() {
  const apiKey = elements.openAiKey?.value?.trim() || "";
  const transcriptText = elements.transcript.value.trim();
  const summaryModel =
    elements.summaryModel?.value?.trim() || OPENAI_SUMMARY_MODEL_ID;
  const summaryReasoning = normalizeSummaryReasoning(
    elements.summaryReasoning?.value?.trim(),
  );

  if (!apiKey) {
    clearStatus();
    setStatus("Veuillez renseigner votre clé API OpenAI.");
    return;
  }
  if (!transcriptText) {
    setStatus("Aucune transcription à synthétiser.");
    return;
  }
  if (state.summaryProcessing) {
    return;
  }

  state.summaryProcessing = true;
  setSummaryTitle("");
  updateSummaryControls();
  setStatus("Synthèse en cours...");

  try {
    const result = await requestOpenAiSummary({
      apiKey,
      transcript: transcriptText,
      model: summaryModel,
      reasoning: summaryReasoning,
    });
    setSummaryText(result.text);
    let titleMessage = "";
    try {
      const titleResult = await requestOpenAiTitle({
        apiKey,
        summary: result.text,
        model: summaryModel,
        reasoning: summaryReasoning,
      });
      setSummaryTitle(titleResult.text);
      updateActiveHistoryTitle(titleResult.text);
      titleMessage = " Titre mis à jour.";
    } catch (titleError) {
      titleMessage = " Titre indisponible.";
    }
    setStatus(`Synthèse générée.${titleMessage}`);
  } catch (error) {
    setStatus("Erreur pendant la synthèse.");
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message);
  } finally {
    state.summaryProcessing = false;
    updateSummaryControls();
  }
}

function buildSummaryFilename() {
  const baseName = sanitizeBaseName(state.file?.name || "");
  const safeBase = baseName && baseName !== "audio" ? baseName : "synthese";
  const date = new Date().toISOString().slice(0, 10);
  return `${safeBase}-synthese-${date}.pdf`;
}

function parseSummaryBlocks(text) {
  const lines = String(text || "").split(/\r?\n/);
  const blocks = [];
  let lastWasSpacer = false;
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      if (!lastWasSpacer) {
        blocks.push({ type: "spacer" });
        lastWasSpacer = true;
      }
      return;
    }
    lastWasSpacer = false;
    const headingMatch = trimmed.match(/^(#{1,2})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      let headingText = headingMatch[2].trim();
      headingText = headingText.replace(/^\[|\]$/g, "").replace(/:\s*$/, "");
      blocks.push({ type: level === 1 ? "h1" : "h2", text: headingText });
      return;
    }
    if (/^(Key points|Summary|Todolist)\s*:/i.test(trimmed)) {
      blocks.push({ type: "h1", text: trimmed.replace(/:\s*$/, "") });
      return;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      blocks.push({ type: "h2", text: trimmed });
      return;
    }
    if (/^[-•]\s+/.test(trimmed)) {
      blocks.push({ type: "bullet", text: trimmed.replace(/^[-•]\s+/, "") });
      return;
    }
    blocks.push({ type: "paragraph", text: trimmed });
  });
  return blocks;
}

function tokenizeBold(text) {
  const tokens = [];
  let bold = false;
  let buffer = "";
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "*" && text[i + 1] === "*") {
      if (buffer) {
        tokens.push({ text: buffer, bold });
        buffer = "";
      }
      bold = !bold;
      i += 1;
      continue;
    }
    buffer += text[i];
  }
  if (buffer) {
    tokens.push({ text: buffer, bold });
  }
  return tokens;
}

function splitTokensIntoPieces(tokens) {
  const pieces = [];
  tokens.forEach((token) => {
    token.text.split(/(\s+)/).forEach((part) => {
      if (!part) return;
      pieces.push({ text: part, bold: token.bold });
    });
  });
  return pieces;
}

function wrapPieces(doc, pieces, maxWidth, fontSize) {
  const lines = [];
  let current = [];
  let width = 0;

  const measure = (piece) => {
    doc.setFont(PDF_FONT_FAMILY, piece.bold ? "bold" : "normal");
    doc.setFontSize(fontSize);
    return doc.getTextWidth(piece.text);
  };

  const pushLine = () => {
    if (current.length) {
      lines.push(current);
      current = [];
      width = 0;
    }
  };

  pieces.forEach((piece) => {
    const isWhitespace = piece.text.trim() === "";
    if (isWhitespace && !current.length) {
      return;
    }
    const pieceWidth = measure(piece);
    if (pieceWidth > maxWidth && !isWhitespace) {
      pushLine();
      const parts = doc.splitTextToSize(piece.text, maxWidth);
      parts.forEach((part) => {
        const partPiece = { text: part, bold: piece.bold };
        const partWidth = measure(partPiece);
        current = [partPiece];
        width = partWidth;
        pushLine();
      });
      return;
    }
    if (width + pieceWidth > maxWidth && current.length) {
      pushLine();
      if (isWhitespace) {
        return;
      }
    }
    current.push(piece);
    width += pieceWidth;
  });

  pushLine();
  return lines;
}

function renderLineTokens(doc, line, x, y, fontSize) {
  let cursorX = x;
  line.forEach((piece) => {
    doc.setFont(PDF_FONT_FAMILY, piece.bold ? "bold" : "normal");
    doc.setFontSize(fontSize);
    doc.text(piece.text, cursorX, y);
    cursorX += doc.getTextWidth(piece.text);
  });
}

function renderRichTextBlock({ doc, text, x, y, maxWidth, fontSize, lineHeight, margin }) {
  const pieces = splitTokensIntoPieces(tokenizeBold(text));
  const lines = wrapPieces(doc, pieces, maxWidth, fontSize);
  const pageHeight = doc.internal.pageSize.getHeight();
  let cursorY = y;
  let firstLineY = null;
  lines.forEach((line) => {
    if (cursorY + lineHeight > pageHeight - margin) {
      doc.addPage();
      cursorY = margin;
    }
    if (firstLineY === null) {
      firstLineY = cursorY;
    }
    renderLineTokens(doc, line, x, cursorY, fontSize);
    cursorY += lineHeight;
  });
  return { y: cursorY, firstLineY };
}

function renderPlainTextBlock({
  doc,
  text,
  x,
  y,
  maxWidth,
  fontSize,
  fontStyle,
  lineHeight,
  margin,
}) {
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFont(PDF_FONT_FAMILY, fontStyle || "normal");
  doc.setFontSize(fontSize);
  const cleaned = stripBoldMarkers(text);
  const lines = doc.splitTextToSize(cleaned, maxWidth);
  let cursorY = y;
  lines.forEach((line) => {
    if (cursorY + lineHeight > pageHeight - margin) {
      doc.addPage();
      cursorY = margin;
    }
    doc.text(line, x, cursorY);
    cursorY += lineHeight;
  });
  return cursorY;
}

function downloadSummaryPdf() {
  const summaryText = state.summaryText.trim();
  if (!summaryText) return;
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) {
    setStatus("Bibliothèque PDF indisponible.");
    return;
  }
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 56;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  const title = state.summaryTitle || "Synthèse";

  let cursorY = margin;

  cursorY = renderPlainTextBlock({
    doc,
    text: title,
    x: margin,
    y: cursorY,
    maxWidth: contentWidth,
    fontSize: 16,
    fontStyle: "bold",
    lineHeight: 22,
    margin,
  });

  cursorY += 12;

  const blocks = parseSummaryBlocks(summaryText);
  const bodySize = 10;
  const bodyLineHeight = 15;
  const h1Size = 13;
  const h1LineHeight = 18;
  const h2Size = 11;
  const h2LineHeight = 16;
  const bulletIndent = 14;

  const addSpacing = (amount) => {
    if (cursorY + amount > pageHeight - margin) {
      doc.addPage();
      cursorY = margin;
      return;
    }
    cursorY += amount;
  };

  blocks.forEach((block) => {
    if (block.type === "spacer") {
      addSpacing(6);
      return;
    }
    if (block.type === "h1") {
      addSpacing(8);
      cursorY = renderPlainTextBlock({
        doc,
        text: block.text,
        x: margin,
        y: cursorY,
        maxWidth: contentWidth,
        fontSize: h1Size,
        fontStyle: "bold",
        lineHeight: h1LineHeight,
        margin,
      });
      addSpacing(4);
      return;
    }
    if (block.type === "h2") {
      addSpacing(6);
      cursorY = renderPlainTextBlock({
        doc,
        text: block.text,
        x: margin,
        y: cursorY,
        maxWidth: contentWidth,
        fontSize: h2Size,
        fontStyle: "bold",
        lineHeight: h2LineHeight,
        margin,
      });
      addSpacing(2);
      return;
    }
    if (block.type === "bullet") {
      const bulletX = margin;
      const textX = margin + bulletIndent;
      const rendered = renderRichTextBlock({
        doc,
        text: block.text,
        x: textX,
        y: cursorY,
        maxWidth: contentWidth - bulletIndent,
        fontSize: bodySize,
        lineHeight: bodyLineHeight,
        margin,
      });
      const bulletY = rendered.firstLineY ?? cursorY;
      doc.setFont(PDF_FONT_FAMILY, "normal");
      doc.setFontSize(bodySize);
      doc.text("•", bulletX, bulletY);
      cursorY = rendered.y + 2;
      return;
    }
    cursorY = renderRichTextBlock({
      doc,
      text: block.text,
      x: margin,
      y: cursorY,
      maxWidth: contentWidth,
      fontSize: bodySize,
      lineHeight: bodyLineHeight,
      margin,
    }).y;
    addSpacing(2);
  });

  doc.save(buildSummaryFilename());
  setStatus("Synthèse PDF téléchargée.");
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

function setPanelCollapsed(panel, collapsed) {
  if (!panel) return;
  const isCollapsed = Boolean(collapsed);
  panel.classList.toggle("is-collapsed", isCollapsed);
  const body = panel.querySelector(".panel-body");
  if (body) {
    body.hidden = isCollapsed;
  }
  const toggle = panel.querySelector("[data-panel-toggle]");
  if (toggle) {
    const label = isCollapsed ? "Afficher la section" : "Masquer la section";
    toggle.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
    toggle.setAttribute("aria-label", label);
    toggle.title = label;
    const labelNode = toggle.querySelector(".sr-only");
    if (labelNode) {
      labelNode.textContent = label;
    }
  }
}

function setPanelCollapsedById(panelId, collapsed) {
  if (!panelId) return;
  const panel = document.querySelector(`.collapsible-panel[data-panel-id="${panelId}"]`);
  setPanelCollapsed(panel, collapsed);
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
    const payload = serializeHistoryEntries(state.history);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    setStatus("Impossible de sauvegarder l'historique (stockage local plein ?).");
  }
}

function serializeHistoryEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : Date.now(),
    text: typeof entry.text === "string" ? entry.text : "",
    fileName: typeof entry.fileName === "string" ? entry.fileName : "",
    durationSeconds: Number.isFinite(entry.durationSeconds) ? entry.durationSeconds : null,
    usageSeen: Boolean(entry.usageSeen),
    tokens: {
      input: Number(entry.tokens?.input) || 0,
      output: Number(entry.tokens?.output) || 0,
      total: Number(entry.tokens?.total) || 0,
      estimate: Number(entry.tokens?.estimate) || 0,
    },
  }));
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

function setHistoryPanelOpen(isOpen) {
  if (!elements.historyPanel) return;
  document.body.classList.toggle("history-collapsed", !isOpen);
  document.body.classList.toggle("history-open", isOpen);
  elements.historyPanel.setAttribute("aria-hidden", isOpen ? "false" : "true");
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

function buildHistoryMetaItem(label, iconSvg) {
  const item = document.createElement("span");
  item.className = "history-meta-item";
  if (iconSvg) {
    const icon = document.createElement("span");
    icon.className = "history-meta-icon";
    icon.innerHTML = iconSvg;
    item.appendChild(icon);
  }
  const text = document.createElement("span");
  text.className = "history-meta-text";
  text.textContent = label;
  item.appendChild(text);
  return item;
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
    const metaItems = [];
    if (Number.isFinite(entry.durationSeconds)) {
      metaItems.push(buildHistoryMetaItem(formatDuration(entry.durationSeconds), ICONS.clock));
    }
    if (entry.tokens?.total) {
      metaItems.push(buildHistoryMetaItem(`Tokens ${entry.tokens.total}`));
    } else if (entry.tokens?.estimate) {
      metaItems.push(buildHistoryMetaItem(`Tokens estimés ${entry.tokens.estimate}`));
    }
    const dateLabel = formatHistoryDate(entry.createdAt);
    if (dateLabel) {
      metaItems.push(buildHistoryMetaItem(dateLabel));
    }
    metaItems.forEach((part) => {
      metaRow.appendChild(part);
    });

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
    if (metaItems.length) {
      item.appendChild(metaRow);
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
  document.body.classList.add("has-file");
  setPanelCollapsedById("hero", true);
  elements.transcript.value = entry.text;
  clearSummary();
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
    entries: serializeHistoryEntries(state.history),
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

function setFile(file) {
  state.file = file;
  document.body.classList.toggle("has-file", Boolean(file));
  setPanelCollapsedById("hero", Boolean(file));
  state.durationSeconds = null;
  state.usage = { input: 0, output: 0, total: 0 };
  state.usageSeen = false;
  setProcessing(state.processing);
  elements.transcript.value = "";
  clearSummary();
  setTokens({ input: "—", output: "—", total: "—", estimate: "—" });
  updateUsageHint();

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
  clearSummary();
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
    if (parsed.error && typeof parsed.error === "string") return parsed.error;
    if (parsed.error && typeof parsed.error === "object") {
      return JSON.stringify(parsed.error);
    }
    if (parsed.message) return String(parsed.message);
    if (Array.isArray(parsed.detail) && parsed.detail[0]?.msg) {
      return String(parsed.detail[0].msg);
    }
    if (parsed.detail) {
      return typeof parsed.detail === "string"
        ? parsed.detail
        : JSON.stringify(parsed.detail);
    }
  } catch (error) {
    // Ignore parse failures.
  }
  return "";
}

function parseSseEvent(rawEvent, onEvent) {
  if (!rawEvent) return;
  const lines = rawEvent.split(/\r?\n/);
  let eventName = "";
  const dataLines = [];
  for (const line of lines) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      let value = line.slice(5);
      if (value.startsWith(" ")) {
        value = value.slice(1);
      }
      dataLines.push(value);
    }
  }
  if (!dataLines.length) return;
  const dataString = dataLines.join("\n");
  let data;
  try {
    data = JSON.parse(dataString);
  } catch (error) {
    data = dataString;
  }
  onEvent({ event: eventName, data });
}

async function readSseStream(response, { signal, onEvent }) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Streaming SSE non supporté par le navigateur.");
  }
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    if (signal?.aborted) {
      await reader.cancel();
      throw createAbortError();
    }
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || "";
    for (const rawEvent of events) {
      parseSseEvent(rawEvent, onEvent);
    }
  }
  if (buffer.trim()) {
    parseSseEvent(buffer, onEvent);
  }
}

async function readTranscriptionStream(response, { signal, onPartial, onProgress }) {
  let partialText = "";
  let finalPayload = null;
  let hasTextDelta = false;
  const segmentTexts = [];

  await readSseStream(response, {
    signal,
    onEvent: ({ event, data }) => {
      if (!data || typeof data !== "object") return;
      const type = data.type || event;
      if (type === "transcription.text.delta") {
        if (typeof data.text === "string") {
          hasTextDelta = true;
          partialText += data.text;
          if (onPartial) {
            onPartial(partialText);
          }
        }
        return;
      }
      if (type === "transcription.segment") {
        if (typeof data.end === "number") {
          if (onProgress) {
            onProgress(data.end);
          }
        }
        if (!hasTextDelta && typeof data.text === "string") {
          segmentTexts.push(data.text);
          partialText = segmentTexts.join(" ");
          if (onPartial) {
            onPartial(partialText);
          }
        }
        return;
      }
      if (type === "transcription.done") {
        finalPayload = data;
        if (typeof data.text === "string") {
          partialText = data.text;
          if (onPartial) {
            onPartial(partialText);
          }
        }
      }
    },
  });

  if (!finalPayload) {
    finalPayload = { text: partialText };
  }
  return finalPayload;
}

function extensionFromMimeType(mimeType) {
  const base = (mimeType || "audio/webm").split(";")[0];
  if (base.endsWith("webm")) return "webm";
  if (base.endsWith("mp4")) return "m4a";
  if (base.endsWith("aac")) return "aac";
  if (base.endsWith("mpeg")) return "mp3";
  return "webm";
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

async function analyzeFile(file) {
  if (!file || state.processing) return;
  clearStatus();
  setStatus("Analyse du fichier audio…");

  try {
    const duration = await getAudioDuration(file);
    if (state.file !== file) return;
    state.durationSeconds = Number.isFinite(duration) ? duration : null;
    if (Number.isFinite(duration)) {
      setStatus(`Durée : ${formatDuration(duration)}.`);
    }
  } catch (error) {
    setStatus("Erreur pendant l'analyse.");
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message);
  }
}

function cancelTranscription() {
  if (!state.processing || !state.abortController) return;
  state.cancelRequested = true;
  state.abortController.abort();
  setStatus("Annulation demandee.");
}

async function transcribeFile({
  apiKey,
  language,
  diarize,
  stream,
  onPartial,
  onProgress,
  file,
  signal,
}) {
  const filename = file?.name || `audio.${getFileExtension(file)}`;
  throwIfAborted(signal);

  const formData = new FormData();
  formData.append("file", file, filename);
  formData.append("model", MODEL_ID);
  if (language) {
    formData.append("language", language);
  }
  if (diarize) {
    formData.append("diarize", "true");
  }
  if (stream) {
    formData.append("stream", "true");
  }

  let response;
  try {
    const headers = {
      Authorization: `Bearer ${apiKey}`,
    };
    if (stream) {
      headers.Accept = "text/event-stream";
    }
    response = await fetch(PROVIDER_CONFIG.endpoint, {
      method: "POST",
      headers,
      body: formData,
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    throw error;
  }

  if (!response.ok) {
    const errorText = await response.text();
    const parsedMessage = extractApiErrorMessage(errorText);
    const message = parsedMessage || errorText || `Erreur API ${PROVIDER_CONFIG.label}.`;
    throw new Error(message.trim());
  }

  if (!stream) {
    return response.json();
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream") || !response.body) {
    const data = await response.json();
    if (onPartial && typeof data.text === "string") {
      onPartial(data.text);
    }
    return data;
  }

  const progressHandler = onProgress ? (elapsedSeconds) => onProgress(elapsedSeconds) : null;

  return readTranscriptionStream(response, {
    signal,
    onPartial,
    onProgress: progressHandler,
  });
}

async function transcribe() {
  const apiKey = elements.apiKey.value.trim();
  const language = elements.language.value.trim();
  const diarize = Boolean(elements.diarizationToggle?.checked);
  let streamingEnabled = Boolean(elements.streamingToggle?.checked);
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
    if (diarize && streamingEnabled) {
      streamingEnabled = false;
      if (elements.streamingToggle) {
        elements.streamingToggle.checked = false;
      }
      setStatus("Diarisation incompatible avec le streaming SSE. Streaming désactivé.");
    }

    const controller = new AbortController();
    state.abortController = controller;
    const { signal } = controller;

    let durationSeconds = state.durationSeconds;
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      try {
        durationSeconds = await getAudioDuration(file);
      } catch (error) {
        durationSeconds = null;
      }
    }
    throwIfAborted(signal);
    const hasDuration = Number.isFinite(durationSeconds) && durationSeconds > 0;
    if (hasDuration) {
      state.durationSeconds = durationSeconds;
    }

    setProgressStatus("Transcription en cours...");
    setProgressBar({
      label: "Transcription en cours",
      current: 0,
      total: hasDuration ? durationSeconds : 0,
      meta: hasDuration ? `0 / ${formatDuration(durationSeconds)}` : "Transcription en cours...",
    });

    const updateLiveTranscript = streamingEnabled
      ? (text) => {
          elements.transcript.value = text;
        }
      : null;
    const updateProgress = streamingEnabled && hasDuration
      ? (elapsedSeconds) => {
          const clamped = Math.min(Math.max(elapsedSeconds, 0), durationSeconds);
          setProgressBar({
            label: "Transcription en cours",
            current: clamped,
            total: durationSeconds,
            meta: `${formatDuration(clamped)} / ${formatDuration(durationSeconds)}`,
          });
        }
      : null;

    const data = await transcribeFile({
      apiKey,
      language,
      diarize,
      stream: streamingEnabled,
      onPartial: updateLiveTranscript,
      onProgress: updateProgress,
      file,
      signal,
    });

    const rawText = typeof data.text === "string" ? data.text : "";
    const segmentsText = diarize ? buildTranscriptFromSegments(data.segments, { diarize }) : "";
    const transcriptValue = (segmentsText || rawText || "(Aucun texte retourne)").trim();
    elements.transcript.value = transcriptValue;
    applyUsage(data.usage);
    const estimatedTokens = estimateTokens(transcriptValue);
    if (!state.usageSeen) {
      setTokens({
        input: "—",
        output: "—",
        total: "—",
        estimate: estimatedTokens || "—",
      });
    } else {
      setTokens({
        input: state.usage.input || "—",
        output: state.usage.output || "—",
        total: state.usage.total || "—",
        estimate: estimatedTokens || "—",
      });
    }
    setStatus("Transcription terminee.");
    if (state.historyEnabled && transcriptValue.trim()) {
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

if (elements.diarizationToggle && elements.streamingToggle) {
  const syncStreamingAvailability = (showNotice = false) => {
    const diarize = Boolean(elements.diarizationToggle.checked);
    const streamingChecked = Boolean(elements.streamingToggle.checked);
    if (diarize && streamingChecked) {
      elements.streamingToggle.checked = false;
      if (showNotice) {
        setStatus("Diarisation incompatible avec le streaming SSE. Streaming désactivé.");
      }
    }
    elements.streamingToggle.disabled = diarize;
    if (diarize) {
      elements.streamingToggle.setAttribute("aria-disabled", "true");
    } else {
      elements.streamingToggle.removeAttribute("aria-disabled");
    }
  };
  syncStreamingAvailability(false);
  elements.diarizationToggle.addEventListener("change", () => {
    syncStreamingAvailability(true);
  });
  elements.streamingToggle.addEventListener("change", () => {
    syncStreamingAvailability(true);
  });
}

const panelToggles = document.querySelectorAll("[data-panel-toggle]");
panelToggles.forEach((toggle) => {
  const panel = toggle.closest(".collapsible-panel");
  if (panel) {
    setPanelCollapsed(panel, panel.classList.contains("is-collapsed"));
  }
  toggle.addEventListener("click", () => {
    const targetPanel = toggle.closest(".collapsible-panel");
    if (!targetPanel) return;
    const shouldCollapse = !targetPanel.classList.contains("is-collapsed");
    setPanelCollapsed(targetPanel, shouldCollapse);
  });
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

if (elements.summarizeBtn) {
  elements.summarizeBtn.addEventListener("click", () => {
    summarizeTranscript();
  });
}

if (elements.downloadSummaryBtn) {
  elements.downloadSummaryBtn.addEventListener("click", () => {
    downloadSummaryPdf();
  });
}

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

function cacheThemeIcons() {
  if (!elements.themeButtons?.length) return;
  elements.themeButtons.forEach((button) => {
    const choice = button.dataset.themeChoice;
    const svg = button.querySelector("svg");
    if (choice && svg && !themeIconMap[choice]) {
      themeIconMap[choice] = svg.outerHTML;
    }
  });
}

function getThemeLabel(choice) {
  if (choice === "light") return "Clair";
  if (choice === "dark") return "Sombre";
  return "Système";
}

function updateThemeCycleButton(choice) {
  if (!elements.themeCycle) return;
  cacheThemeIcons();
  const label = getThemeLabel(choice);
  const iconSlot = elements.themeCycle.querySelector(".theme-compact-icon");
  if (iconSlot) {
    iconSlot.innerHTML = themeIconMap[choice] || "";
  }
  const srOnly = elements.themeCycle.querySelector(".sr-only");
  if (srOnly) {
    srOnly.textContent = `Thème : ${label}`;
  }
  elements.themeCycle.setAttribute("aria-label", `Thème : ${label}`);
  elements.themeCycle.title = `Thème : ${label}`;
  elements.themeCycle.dataset.themeChoice = choice;
}

function getCurrentThemeChoice() {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") {
    return attr;
  }
  return "system";
}

function getNextThemeChoice(choice) {
  const index = THEME_CHOICES.indexOf(choice);
  const nextIndex = index === -1 ? 0 : (index + 1) % THEME_CHOICES.length;
  return THEME_CHOICES[nextIndex];
}

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
  updateThemeCycleButton(normalized);
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

function syncTopbarOffset() {
  if (!elements.topbar) return;
  const height = elements.topbar.getBoundingClientRect().height;
  if (height > 0) {
    document.documentElement.style.setProperty("--topbar-offset", `${height}px`);
  }
}

function initTopbarObserver() {
  if (!elements.topbar) return;
  syncTopbarOffset();
  if (window.ResizeObserver && !topbarObserver) {
    topbarObserver = new ResizeObserver(() => {
      syncTopbarOffset();
    });
    topbarObserver.observe(elements.topbar);
  }
  window.addEventListener("resize", syncTopbarOffset);
  window.addEventListener("orientationchange", syncTopbarOffset);
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => {
      syncTopbarOffset();
    });
  }
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

if (elements.themeCycle) {
  elements.themeCycle.addEventListener("click", () => {
    const current = getCurrentThemeChoice();
    const next = getNextThemeChoice(current);
    setThemeChoice(next);
  });
}

if (elements.historyToggle) {
  elements.historyToggle.addEventListener("click", () => {
    const isOpen = !document.body.classList.contains("history-collapsed");
    setHistoryPanelOpen(!isOpen);
  });
}

if (elements.historyCloseBtn) {
  elements.historyCloseBtn.addEventListener("click", () => {
    setHistoryPanelOpen(false);
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!document.body.classList.contains("history-collapsed")) {
    setHistoryPanelOpen(false);
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

if (elements.summaryModel) {
  elements.summaryModel.addEventListener("change", (event) => {
    const value = event.target.value;
    if (value) {
      localStorage.setItem(OPENAI_SUMMARY_MODEL_STORAGE, value);
    }
  });
}

if (elements.summaryReasoning) {
  elements.summaryReasoning.addEventListener("change", (event) => {
    const value = normalizeSummaryReasoning(event.target.value);
    localStorage.setItem(OPENAI_SUMMARY_REASONING_STORAGE, value);
  });
}

if (elements.summaryTitleInput) {
  elements.summaryTitleInput.addEventListener("input", (event) => {
    const value = event.target.value;
    setSummaryTitle(value, { syncInput: false });
    updateActiveHistoryTitle(value);
  });
  elements.summaryTitleInput.addEventListener("blur", () => {
    if (elements.summaryTitleInput) {
      elements.summaryTitleInput.value = state.summaryTitle;
    }
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
  setStatus("Clé API Mistral effacée.");
});

if (elements.rememberOpenAiKey) {
  elements.rememberOpenAiKey.addEventListener("change", (event) => {
    const remember = event.target.checked;
    if (remember) {
      localStorage.setItem(OPENAI_STORAGE_REMEMBER, "true");
      const key = elements.openAiKey?.value?.trim();
      if (key) {
        localStorage.setItem(OPENAI_STORAGE_KEY, key);
      }
    } else {
      localStorage.removeItem(OPENAI_STORAGE_REMEMBER);
      localStorage.removeItem(OPENAI_STORAGE_KEY);
    }
  });
}

if (elements.openAiKey) {
  elements.openAiKey.addEventListener("input", () => {
    if (elements.rememberOpenAiKey?.checked) {
      localStorage.setItem(OPENAI_STORAGE_KEY, elements.openAiKey.value.trim());
    }
  });
}

if (elements.clearOpenAiKey) {
  elements.clearOpenAiKey.addEventListener("click", () => {
    if (elements.openAiKey) {
      elements.openAiKey.value = "";
    }
    if (elements.rememberOpenAiKey) {
      elements.rememberOpenAiKey.checked = false;
    }
    localStorage.removeItem(OPENAI_STORAGE_KEY);
    localStorage.removeItem(OPENAI_STORAGE_REMEMBER);
    setStatus("Clé API OpenAI effacée.");
  });
}

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

function loadSummaryModelChoice() {
  if (!elements.summaryModel) return;
  const stored = localStorage.getItem(OPENAI_SUMMARY_MODEL_STORAGE);
  if (!stored) return;
  const option = elements.summaryModel.querySelector(`option[value="${stored}"]`);
  if (option) {
    elements.summaryModel.value = stored;
  }
}

function loadSummaryReasoningChoice() {
  if (!elements.summaryReasoning) return;
  const stored = localStorage.getItem(OPENAI_SUMMARY_REASONING_STORAGE);
  if (!stored) return;
  const normalized = normalizeSummaryReasoning(stored);
  const option = elements.summaryReasoning.querySelector(
    `option[value="${normalized}"]`,
  );
  if (option) {
    elements.summaryReasoning.value = normalized;
  }
}

function loadStoredOpenAiKey() {
  const remember = localStorage.getItem(OPENAI_STORAGE_REMEMBER) === "true";
  if (!remember) return;
  const key = localStorage.getItem(OPENAI_STORAGE_KEY);
  if (key && elements.openAiKey && elements.rememberOpenAiKey) {
    elements.openAiKey.value = key;
    elements.rememberOpenAiKey.checked = true;
  }
}

loadStoredKey();
loadStoredOpenAiKey();
loadSummaryModelChoice();
loadSummaryReasoningChoice();
loadThemeChoice();
initTopbarObserver();
loadHistoryState();
const shouldOpenHistory = !window.matchMedia("(max-width: 720px)").matches;
setHistoryPanelOpen(shouldOpenHistory);
setSegmentsVisibility(false);
clearSummary();
updateSummaryControls();
clearStatus();
setStatus("Prêt.", true);
