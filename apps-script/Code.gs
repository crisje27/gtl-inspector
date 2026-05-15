/**
 * ============================================================
 *  GTL Inspector — Backend Apps Script
 *  Sirve como webhook (doPost) y API de lectura (doGet)
 *  Persiste en Google Sheets, una pestaña por obra.
 *
 *  Autor: GTL — GRUPO TERGO LAF
 *  Cliente: YPF Upstream Neuquén
 * ============================================================
 *
 *  Para deployar:
 *    1. Abrir un Google Sheet nuevo.
 *    2. Extensiones → Apps Script → pegar este archivo.
 *    3. Ejecutar setupSheets() una vez (autorizar permisos).
 *    4. Implementar como app web:
 *         Implementar → Nueva implementación → "Aplicación web"
 *         Acceso: "Cualquiera" (es público pero sólo escribe lo
 *         que tu app le manda; podés restringir luego).
 *    5. Copiar la URL /exec y pegarla en la PWA.
 */

// ID de la planilla. Si lo dejás vacío, se usa la planilla
// ACTIVA donde está pegado este script (recomendado).
var SPREADSHEET_ID = "";

var SHEET_OBRAS       = "Obras";
var SHEET_INSPECTORES = "Inspectores";
var SHEET_LOGS        = "Logs";
var SHEET_CONFIG      = "Configuración";
var PARTES_PREFIX     = "Parte_";

/* ============================================================
 *  Endpoints HTTP
 * ============================================================ */

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    var action = p.action || "ping";

    if (action === "ping") {
      return jsonOut({ status: "ok", message: "GTL Inspector backend listo", time: new Date().toISOString() });
    }
    if (action === "listObras") {
      return jsonOut({ status: "ok", obras: listObras() });
    }
    if (action === "listPartes") {
      var partes = listPartes(p.obraId, p.dateFrom, p.dateTo);
      return jsonOut({ status: "ok", partes: partes, count: partes.length });
    }
    if (action === "getParte") {
      var parte = getParte(p.id);
      return jsonOut({ status: "ok", parte: parte });
    }
    if (action === "logs") {
      return jsonOut({ status: "ok", logs: getLogs(parseInt(p.limit || "50", 10)) });
    }
    return jsonOut({ status: "error", error: "Acción no soportada: " + action });
  } catch (err) {
    log("ERROR doGet", err && err.toString ? err.toString() : err);
    return jsonOut({ status: "error", error: String(err) });
  }
}

function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) || "{}";
    var body = JSON.parse(raw);
    var action = body.action || "addParte";

    if (action === "addParte") {
      var res = addParte(body.parte || {});
      return jsonOut({ status: "ok", id: res.id, remoteId: res.id, row: res.row });
    }
    if (action === "deleteParte") {
      deletePart(body.id, body.obraId);
      return jsonOut({ status: "ok" });
    }
    if (action === "upsertObra") {
      var o = upsertObra(body.obra || {});
      return jsonOut({ status: "ok", obra: o });
    }
    return jsonOut({ status: "error", error: "Acción no soportada: " + action });
  } catch (err) {
    log("ERROR doPost", err && err.toString ? err.toString() : err);
    return jsonOut({ status: "error", error: String(err) });
  }
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================
 *  Setup inicial de hojas
 * ============================================================ */
function setupSheets() {
  var ss = getSS();
  var hConfig = ensureSheet(ss, SHEET_CONFIG, ["clave", "valor", "actualizado"]);
  if (hConfig.getLastRow() <= 1) {
    hConfig.appendRow(["version", "1.0.0", new Date()]);
    hConfig.appendRow(["empresa", "GTL", new Date()]);
    hConfig.appendRow(["cliente", "YPF Upstream Neuquén", new Date()]);
  }
  ensureSheet(ss, SHEET_OBRAS,
    ["id","nombre","cliente","contratista","numero","pkInicio","pkFin","locaciones","especialidades","creadaEn","actualizadaEn"]);
  ensureSheet(ss, SHEET_INSPECTORES, ["dni", "nombre", "empresa", "cargo", "primerUso"]);
  ensureSheet(ss, SHEET_LOGS, ["timestamp", "tipo", "mensaje", "contexto"]);
  log("INFO setupSheets", "Hojas creadas/verificadas");
  return "OK";
}

function ensureSheet(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0 && headers && headers.length) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length)
      .setBackground("#003087").setFontColor("#FFFFFF")
      .setFontWeight("bold");
  }
  return sh;
}

