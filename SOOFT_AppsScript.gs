// ══════════════════════════════════════════════════════════════════════
// SOOFT Technology · Portal de Cotización Enterprise
// Google Apps Script — Webhook receptor → Google Sheets
//
// INSTRUCCIONES:
//  1. Pegá este código en tu Apps Script (Extensiones → Apps Script)
//  2. Publicá como Web App: Implementar → Nueva implementación
//     · Ejecutar como: Yo
//     · Acceso: Cualquier usuario
//  3. Copiá la URL y pegala en sooft-cotizador.html (const WEBHOOK_URL)
// ══════════════════════════════════════════════════════════════════════

// ── ID del Google Spreadsheet (tomalo de la URL de tu Sheets) ──
// Ejemplo: https://docs.google.com/spreadsheets/d/TU_ID_AQUI/edit
const SPREADSHEET_ID = "TU_SPREADSHEET_ID_AQUI";

// ── Nombres de las hojas ──
const SHEET_COTIZACIONES = "Cotizaciones";
const SHEET_DESGLOSE     = "Desglose por ítem";

// ══════════════════════════════════════════════════════════════════════
// FUNCIÓN PRINCIPAL — recibe el POST del portal
// ══════════════════════════════════════════════════════════════════════
function doPost(e) {
  try {
    const raw     = e.postData.contents;
    const payload = JSON.parse(raw);

    const ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheetCot = ss.getSheetByName(SHEET_COTIZACIONES);
    const sheetDes = ss.getSheetByName(SHEET_DESGLOSE);

    const idCot   = generarID(sheetCot);
    const ts      = new Date(payload.timestamp);
    const tsStr   = Utilities.formatDate(ts, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");

    // ── Extraer datos del payload ──
    const contacto = payload.cliente || payload.contacto || {};
    const comercial = payload.comercial || "";
    const notas = payload.notas || "";
    const config   = payload.configuracion || {};
    const desglose = payload.desglose || {};
    const total    = payload.totalMensualUSD || 0;

    // ── Fila para hoja COTIZACIONES ──
    const fila = [
      tsStr,
      idCot,
      contacto.empresa   || "",
      contacto.nombre    || "",
      contacto.email     || "",
      contacto.telefono  || "",
      comercial,
      notas,
      config.servidores  === "sooft" ? "SOOFT" : "Cliente",
      config.integracion ? "Sí" : "No",
      config.horasIntegracion      || 0,
      config.vacantes               || 0,
      config.usuarios               || 0,
      config.entrevistadorVirtual ? "Sí" : "No",
      config.cantidadEntrevistas   || 0,
      config.soporte ? "Sí" : "No",
      config.horasSoporte          || 0,
      "Nuevo",
      total,
    ];

    // ── Insertar en la primera fila vacía después del header ──
    const ultimaFila = encontrarUltimaFila(sheetCot);
    sheetCot.getRange(ultimaFila, 1, 1, fila.length).setValues([fila]);

    // ── Formato de la celda Total ──
    sheetCot.getRange(ultimaFila, 18)
      .setNumberFormat('"USD "#,##0')
      .setFontColor("#2563EB")
      .setFontWeight("bold");

    // ── Color estado ──
    sheetCot.getRange(ultimaFila, 17)
      .setBackground("#EFF6FF")
      .setFontColor("#2563EB")
      .setFontWeight("bold");

    // ── Escribir desglose ítem por ítem ──
    escribirDesglose(sheetDes, idCot, contacto.empresa || "", config, desglose);

    // ── Notificación por email al equipo SOOFT (opcional) ──
    // Descomentá y configurá el email si querés recibir alertas:
    // enviarNotificacion(idCot, contacto, total);

    return ContentService
      .createTextOutput(JSON.stringify({
        status:  "ok",
        id:      idCot,
        empresa: contacto.empresa,
        total:   total,
        mensaje: "Cotización registrada correctamente en Google Sheets."
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({
        status: "error",
        mensaje: err.message
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ══════════════════════════════════════════════════════════════════════
// DESGLOSE POR ÍTEM → hoja "Desglose por ítem"
// ══════════════════════════════════════════════════════════════════════
function escribirDesglose(sheet, idCot, empresa, config, desglose) {
  const items = [
    ["Plataforma Base",       1,                            desglose.base        || 800],
    ["Servidores SOOFT",      1,                            desglose.servidor     || 0],
    ["Integración",           config.horasIntegracion || 0, desglose.integracion  || 0],
    ["Vacantes / mes",        config.vacantes         || 0, desglose.vacantes     || 0],
    ["Usuarios",              config.usuarios         || 0, desglose.usuarios     || 0],
    ["Entrevistas IA",        config.cantidadEntrevistas||0,desglose.entrevistas  || 0],
    ["Soporte",               config.horasSoporte     || 0, desglose.soporte      || 0],
  ].filter(([_, qty, sub]) => sub > 0);  // solo ítems activos

  const startRow = encontrarUltimaFila(sheet);

  items.forEach(([item, qty, subtotal], i) => {
    const fila = [
      i === 0 ? idCot    : "",
      i === 0 ? empresa  : "",
      item,
      qty,
      qty > 0 ? (subtotal / qty) : subtotal,
      subtotal,
    ];
    sheet.getRange(startRow + i, 1, 1, fila.length).setValues([fila]);
    sheet.getRange(startRow + i, 6).setNumberFormat('"USD "#,##0');
  });

  // Fila total del grupo
  const totalRow = startRow + items.length;
  sheet.getRange(totalRow, 1, 1, 5).merge()
    .setValue(`TOTAL ${idCot}`)
    .setBackground("#2563EB")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  const totalVal = items.reduce((acc, [_, __, sub]) => acc + sub, 0);
  sheet.getRange(totalRow, 6)
    .setValue(totalVal)
    .setNumberFormat('"USD "#,##0')
    .setBackground("#2563EB")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  // Separador visual
  sheet.getRange(totalRow + 1, 1, 1, 6).merge()
    .setValue("")
    .setBackground("#F1F5F9");
}

// ══════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════

// Genera ID correlativo: COT-001, COT-002...
function generarID(sheet) {
  const ultima = encontrarUltimaFila(sheet) - 1; // filas de datos (sin header)
  const num    = Math.max(0, ultima - 5);         // 5 = filas de header/ejemplo
  return "COT-" + String(num + 1).padStart(3, "0");
}

// Encuentra la primera fila vacía en columna A (debajo de la fila 9 para no pisar el hint)
function encontrarUltimaFila(sheet) {
  const datos = sheet.getDataRange().getValues();
  for (let i = datos.length - 1; i >= 9; i--) {
    if (datos[i][0] !== "" && datos[i][0] !== null) {
      return i + 2; // siguiente fila
    }
  }
  return 10; // mínimo: fila 10
}

// ── Notificación por email (opcional) ──
function enviarNotificacion(idCot, contacto, total) {
  const EMAIL_DESTINO = "tu-email@sooft.com"; // ← cambiá esto
  MailApp.sendEmail({
    to:      EMAIL_DESTINO,
    subject: `[SOOFT] Nueva cotización ${idCot} — ${contacto.empresa}`,
    body: `
Nueva cotización recibida desde el Portal Enterprise.

ID:       ${idCot}
Empresa:  ${contacto.empresa}
Contacto: ${contacto.nombre} <${contacto.email}>
Teléfono: ${contacto.telefono || "—"}
Total estimado: USD ${total.toLocaleString()}

Revisá el detalle en Google Sheets.
    `.trim()
  });
}

// ── Función de prueba (ejecutala manualmente para testear) ──
function testDoPost() {
  const payload = {
    timestamp: new Date().toISOString(),
    contacto: {
      nombre: "Test Usuario",
      email: "test@empresa.com",
      empresa: "Empresa de Prueba SA",
      telefono: "+54 11 5555-0000"
    },
    configuracion: {
      servidores: "sooft",
      integracion: true,
      horasIntegracion: 20,
      vacantes: 15,
      usuarios: 50,
      entrevistadorVirtual: true,
      cantidadEntrevistas: 40,
      soporte: true,
      horasSoporte: 10
    },
    desglose: {
      base: 800,
      servidor: 400,
      integracion: 700,
      vacantes: 225,
      usuarios: 400,
      entrevistas: 1000,
      soporte: 350
    },
    totalMensualUSD: 3875
  };

  const fakeEvent = { postData: { contents: JSON.stringify(payload) } };
  const result    = doPost(fakeEvent);
  Logger.log(result.getContent());
}
