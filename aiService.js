import { validatePlanJson } from "./utils.js";

export function buildPrompt(basePrompt, clientData) {
  return [
    basePrompt,
    "",
    "DATOS DEL CLIENTE:",
    `Nombre: ${clientData.nombre}`,
    `Edad: ${clientData.edad}`,
    `Peso: ${clientData.peso} kg`,
    `Altura: ${clientData.altura} cm`,
    `Sexo: ${clientData.sexo}`,
    `Objetivo: ${clientData.objetivo}`,
    `Actividad: ${clientData.actividad}`,
    `Comidas por dia: ${clientData.comidas_por_dia}`,
    `Alergias: ${clientData.alergias || "Ninguna"}`,
    `Restricciones: ${clientData.restricciones || "Ninguna"}`,
    `Alimentos no deseados: ${clientData.alimentos_no_deseados || "Ninguno"}`,
    `Observaciones: ${clientData.observaciones || "Sin observaciones"}`,
    "",
    "RESPUESTA OBLIGATORIA: JSON limpio valido con titulo, cliente, objetivo, calorias_estimadas, recomendaciones_generales, semanas, sustituciones, notas_finales.",
    "IMPORTANTE: las sustituciones deben ser personalizadas segun alergias, restricciones, alimentos no deseados, objetivo y actividad. Evitar listas genericas repetidas."
  ].join("\n");
}

export async function requestPlanFromAI(payload, config) {
  const configuredEndpoint = (config.aiEndpoint || "").trim();
  const autoEndpoint =
    window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
      ? "/api/generar-plan"
      : "";
  const endpoint = configuredEndpoint || autoEndpoint;
  const publicConfig = window.APP_CONFIG || {};
  const geminiApiKey = String(publicConfig.GEMINI_API_KEY || "").trim();
  const geminiModel = String(publicConfig.GEMINI_MODEL || "gemini-1.5-flash").trim();

  if (endpoint) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Error del endpoint IA (${response.status}).`);
      }

      const json = await response.json();
      return validatePlanJson(json);
    } catch (error) {
      console.warn("Fallo endpoint IA. Se intentara Gemini directo o simulacion.", error);
    }
  }

  if (geminiApiKey) {
    try {
      const json = await requestPlanFromGeminiDirect(payload, geminiApiKey, geminiModel);
      return validatePlanJson(json);
    } catch (error) {
      console.warn("Fallo Gemini directo. Se usa simulacion local.", error);
    }
  }

  return simulatePlan(payload);
}

async function requestPlanFromGeminiDirect(payload, apiKey, model) {
  const instruction =
    "Responde solo JSON valido, sin markdown ni texto extra. " +
    "El JSON debe incluir titulo, cliente, objetivo, calorias_estimadas, " +
    "recomendaciones_generales, semanas, sustituciones y notas_finales.";

  const prompt = String(payload.prompt_interno || "").trim();
  if (!prompt) {
    throw new Error("No se encontro prompt_interno para Gemini.");
  }

  const body = {
    contents: [
      {
        parts: [
          {
            text: `${instruction}\n\n${prompt}`
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 3072
    }
  };

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent` +
    `?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini HTTP ${response.status}: ${detail.slice(0, 250)}`);
  }

  const raw = await response.json();
  const candidates = raw?.candidates || [];
  if (!candidates.length) {
    throw new Error("Gemini no devolvio candidates.");
  }

  const parts = candidates?.[0]?.content?.parts || [];
  const text = parts
    .map((part) => (part && typeof part === "object" ? String(part.text || "") : ""))
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Gemini no devolvio texto util.");
  }

  return extractJsonFromText(text);
}

function extractJsonFromText(text) {
  let raw = String(text || "").trim();

  if (raw.startsWith("```")) {
    raw = raw.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    // Intentar extraer primer bloque JSON del texto.
  }

  const start = raw.indexOf("{");
  if (start < 0) {
    throw new Error("La respuesta de Gemini no contiene JSON.");
  }

  let depth = 0;
  for (let i = start; i < raw.length; i += 1) {
    const char = raw[i];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        const candidate = raw.slice(start, i + 1);
        return JSON.parse(candidate);
      }
    }
  }

  throw new Error("No se pudo extraer un JSON valido de Gemini.");
}

function simulatePlan(payload) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(
        validatePlanJson({
          titulo: "Plan de alimentacion mensual",
          cliente: {
            nombre: payload.nombre,
            edad: payload.edad,
            peso: payload.peso,
            altura: payload.altura,
            sexo: payload.sexo
          },
          objetivo: payload.objetivo,
          calorias_estimadas: estimateCalories(payload),
          recomendaciones_generales: [
            "Mantener hidratacion de 30-35 ml/kg al dia.",
            "Priorizar proteinas magras y verduras en cada comida.",
            "Registrar sensaciones de energia y digestion para ajustes semanales."
          ],
          semanas: [1, 2, 3, 4].map((n) => ({
            semana: `Semana ${n}`,
            comidas: buildSampleMeals(payload.comidas_por_dia, n)
          })),
          sustituciones: buildSampleSubstitutions(payload),
          notas_finales: [
            "Ajustar porciones segun progreso semanal.",
            "Mantener consistencia durante las 4 semanas."
          ]
        })
      );
    }, 1200);
  });
}

