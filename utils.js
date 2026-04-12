export const DEFAULT_CONFIG = {
  brandName: "THE BLACK FITNESS",
  brandSlogan: "TÚ TAMBIÉN PUEDES",
  aiEndpoint: "",
  primaryColor: "#f30463",
  surfaceColor: "#101010",
  basePrompt:
    "Actua como nutricionista deportivo profesional. Genera un plan de alimentacion mensual de 4 semanas para un cliente con los siguientes datos: nombre, edad, peso, altura, sexo, objetivo fisico, nivel de actividad, alergias, restricciones y alimentos no deseados. El plan debe ser practico, realista y facil de seguir. Organiza cada semana con comidas diarias segun el numero de comidas solicitado. Incluye opciones de desayuno, merienda, almuerzo y cena o su equivalente. Anade sustituciones de alimentos, recomendaciones generales y notas finales. Devuelve exclusivamente un JSON valido y estructurado, sin texto adicional fuera del JSON.",
  logoBase64: ""
};

export function sanitizeText(input) {
  if (input === null || input === undefined) {
    return "";
  }

  const text = String(input).trim();
  return text.replace(/[<>]/g, "");
}

export function escapeHtml(input) {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function formatDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Fecha invalida";
  }
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export function getFormData(formElement) {
  const formData = new FormData(formElement);
  const payload = Object.fromEntries(formData.entries());

  return {
    nombre: sanitizeText(payload.nombre),
    edad: Number(payload.edad),
    peso: Number(payload.peso),
    altura: Number(payload.altura),
    sexo: sanitizeText(payload.sexo),
    objetivo: sanitizeText(payload.objetivo),
    actividad: sanitizeText(payload.actividad),
    comidas_por_dia: Number(payload.comidas_por_dia),
    alergias: sanitizeText(payload.alergias),
    restricciones: sanitizeText(payload.restricciones),
    alimentos_no_deseados: sanitizeText(payload.alimentos_no_deseados),
    observaciones: sanitizeText(payload.observaciones)
  };
}

export function validateClientData(data) {
  const errors = [];

  if (!data.nombre) errors.push("El nombre es obligatorio.");
  if (!Number.isFinite(data.edad) || data.edad < 10) errors.push("Edad invalida.");
  if (!Number.isFinite(data.peso) || data.peso <= 0) errors.push("Peso invalido.");
  if (!Number.isFinite(data.altura) || data.altura <= 0) errors.push("Altura invalida.");
  if (!data.sexo) errors.push("El sexo es obligatorio.");
  if (!data.objetivo) errors.push("El objetivo es obligatorio.");
  if (!data.actividad) errors.push("La actividad es obligatoria.");
  if (!Number.isFinite(data.comidas_por_dia) || data.comidas_por_dia < 3) {
    errors.push("El numero de comidas por dia es invalido.");
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

export function slugify(value) {
  return sanitizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function buildFilename(name) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const cleanName = slugify(name || "cliente");
  return `plan_nutricional_${cleanName}_${yyyy}${mm}${dd}.pdf`;
}

export function validatePlanJson(rawJson) {
  const plan = typeof rawJson === "string" ? safeParse(rawJson) : rawJson;
  if (!plan || typeof plan !== "object") {
    throw new Error("La respuesta de IA no es un objeto JSON valido.");
  }

  const requiredArrays = ["recomendaciones_generales", "semanas", "sustituciones", "notas_finales"];
  requiredArrays.forEach((key) => {
    if (!Array.isArray(plan[key])) {
      throw new Error(`El campo ${key} debe ser una lista.`);
    }
  });

  if (!plan.cliente || typeof plan.cliente !== "object") {
    throw new Error("El bloque cliente no existe en la respuesta IA.");
  }

  if (!plan.titulo || !plan.objetivo) {
    throw new Error("La respuesta IA no contiene titulo u objetivo.");
  }

  plan.semanas.forEach((week, index) => {
    if (!week || typeof week !== "object" || !week.semana || !Array.isArray(week.comidas)) {
      throw new Error(`Semana invalida en posicion ${index + 1}.`);
    }
  });

  return plan;
}

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error("No se pudo parsear el JSON devuelto por la IA.");
  }
}

export function objectToBase64DataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo de logo."));
    reader.readAsDataURL(file);
  });
}

export async function imagePathToDataUrl(path) {
  try {
    const response = await fetch(path);
    if (!response.ok) return "";
    const blob = await response.blob();
    return await objectToBase64DataUrl(blob);
  } catch (error) {
    return "";
  }
}