function getSS() {
  return SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

/* ============================================================
 *  Headers dinámicos del parte
 * ============================================================ */
function generateHeaders(especialidades) {
  var base = [
    "id","fecha","turno","obraId","obraNombre",
    "inspectorNombre","inspectorDni",
    "clima","alertaYpf","temperatura","visibilidad",
    "hseSinNovedad","hseDetalle","hseCriticidad","hseCharlas",
    "pendientes","noConformidades","cambiosPrograma","comunicacion",
    "personalEnObra","empresas","fotosCount","firma","timestampCierre","_recibido"
  ];

  var per = {
    fo: ["fo_preTapadaHoy","fo_preTapadaAcum","fo_tendidoHoy","fo_tendidoAcum",
         "fo_pkInicioDia","fo_pkFinDia","fo_nivelacionHoy","fo_nivelacionAcum",
         "fo_mediaTapadaHoy","fo_mediaTapadaAcum","fo_tapadaFinalHoy","fo_tapadaFinalAcum",
         "fo_otdr","fo_bobinas","fo_empalmes","fo_tramos_json","fo_observacion"],
    pat: ["pat_mediciones_json","pat_puntuales_json","pat_observacion","pat_resumen"],
    pc:  ["pc_cupros_json","pc_wennerCount","pc_wennerUbic","pc_juntasCount","pc_juntasEstado"],
    elec:["elec_tareas_json","elec_resumen"],
    inst:["inst_instrumentos_json","inst_resumen"],
    civ: ["civ_tareas_json","civ_resumen"],
    mec: ["mec_tareas_json","mec_resumen"]
  };

  var headers = base.slice();
  (especialidades || []).forEach(function (k) {
    if (per[k]) per[k].forEach(function (h) { headers.push(h); });
  });
  return headers;
}

/* ============================================================
 *  Obras
 * ============================================================ */
function upsertObra(obra) {
  var ss = getSS();
  var sh = ensureSheet(ss, SHEET_OBRAS,
    ["id","nombre","cliente","contratista","numero","pkInicio","pkFin","locaciones","especialidades","creadaEn","actualizadaEn"]);
  if (!obra.id) obra.id = "obra_" + Date.now();
  var data = sh.getDataRange().getValues();
  var rowIdx = -1;
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === obra.id) { rowIdx = i + 1; break; }
  }
  var row = [
    obra.id, obra.nombre || "", obra.cliente || "YPF", obra.contratista || "",
    obra.numero || "", obra.pkInicio || 0, obra.pkFin || 0,
    JSON.stringify(obra.locaciones || []),
    JSON.stringify(obra.especialidades || []),
    obra.creadaEn || new Date().toISOString(),
    new Date().toISOString()
  ];
  if (rowIdx === -1) sh.appendRow(row);
  else sh.getRange(rowIdx, 1, 1, row.length).setValues([row]);
  log("INFO upsertObra", obra.id + " - " + obra.nombre);
  return obra;
}

function listObras() {
  var sh = getSS().getSheetByName(SHEET_OBRAS);
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getDataRange().getValues();
  var headers = values.shift();
  return values.map(function (r) {
    var o = {};
    headers.forEach(function (h, i) { o[h] = r[i]; });
    try { o.locaciones    = JSON.parse(o.locaciones    || "[]"); } catch (e) { o.locaciones = []; }
    try { o.especialidades= JSON.parse(o.especialidades|| "[]"); } catch (e) { o.especialidades = []; }
    return o;
  });
}

/* ============================================================
 *  Partes diarios
 * ============================================================ */