const WEEK_MEALS = [
  // Semana 1
  [
    { tipo: "Desayuno",  descripcion: "Avena con proteina en polvo, banana y semillas de chia." },
    { tipo: "Merienda",  descripcion: "Yogur griego natural con frutos rojos y nueces." },
    { tipo: "Almuerzo",  descripcion: "Pechuga de pollo a la plancha con arroz integral y ensalada verde." },
    { tipo: "Cena",      descripcion: "Salmon al horno con brocoli y pure de batata." },
    { tipo: "Snack",     descripcion: "Batido de proteina con leche descremada y banana." },
    { tipo: "Colacion",  descripcion: "Hummus con bastones de zanahoria y apio." }
  ],
  // Semana 2
  [
    { tipo: "Desayuno",  descripcion: "Tostadas integrales con huevos revueltos y aguacate." },
    { tipo: "Merienda",  descripcion: "Manzana con mantequilla de mani natural." },
    { tipo: "Almuerzo",  descripcion: "Tiras de pavo salteadas con quinoa y pimientos." },
    { tipo: "Cena",      descripcion: "Merluza al vapor con chauchas salteadas y papa cocida." },
    { tipo: "Snack",     descripcion: "Cottage con pepino y oregano." },
    { tipo: "Colacion",  descripcion: "Mix de frutos secos sin sal (30 g)." }
  ],
  // Semana 3
  [
    { tipo: "Desayuno",  descripcion: "Panqueques de avena y claras de huevo con miel y kiwi." },
    { tipo: "Merienda",  descripcion: "Kefir con granola sin azucar y arandanos." },
    { tipo: "Almuerzo",  descripcion: "Lomo de res magro con lentejas y ensalada de tomate." },
    { tipo: "Cena",      descripcion: "Pechuga de pollo al oregano con calabacin a la plancha y arroz integral." },
    { tipo: "Snack",     descripcion: "Batido verde con espinaca, pina y proteina." },
    { tipo: "Colacion",  descripcion: "Galletas de arroz con queso descremado." }
  ],
  // Semana 4
  [
    { tipo: "Desayuno",  descripcion: "Bowl de quinoa con leche vegetal, fresas y almendras." },
    { tipo: "Merienda",  descripcion: "Pera con queso ricotta y miel." },
    { tipo: "Almuerzo",  descripcion: "Atun en agua con pasta integral, tomate cherry y albahaca." },
    { tipo: "Cena",      descripcion: "Tofu salteado con verduras al wok, arroz basmati y salsa de soja baja en sodio." },
    { tipo: "Snack",     descripcion: "Batido de cacao puro, avena y leche descremada." },
    { tipo: "Colacion",  descripcion: "Edamame cocido con sal baja en sodio." }
  ]
];

function buildSampleMeals(mealsPerDay, weekNumber = 1) {
  const pool = WEEK_MEALS[(weekNumber - 1) % 4];
  const count = Number.isFinite(mealsPerDay) ? Math.max(3, Math.min(6, mealsPerDay)) : 4;
  return pool.slice(0, count);
}

function buildSampleSubstitutions(payload) {
  const objetivo = String(payload.objetivo || "").toLowerCase();
  const actividad = String(payload.actividad || "").toLowerCase();
  const alergias = String(payload.alergias || "").toLowerCase();
  const restricciones = String(payload.restricciones || "").toLowerCase();
  const noDeseados = String(payload.alimentos_no_deseados || "").toLowerCase();

  const isVeg = /(vegetar|vegano)/.test(restricciones);
  const sinLactosa = /(lactosa|leche|lacteo)/.test(alergias + " " + restricciones + " " + noDeseados);
  const sinGluten = /(gluten|trigo|harina)/.test(alergias + " " + restricciones + " " + noDeseados);
  const altaActividad = /(alto|muy alto)/.test(actividad);

  const list = [];

  if (isVeg) {
    list.push("Pollo o pavo por tofu firme, tempeh o seitan.");
    list.push("Atun o salmon por legumbres combinadas con quinoa.");
  } else {
    list.push("Pollo por pavo, merluza o lomo magro.");
    list.push("Carne roja magra por pescado azul 2-3 veces por semana.");
  }

  if (sinLactosa) {
    list.push("Yogur griego por yogur sin lactosa o yogur de coco sin azucar.");
    list.push("Leche descremada por bebida de almendra o soja enriquecida.");
  } else {
    list.push("Yogur natural por kefir o queso cottage bajo en grasa.");
  }

  if (sinGluten) {
    list.push("Pan integral o pasta por arroz, quinoa o papa cocida.");
  } else {
    list.push("Arroz blanco por arroz integral, quinoa o cuscus integral.");
  }

  if (/bajar grasa/.test(objetivo)) {
    list.push("Frutos secos libres por porcion medida de 20-30 g.");
    list.push("Salsas cremosas por yogur natural con limon y especias.");
  } else if (/aumentar masa muscular/.test(objetivo)) {
    list.push("Colacion simple por batido de proteina con avena y fruta.");
    list.push("Guarnicion pequena por porcion extra de carbohidrato complejo.");
  } else {
    list.push("Snacks ultraprocesados por fruta, yogur y frutos secos en porcion.");
  }

  if (altaActividad) {
    list.push("Pre-entreno bajo en energia por banana con miel y tostada integral.");
    list.push("Post-entreno incompleto por proteina + carbohidrato en la primera hora.");
  }

  return list.slice(0, 8);
}

function estimateCalories(payload) {
  const base = payload.sexo === "Masculino" ? 1850 : 1650;
  const activityMap = {
    Sedentario: 1.2,
    "Ligero (1-2 dias/semana)": 1.35,
    "Moderado (3-4 dias/semana)": 1.5,
    "Alto (5-6 dias/semana)": 1.65,
    "Muy alto (doble sesion)": 1.8
  };
  const multiplier = activityMap[payload.actividad] || 1.35;
  const objectiveOffset =
    payload.objetivo === "Bajar grasa" ? -300 : payload.objetivo === "Aumentar masa muscular" ? 250 : 0;

  return `${Math.round(base * multiplier + objectiveOffset)} kcal/dia`;
}
