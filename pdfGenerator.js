import { buildFilename, sanitizeText } from "./utils.js";

export async function generatePlanPdf({ plan, config, logoDataUrl }) {
  if (!window.jspdf?.jsPDF) {
    throw new Error("jsPDF no esta disponible.");
  }

  const doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4" });
  const margin = 42;
  let y = 54;

  const brandName = sanitizeText(config.brandName || "THE BLACK FITNESS");
  const slogan = sanitizeText(config.brandSlogan || "TÚ TAMBIÉN PUEDES");

  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "JPEG", margin, y - 16, 130, 60);
    } catch (error) {
      // Ignorar error de logo para no bloquear la descarga.
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(brandName, margin + 145, y + 10);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(slogan, margin + 145, y + 28);
  y += 70;

  doc.setDrawColor(243, 4, 99);
  doc.setLineWidth(1);
  doc.line(margin, y, 553, y);
  y += 18;

  const client = plan.cliente || {};
  const headerRows = [
    `Cliente: ${sanitizeText(client.nombre || "")}`,
    `Edad: ${sanitizeText(client.edad || "")}`,
    `Peso: ${sanitizeText(client.peso || "")} kg`,
    `Altura: ${sanitizeText(client.altura || "")} cm`,
    `Sexo: ${sanitizeText(client.sexo || "")}`,
    `Objetivo: ${sanitizeText(plan.objetivo || "")}`,
    `Calorias estimadas: ${sanitizeText(plan.calorias_estimadas || "")}`
  ];

  y = writeBlock(doc, "DATOS DEL PLAN", headerRows, margin, y);

  y = writeBlock(
    doc,
    "RECOMENDACIONES GENERALES",
    (plan.recomendaciones_generales || []).map((r) => `- ${sanitizeText(r)}`),
    margin,
    y
  );

  (plan.semanas || []).forEach((week) => {
    const lines = (week.comidas || []).map((meal) => `${sanitizeText(meal.tipo)}: ${sanitizeText(meal.descripcion)}`);
    y = writeBlock(doc, sanitizeText(week.semana), lines, margin, y);
  });

  y = writeBlock(
    doc,
    "SUSTITUCIONES",
    (plan.sustituciones || []).map((s) => `- ${sanitizeText(s)}`),
    margin,
    y
  );

  y = writeBlock(
    doc,
    "NOTAS FINALES",
    (plan.notas_finales || []).map((n) => `- ${sanitizeText(n)}`),
    margin,
    y
  );

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(`${brandName} | Plan nutricional profesional`, margin, 820);
    doc.text(`Pagina ${i} de ${pageCount}`, 470, 820);
  }

  const fileName = buildFilename(client.nombre || "cliente");
  const blob = doc.output("blob");
  const dataUri = doc.output("datauristring");

  return {
    fileName,
    blob,
    dataUri,
    save: () => doc.save(fileName)
  };
}

function ensureSpace(doc, y, needed = 80) {
  if (y + needed < 780) return y;
  doc.addPage();
  return 52;
}

function writeBlock(doc, title, lines, x, y) {
  y = ensureSpace(doc, y, 90);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(20, 20, 20);
  doc.text(title, x, y);
  y += 14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  lines.forEach((line) => {
    y = ensureSpace(doc, y, 24);
    const chunks = doc.splitTextToSize(line, 500);
    doc.text(chunks, x, y);
    y += chunks.length * 12 + 4;
  });

  return y + 8;
}