function addParte(parte) {
  if (!parte || !parte.obraId) throw new Error("Falta obraId");
  if (!parte.fecha) throw new Error("Falta fecha");

  var ss = getSS();

  // Asegurar que la obra esté registrada (al menos por id/nombre)
  ensureObraRegistered(parte);

  var sheetName = PARTES_PREFIX + sanitizeSheetName(parte.obraId);
  var obra = findObra(parte.obraId);
  // Tomamos las especialidades de la obra Y del parte, y unimos ambas (la obra
  // puede haberse registrado vacía la primera vez, pero el parte trae los avances reales).
  var espObra  = (obra && obra.especialidades) || [];
  var espParte = guessEspecialidades(parte);
  var especialidades = espObra.slice();
  espParte.forEach(function (k) { if (especialidades.indexOf(k) === -1) especialidades.push(k); });
  // Si la obra estaba sin especialidades, las actualizamos en la pestaña Obras
  if (obra && (!obra.especialidades || obra.especialidades.length === 0) && especialidades.length) {
    obra.especialidades = especialidades;
    upsertObra(obra);
  }
  var headers = generateHeaders(especialidades);

  var sh = ss.getSheetByName(sheetName);
  if (!sh) {
    sh = ensureSheet(ss, sheetName, headers);
  } else if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  } else {
    // Si cambió la lista de especialidades, agregamos columnas faltantes
    var existing = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var added = [];
    headers.forEach(function (h) { if (existing.indexOf(h) === -1) added.push(h); });
    if (added.length) {
      var startCol = sh.getLastColumn() + 1;
      sh.getRange(1, startCol, 1, added.length).setValues([added]);
      sh.getRange(1, startCol, 1, added.length).setBackground("#003087").setFontColor("#FFFFFF").setFontWeight("bold");
      headers = existing.concat(added);
    } else {
      headers = existing;
    }
  }

  if (!parte.id) parte.id = "parte_" + Date.now() + "_" + Math.floor(Math.random() * 1e6);

  // Deduplicación: si ya existe un parte con el mismo id, actualizamos en lugar de duplicar
  var idCol = headers.indexOf("id") + 1;
  var existingRow = -1;
  if (idCol > 0 && sh.getLastRow() > 1) {
    var ids = sh.getRange(2, idCol, sh.getLastRow() - 1, 1).getValues();
    for (var r = 0; r < ids.length; r++) {
      if (ids[r][0] === parte.id) { existingRow = r + 2; break; }
    }
  }

  var row = headers.map(function (h) { return getParteValue(parte, h); });
  var rowNum;
  if (existingRow > 0) {
    // Actualizar fila existente en lugar de duplicar
    sh.getRange(existingRow, 1, 1, row.length).setValues([row]);
    rowNum = existingRow;
    log("INFO addParte", "UPDATE (dedup) Obra=" + parte.obraId + " id=" + parte.id + " row=" + rowNum);
  } else {
    sh.appendRow(row);
    rowNum = sh.getLastRow();
  }

  // Aplicar resaltado por alerta
  applyHighlights(sh, rowNum, headers, parte);

  // Asegurar inspector cargado
  upsertInspector(parte);

  log("INFO addParte", "Obra=" + parte.obraId + " id=" + parte.id);
  return { id: parte.id, row: rowNum };
}

function getParteValue(p, h) {
  switch (h) {
    case "id": return p.id;
    case "fecha": return p.fecha;
    case "turno": return p.turno;
    case "obraId": return p.obraId;
    case "obraNombre": return p.obraNombre;
    case "inspectorNombre": return p.inspectorNombre;
    case "inspectorDni": return p.inspectorDni;
    case "clima": return get(p, "condiciones.clima");
    case "alertaYpf": return get(p, "condiciones.alertaYpf");
    case "temperatura": return get(p, "condiciones.temperatura");
    case "visibilidad": return get(p, "condiciones.visibilidad");
    case "hseSinNovedad": return !!get(p, "hse.sinNovedad");
    case "hseDetalle": return get(p, "hse.detalle");
    case "hseCriticidad": return get(p, "hse.criticidad");
    case "hseCharlas": return JSON.stringify(get(p, "hse.charlas") || []);
    case "pendientes": return JSON.stringify(get(p, "handover.pendientes") || []);
    case "noConformidades": return JSON.stringify(get(p, "handover.noConformidades") || []);
    case "cambiosPrograma": return get(p, "handover.cambiosPrograma");
    case "comunicacion": return get(p, "handover.comunicacion");
    case "personalEnObra": return get(p, "cierre.personalEnObra") || 0;
    case "empresas": return ((get(p, "cierre.empresas") || []).join(", "));
    case "fotosCount": return ((get(p, "cierre.fotos") || []).length);
    case "firma": return get(p, "cierre.firma");
    case "timestampCierre": return get(p, "cierre.timestamp");
    case "_recibido": return new Date().toISOString();
  }

  // Avances específicos
  var fo = get(p, "avances.fo") || {};
  var pat = get(p, "avances.pat") || {};
  var pc = get(p, "avances.pc") || {};
  var elec = get(p, "avances.elec") || {};
  var inst = get(p, "avances.inst") || {};
  var civ = get(p, "avances.civ") || {};
  var mec = get(p, "avances.mec") || {};

  if (h === "fo_tramos_json") return JSON.stringify(fo.tramos || []);
  if (h.indexOf("fo_") === 0) return fo[h.substring(3)] != null ? fo[h.substring(3)] : "";
  if (h === "pat_mediciones_json") return JSON.stringify(pat.mediciones || []);
  if (h === "pat_puntuales_json")  return JSON.stringify(pat.puntuales  || []);
  if (h === "pat_observacion")     return pat.observacion || "";
  if (h === "pat_resumen")         return resumenPAT(pat);
  if (h === "pc_cupros_json")      return JSON.stringify(pc.cupros || []);
  if (h === "pc_wennerCount")      return pc.wennerCount || 0;
  if (h === "pc_wennerUbic")       return pc.wennerUbic || "";
  if (h === "pc_juntasCount")      return pc.juntasCount || 0;
  if (h === "pc_juntasEstado")     return pc.juntasEstado || "";
  if (h === "elec_tareas_json")    return JSON.stringify(elec.tareas || []);
  if (h === "elec_resumen")        return resumenTareas(elec.tareas);
  if (h === "inst_instrumentos_json") return JSON.stringify(inst.instrumentos || []);
  if (h === "inst_resumen")        return resumenInstrumentos(inst.instrumentos);
  if (h === "civ_tareas_json")     return JSON.stringify(civ.tareas || []);
  if (h === "civ_resumen")         return resumenTareas(civ.tareas);
  if (h === "mec_tareas_json")     return JSON.stringify(mec.tareas || []);
  if (h === "mec_resumen")         return resumenTareas(mec.tareas);
  return "";
}

