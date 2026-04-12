import { escapeHtml, formatDate } from "./utils.js";

export function setStatus(element, message, type = "") {
  element.textContent = message;
  element.classList.remove("ok", "error");
  if (type) element.classList.add(type);
}

export function setLoadingState(loading, elements) {
  elements.generateBtn.disabled = loading;
  elements.retryBtn.disabled = loading || !elements.retryEnabled;
  elements.downloadPdfBtn.disabled = loading || !elements.hasPlan;
  if (loading) {
    elements.generateBtn.textContent = "Generando...";
  } else {
    elements.generateBtn.textContent = "Generar plan con IA";
  }
}

export function renderPlanPreview(container, plan) {
  if (!plan) {
    container.innerHTML = "<div class=\"empty-state\">Aun no se ha generado ningun plan.</div>";
    return;
  }

  const recomendaciones = (plan.recomendaciones_generales || [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  const sustituciones = (plan.sustituciones || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const notas = (plan.notas_finales || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");

  const weeksHtml = (plan.semanas || [])
    .map((week) => {
      const meals = (week.comidas || [])
        .map((meal) => `<li><strong>${escapeHtml(meal.tipo)}:</strong> ${escapeHtml(meal.descripcion)}</li>`)
        .join("");

      return `
        <article class="week-card">
          <h4>${escapeHtml(week.semana)}</h4>
          <ul>${meals}</ul>
        </article>
      `;
    })
    .join("");

  container.innerHTML = `
    <div class="plan-header">
      <h3>${escapeHtml(plan.titulo)}</h3>
      <p><strong>Cliente:</strong> ${escapeHtml(plan.cliente?.nombre || "N/A")}</p>
    </div>
    <div class="plan-grid">
      <div class="plan-box"><strong>Objetivo</strong><br />${escapeHtml(plan.objetivo || "N/A")}</div>
      <div class="plan-box"><strong>Calorias estimadas</strong><br />${escapeHtml(plan.calorias_estimadas || "N/A")}</div>
    </div>
    <div class="plan-box">
      <strong>Recomendaciones generales</strong>
      <ul>${recomendaciones}</ul>
    </div>
    <div class="plan-weeks">${weeksHtml}</div>
    <div class="plan-box">
      <strong>Sustituciones</strong>
      <ul>${sustituciones}</ul>
    </div>
    <div class="plan-box">
      <strong>Notas finales</strong>
      <ul>${notas}</ul>
    </div>
  `;
}

export function renderHistory(container, plans, handlers) {
  if (!plans.length) {
    container.innerHTML = "<div class=\"empty-state\">No hay planes guardados.</div>";
    return;
  }

  container.innerHTML = plans
    .map((plan) => {
      const customerName = plan.cliente?.nombre || plan.plan_estructurado?.cliente?.nombre || "Cliente";
      return `
        <article class="history-item">
          <div class="history-meta">
            <strong>${escapeHtml(customerName)}</strong><br />
            ${escapeHtml(formatDate(plan.fecha))} | Objetivo: ${escapeHtml(plan.objetivo || plan.plan_estructurado?.objetivo || "N/A")}
          </div>
          <div class="history-actions">
            <button class="btn btn-secondary" data-action="view" data-id="${plan.id}">Ver</button>
            <button class="btn btn-accent" data-action="pdf" data-id="${plan.id}">Descargar PDF</button>
            <button class="btn btn-secondary" data-action="delete" data-id="${plan.id}">Eliminar</button>
          </div>
        </article>
      `;
    })
    .join("");

  container.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      const id = Number(button.dataset.id);
      if (action === "view") handlers.onView(id);
      if (action === "pdf") handlers.onDownloadPdf(id);
      if (action === "delete") handlers.onDelete(id);
    });
  });
}

export function fillSettingsForm(form, config) {
  form.brandName.value = config.brandName || "";
  form.brandSlogan.value = config.brandSlogan || "";
  form.aiEndpoint.value = config.aiEndpoint || "";
  form.primaryColor.value = config.primaryColor || "#f30463";
  form.surfaceColor.value = config.surfaceColor || "#101010";
  form.basePrompt.value = config.basePrompt || "";
}

export function applyBranding(config, refs) {
  refs.brandName.textContent = config.brandName || "THE BLACK FITNESS";
  refs.brandSlogan.textContent = config.brandSlogan || "TÚ TAMBIÉN PUEDES";

  document.documentElement.style.setProperty("--primary", config.primaryColor || "#f30463");
  document.documentElement.style.setProperty("--surface", config.surfaceColor || "#101010");

  if (config.logoBase64) {
    refs.brandLogo.src = config.logoBase64;
  }
}
