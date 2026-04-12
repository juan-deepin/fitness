import {
  openDatabase,
  addCliente,
  addPlan,
  updatePlan,
  deletePlan,
  addPdfHistory,
  deletePdfHistoryByPlan,
  getPlanById,
  getConfig,
  upsertConfig,
  getAllPlanesWithCliente,
  getLatestPdfByPlanId
} from "./database.js";
import { buildPrompt, requestPlanFromAI } from "./aiService.js";
import { generatePlanPdf } from "./pdfGenerator.js";
import {
  DEFAULT_CONFIG,
  getFormData,
  validateClientData,
  sanitizeText,
  validatePlanJson,
  objectToBase64DataUrl,
  imagePathToDataUrl
} from "./utils.js";
import {
  setStatus,
  setLoadingState,
  renderPlanPreview,
  renderHistory,
  fillSettingsForm,
  applyBranding
} from "./ui.js";

const state = {
  config: { ...DEFAULT_CONFIG },
  currentPlanRecord: null,
  currentPlanStructured: null,
  retryPayload: null,
  logoDataUrl: "",
  loading: false
};

const refs = {
  form: document.querySelector("#clientForm"),
  settingsForm: document.querySelector("#settingsForm"),
  statusMessage: document.querySelector("#statusMessage"),
  settingsStatus: document.querySelector("#settingsStatus"),
  preview: document.querySelector("#planPreview"),
  historyList: document.querySelector("#historyList"),
  generateBtn: document.querySelector("#generateBtn"),
  clearFormBtn: document.querySelector("#clearFormBtn"),
  retryBtn: document.querySelector("#retryBtn"),
  downloadPdfBtn: document.querySelector("#downloadPdfBtn"),
  refreshHistoryBtn: document.querySelector("#refreshHistoryBtn"),
  logoInput: document.querySelector("#logoInput"),
  brandLogo: document.querySelector("#brandLogo"),
  brandName: document.querySelector("#brandName"),
  brandSlogan: document.querySelector("#brandSlogan")
};

init().catch((error) => {
  setStatus(refs.statusMessage, `Error inicial: ${error.message}`, "error");
});

async function init() {
  await openDatabase();

  const localConfig = await getConfig();
  state.config = {
    ...DEFAULT_CONFIG,
    ...(localConfig || {})
  };

  if (!state.config.logoBase64) {
    state.logoDataUrl = await imagePathToDataUrl("logo.jpeg");
    if (state.logoDataUrl) {
      state.config.logoBase64 = state.logoDataUrl;
      await upsertConfig(state.config);
    }
  } else {
    state.logoDataUrl = state.config.logoBase64;
  }

  applyBranding(state.config, refs);
  fillSettingsForm(refs.settingsForm, state.config);
  bindEvents();
  await refreshHistory();
}

function bindEvents() {
  refs.form.addEventListener("submit", onGeneratePlan);
  refs.clearFormBtn.addEventListener("click", onClearForm);
  refs.retryBtn.addEventListener("click", onRetry);
  refs.downloadPdfBtn.addEventListener("click", onDownloadCurrentPdf);
  refs.refreshHistoryBtn.addEventListener("click", refreshHistory);
  refs.settingsForm.addEventListener("submit", onSaveSettings);
  refs.logoInput.addEventListener("change", onLogoChange);
}

function onClearForm() {
  refs.form.reset();
  state.retryPayload = null;
  setStatus(refs.statusMessage, "Formulario limpio.", "ok");
  updateLoadingUI();
}

async function onGeneratePlan(event) {
  event.preventDefault();
  const formPayload = getFormData(refs.form);
  const validation = validateClientData(formPayload);

  if (!validation.ok) {
    setStatus(refs.statusMessage, validation.errors.join(" "), "error");
    return;
  }

  await processGeneration(formPayload);
}