function resumenPAT(pat) {
  var meds = (pat && pat.mediciones) || [];
  var ok = 0, warn = 0, danger = 0;
  meds.forEach(function (m) {
    var v = parseFloat(m.ohm);
    if (isNaN(v)) return;
    if (v > 2) danger++;
    else if (v > 1.5) warn++;
    else ok++;
  });
  return "OK:" + ok + " WARN:" + warn + " ALERTA:" + danger + " (max 2Ω)";
}

function resumenTareas(tareas) {
  if (!tareas || !tareas.length) return "";
  var avg = tareas.reduce(function (a, t) { return a + (parseFloat(t.avance) || 0); }, 0) / tareas.length;
  return tareas.length + " tareas · avance prom " + avg.toFixed(0) + "%";
}

function resumenInstrumentos(items) {
  if (!items || !items.length) return "";
  var counts = {};
  items.forEach(function (i) { counts[i.estado] = (counts[i.estado] || 0) + 1; });
  return Object.keys(counts).map(function (k) { return k + ":" + counts[k]; }).join(" / ");
}

function guessEspecialidades(parte) {
  return Object.keys(parte.avances || {});
}

function applyHighlights(sh, rowNum, headers, parte) {
  // Resaltar PAT > 2Ω en rojo
  var pat = get(parte, "avances.pat") || {};
  if (pat.mediciones && pat.mediciones.some(function (m) { var v = parseFloat(m.ohm); return !isNaN(v) && v > 2; })) {
    var ci = headers.indexOf("pat_resumen") + 1;
    if (ci > 0) sh.getRange(rowNum, ci).setBackground("#FBE3E3");
  }
  // Cupros con martillo FAIL
  var pc = get(parte, "avances.pc") || {};
  if (pc.cupros && pc.cupros.some(function (c) { return (c.martillo + "").toUpperCase() === "FAIL"; })) {
    var pci = headers.indexOf("pc_cupros_json") + 1;
    if (pci > 0) sh.getRange(rowNum, pci).setBackground("#FBE3E3");
  }
  // HSE no normal
  if (parte.hse && parte.hse.sinNovedad === false) {
    var hi = headers.indexOf("hseDetalle") + 1;
    if (hi > 0) sh.getRange(rowNum, hi).setBackground("#FFF1DC");
  }
}

/* ============================================================
 *  Inspectores
 * ============================================================ */
function upsertInspector(parte) {
  var ss = getSS();
  var sh = ensureSheet(ss, SHEET_INSPECTORES, ["dni", "nombre", "empresa", "cargo", "primerUso"]);
  if (!parte.inspectorDni) return;
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === parte.inspectorDni) return;
  }
  sh.appendRow([parte.inspectorDni, parte.inspectorNombre || "", "GTL", "Inspector E&I", new Date()]);
}

function ensureObraRegistered(parte) {
  var ss = getSS();
  var sh = ensureSheet(ss, SHEET_OBRAS,
    ["id","nombre","cliente","contratista","numero","pkInicio","pkFin","locaciones","especialidades","creadaEn","actualizadaEn"]);
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === parte.obraId) return;
  }
  sh.appendRow([parte.obraId, parte.obraNombre || "", "", "", "", 0, 0, "[]", "[]", new Date().toISOString(), new Date().toISOString()]);
}

