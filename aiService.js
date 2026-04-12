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
    "RESPUESTA OBLIGATORIA: JSON limpio valido con titulo, cliente, objetivo, calorias_estimadas, recomendaciones_generales, semanas, sustituciones, notas_finales."
  ].join("\n");
}

export async function requestPlanFromAI(payload, config) {
  const configuredEndpoint = (config.aiEndpoint || "").trim();
  const autoEndpoint =
    window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
      ? "/api/generar-plan"
      : "";
  const endpoint = configuredEndpoint || autoEndpoint;

  if (!endpoint) {
    return simulatePlan(payload);
  }

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
    console.warn("Fallo endpoint IA. Se usa simulacion local.", error);
    return simulatePlan(payload);
  }
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
            comidas: buildSampleMeals(payload.comidas_por_dia)
          })),
          sustituciones: [
            "Pollo por pavo o tofu firme.",
            "Arroz por quinoa o papa cocida.",
            "Yogur griego por yogur sin lactosa."
          ],
          notas_finales: [
            "Ajustar porciones segun progreso semanal.",
            "Mantener consistencia durante las 4 semanas."
          ]
        })
      );
    }, 1200);
  });
}

function buildSampleMeals(mealsPerDay) {
  const mealTemplate = [
    { tipo: "Desayuno", descripcion: "Avena con proteina, fruta y semillas." },
    { tipo: "Merienda", descripcion: "Yogur griego con frutos rojos y nueces." },
    { tipo: "Almuerzo", descripcion: "Pollo a la plancha con arroz integral y ensalada." },
    { tipo: "Cena", descripcion: "Pescado al horno con pure de batata y verduras." },
    { tipo: "Snack", descripcion: "Batido de proteina con banana." },
    { tipo: "Colacion", descripcion: "Hummus con bastones de zanahoria." }
  ];

  const count = Number.isFinite(mealsPerDay) ? Math.max(3, Math.min(6, mealsPerDay)) : 4;
  return mealTemplate.slice(0, count);
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