async function processGeneration(formPayload) {
  try {
    state.loading = true;
    updateLoadingUI();
    setStatus(refs.statusMessage, "Guardando cliente y consultando IA...");

    const clienteId = await addCliente({
      nombre: formPayload.nombre,
      edad: formPayload.edad,
      peso: formPayload.peso,
      altura: formPayload.altura,
      sexo: formPayload.sexo,
      actividad: formPayload.actividad,
      objetivo: formPayload.objetivo,
      alergias: formPayload.alergias,
      restricciones: formPayload.restricciones,
      alimentos_no_deseados: formPayload.alimentos_no_deseados,
      observaciones: formPayload.observaciones,
      fecha_creacion: new Date().toISOString()
    });

    const prompt = buildPrompt(state.config.basePrompt, formPayload);
    const payloadIA = {
      ...formPayload,
      prompt_interno: prompt
    };

    state.retryPayload = formPayload;

    const aiResponse = await requestPlanFromAI(payloadIA, state.config);
    const plan = validatePlanJson(aiResponse);

    // Garantizar que plan.cliente siempre refleje los datos exactos del formulario.
    // Gemini puede omitir o alterar campos como peso y altura.
    plan.cliente = {
      ...(plan.cliente && typeof plan.cliente === "object" ? plan.cliente : {}),
      nombre: formPayload.nombre,
      edad: formPayload.edad,
      peso: formPayload.peso,
      altura: formPayload.altura,
      sexo: formPayload.sexo
    };

    const planId = await addPlan({
      clienteId,
      fecha: new Date().toISOString(),
      prompt_enviado: prompt,
      respuesta_ia: aiResponse,
      plan_estructurado: plan,
      objetivo: sanitizeText(plan.objetivo || formPayload.objetivo),
      calorias_estimadas: sanitizeText(plan.calorias_estimadas || "N/A"),
      pdf_generado: false,
      nombre_archivo_pdf: ""
    });

    state.currentPlanRecord = await getPlanById(planId);
    state.currentPlanStructured = plan;

    renderPlanPreview(refs.preview, plan);
    setStatus(refs.statusMessage, "Plan generado correctamente. Generando PDF...", "ok");

    await generateAndStorePdf(state.currentPlanRecord, plan, true);
    await refreshHistory();
  } catch (error) {
    setStatus(
      refs.statusMessage,
      `No se pudo generar el plan. ${error.message} Usa Reintentar IA.`,
      "error"
    );
  } finally {
    state.loading = false;
    updateLoadingUI();
  }
}

async function onRetry() {
  if (!state.retryPayload) {
    setStatus(refs.statusMessage, "No hay solicitud previa para reintentar.", "error");
    return;
  }
  await processGeneration(state.retryPayload);
}

async function onDownloadCurrentPdf() {
  if (!state.currentPlanRecord || !state.currentPlanStructured) {
    setStatus(refs.statusMessage, "No hay plan activo para exportar.", "error");
    return;
  }

  try {
    await generateAndStorePdf(state.currentPlanRecord, state.currentPlanStructured, true);
    setStatus(refs.statusMessage, "PDF descargado correctamente.", "ok");
  } catch (error) {
    setStatus(refs.statusMessage, `Error al descargar PDF: ${error.message}`, "error");
  }
}

async function generateAndStorePdf(planRecord, planStructured, autoSave = false) {
  const pdf = await generatePlanPdf({
    plan: planStructured,
    config: state.config,
    logoDataUrl: state.config.logoBase64 || state.logoDataUrl
  });

  if (autoSave) {
    pdf.save();
  }

  const updated = {
    ...planRecord,
    pdf_generado: true,
    nombre_archivo_pdf: pdf.fileName
  };

  await updatePlan(updated);
  await addPdfHistory({
    planId: planRecord.id,
    clienteId: planRecord.clienteId,
    fecha: new Date().toISOString(),
    nombre_archivo_pdf: pdf.fileName,
    pdf_data_uri: pdf.dataUri
  });

  state.currentPlanRecord = updated;
  refs.downloadPdfBtn.disabled = false;
}