function findObra(id) {
  var obras = listObras();
  for (var i = 0; i < obras.length; i++) if (obras[i].id === id) return obras[i];
  return null;
}

/* ============================================================
 *  Listado / detalle de partes
 * ============================================================ */
function listPartes(obraId, dateFrom, dateTo) {
  if (!obraId) return [];
  var ss = getSS();
  var sh = ss.getSheetByName(PARTES_PREFIX + sanitizeSheetName(obraId));
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getDataRange().getValues();
  var headers = values.shift();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var obj = {};
    headers.forEach(function (h, j) { obj[h] = row[j]; });
    if (dateFrom && obj.fecha < dateFrom) continue;
    if (dateTo   && obj.fecha > dateTo)   continue;
    out.push(parseParte(obj));
  }
  out.sort(function (a, b) { return (a.fecha < b.fecha) ? 1 : -1; });
  return out;
}

function getParte(id) {
  var ss = getSS();
  var sheets = ss.getSheets();
  for (var s = 0; s < sheets.length; s++) {
    if (sheets[s].getName().indexOf(PARTES_PREFIX) !== 0) continue;
    var sh = sheets[s];
    var values = sh.getDataRange().getValues();
    var headers = values.shift();
    var idIdx = headers.indexOf("id");
    if (idIdx < 0) continue;
    for (var i = 0; i < values.length; i++) {
      if (values[i][idIdx] === id) {
        var obj = {};
        headers.forEach(function (h, j) { obj[h] = values[i][j]; });
        return parseParte(obj);
      }
    }
  }
  return null;
}

function deletePart(id, obraId) {
  if (!obraId) throw new Error("Falta obraId para eliminar");
  var ss = getSS();
  var sh = ss.getSheetByName(PARTES_PREFIX + sanitizeSheetName(obraId));
  if (!sh) return;
  var values = sh.getDataRange().getValues();
  var idIdx = values[0].indexOf("id");
  for (var i = 1; i < values.length; i++) {
    if (values[i][idIdx] === id) {
      sh.deleteRow(i + 1);
      log("INFO deleteParte", "id=" + id);
      return;
    }
  }
}

function parseParte(o) {
  var jsonFields = [
    "hseCharlas","pendientes","noConformidades",
    "fo_tramos_json",
    "pat_mediciones_json","pat_puntuales_json",
    "pc_cupros_json",
    "elec_tareas_json","inst_instrumentos_json",
    "civ_tareas_json","mec_tareas_json"
  ];
  jsonFields.forEach(function (f) {
    if (o[f] != null && typeof o[f] === "string") {
      try { o[f] = JSON.parse(o[f]); } catch (e) {}
    }
  });
  // Normalizar fecha a YYYY-MM-DD (Sheets a veces devuelve Date)
  if (o.fecha instanceof Date) {
    o.fecha = Utilities.formatDate(o.fecha, Session.getScriptTimeZone() || "GMT-3", "yyyy-MM-dd");
  }
  return o;
}

/* ============================================================
 *  Logs
 * ============================================================ */
function log(tipo, mensaje, contexto) {
  try {
    var ss = getSS();
    var sh = ensureSheet(ss, SHEET_LOGS, ["timestamp", "tipo", "mensaje", "contexto"]);
    sh.appendRow([new Date(), tipo || "INFO", mensaje || "", contexto ? JSON.stringify(contexto) : ""]);
  } catch (e) {
    // No-op si fallara
  }
}

function getLogs(limit) {
  var ss = getSS();
  var sh = ss.getSheetByName(SHEET_LOGS);
  if (!sh) return [];
  var values = sh.getDataRange().getValues();
  values.shift();
  values.reverse();
  return values.slice(0, limit || 50).map(function (r) {
    return { timestamp: r[0], tipo: r[1], mensaje: r[2], contexto: r[3] };
  });
}

/* ============================================================
 *  Helpers
 * ============================================================ */
function sanitizeSheetName(s) {
  return String(s || "").replace(/[^A-Za-z0-9_-]/g, "_").substring(0, 60);
}

function get(obj, path) {
  if (!obj) return null;
  var parts = path.split(".");
  var cur = obj;
  for (var i = 0; i < parts.length; i++) {
    if (cur == null) return null;
    cur = cur[parts[i]];
  }
  return cur;
}