async function refreshHistory() {
  const plans = await getAllPlanesWithCliente();

  renderHistory(refs.historyList, plans, {
    onView: async (planId) => {
      const planRow = await getPlanById(planId);
      if (!planRow) return;

      state.currentPlanRecord = planRow;
      state.currentPlanStructured = planRow.plan_estructurado;
      renderPlanPreview(refs.preview, planRow.plan_estructurado);
      refs.downloadPdfBtn.disabled = false;
      setStatus(refs.statusMessage, "Plan cargado desde el historial.", "ok");
      window.scrollTo({ top: refs.preview.closest("section").offsetTop - 16, behavior: "smooth" });
    },
    onDownloadPdf: async (planId) => {
      const planRow = await getPlanById(planId);
      if (!planRow) return;

      const latestPdf = await getLatestPdfByPlanId(planId);
      if (latestPdf?.pdf_data_uri) {
        downloadDataUri(latestPdf.pdf_data_uri, latestPdf.nombre_archivo_pdf || "plan_nutricional.pdf");
        setStatus(refs.statusMessage, "PDF descargado desde historial local.", "ok");
        return;
      }

      await generateAndStorePdf(planRow, planRow.plan_estructurado, true);
      setStatus(refs.statusMessage, "PDF regenerado y descargado.", "ok");
    },
    onDelete: async (planId) => {
      await deletePlan(planId);
      await deletePdfHistoryByPlan(planId);
      if (state.currentPlanRecord?.id === planId) {
        state.currentPlanRecord = null;
        state.currentPlanStructured = null;
        renderPlanPreview(refs.preview, null);
        refs.downloadPdfBtn.disabled = true;
      }
      await refreshHistory();
      setStatus(refs.statusMessage, "Plan eliminado del historial local.", "ok");
    }
  });
}

async function onSaveSettings(event) {
  event.preventDefault();

  const payload = {
    ...state.config,
    brandName: sanitizeText(refs.settingsForm.brandName.value) || DEFAULT_CONFIG.brandName,
    brandSlogan: sanitizeText(refs.settingsForm.brandSlogan.value) || DEFAULT_CONFIG.brandSlogan,
    aiEndpoint: sanitizeText(refs.settingsForm.aiEndpoint.value),
    primaryColor: sanitizeText(refs.settingsForm.primaryColor.value) || DEFAULT_CONFIG.primaryColor,
    surfaceColor: sanitizeText(refs.settingsForm.surfaceColor.value) || DEFAULT_CONFIG.surfaceColor,
    basePrompt: sanitizeText(refs.settingsForm.basePrompt.value) || DEFAULT_CONFIG.basePrompt
  };

  state.config = payload;
  await upsertConfig(payload);
  applyBranding(state.config, refs);
  setStatus(refs.settingsStatus, "Configuracion guardada localmente.", "ok");
}

async function onLogoChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const dataUrl = await objectToBase64DataUrl(file);
    state.config.logoBase64 = dataUrl;
    state.logoDataUrl = dataUrl;
    await upsertConfig(state.config);
    applyBranding(state.config, refs);
    setStatus(refs.settingsStatus, "Logo actualizado y guardado en IndexedDB.", "ok");
  } catch (error) {
    setStatus(refs.settingsStatus, error.message, "error");
  }
}

function updateLoadingUI() {
  setLoadingState(state.loading, {
    generateBtn: refs.generateBtn,
    retryBtn: refs.retryBtn,
    downloadPdfBtn: refs.downloadPdfBtn,
    retryEnabled: Boolean(state.retryPayload),
    hasPlan: Boolean(state.currentPlanRecord)
  });
}

function downloadDataUri(dataUri, filename) {
  const anchor = document.createElement("a");
  anchor.href = dataUri;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
