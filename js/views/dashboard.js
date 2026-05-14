/* ============================================================
   GTL Inspector — Dashboard ejecutivo (rediseñado)
   Reporte gerencial completo para YPF Upstream
   Muestra TODO lo que se carga en el parte diario
   ============================================================ */
(function (global) {
  "use strict";

  const Store = global.GTL.Store;
  const Sync  = global.GTL.Sync;
  const UI    = global.GTL.UI;
  const Charts = global.GTL.Charts;

  let currentChartInstances = [];
  let lastFetch = null;
  let refreshTimer = null;
  let _lastPartes = [];

  function destroyCharts() {
    currentChartInstances.forEach(c => { try { c.destroy(); } catch (e) {} });
    currentChartInstances = [];
  }

  function defaultRange() {
    const to = new Date();
    const from = new Date(); from.setDate(from.getDate() - 30);
    return { dateFrom: iso(from), dateTo: iso(to) };
  }
  function iso(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  /* ==========================================================
   *  RENDER PRINCIPAL
   * ========================================================== */
  function render(view, query) {
    const cfg = Store.getConfig();
    const obras = cfg.obras || [];
    const obra = Store.getObraActiva();

    if (!obra) {
      view.innerHTML = `<div class="empty"><div class="ic">📊</div><p>Configurá una obra primero.</p></div>`;
      return;
    }

    const { dateFrom, dateTo } = defaultRange();
    const especialidades = obra.especialidades || [];

    view.innerHTML = `
      <div class="exec-header">
        <div class="exec-header-row">
          <div>
            <div class="exec-eyebrow">Reporte gerencial · GTL Inspector</div>
            <h2 class="exec-title">${esc(obra.nombre)}</h2>
            <div class="exec-meta">${esc(obra.contratista || "")} · ${esc(obra.cliente || "YPF Upstream")} · N° ${esc(obra.numero || "—")}</div>
          </div>
          <div class="exec-header-actions">
            <button class="btn btn-sm" id="btnRefresh" title="Actualizar">↻</button>
            <button class="btn btn-sm" id="btnPrint">🖨 PDF</button>
          </div>
        </div>
        <div id="obraTabs" class="exec-obra-tabs"></div>
        <div class="exec-toolbar">
          <input class="input" type="date" id="dFrom" value="${dateFrom}" />
          <span class="dash-sep">→</span>
          <input class="input" type="date" id="dTo"   value="${dateTo}" />
          <span class="dash-update" id="lastUpdate">—</span>
        </div>
      </div>

      <div class="alerts-stack" id="alerts"></div>

      <!-- KPIs -->
      <section class="dash-section">
        <div class="dash-section-head">
          <h3>Indicadores clave</h3>
          <span class="dash-section-sub" id="kpiPeriod">—</span>
        </div>
        <div class="kpi-grid kpi-grid-exec" id="kpis">
          ${[1,2,3,4,5,6,7,8].map(() => `<div class="kpi"><div class="sk sk-line" style="width:60%"></div><div class="sk sk-block"></div></div>`).join("")}
        </div>
      </section>

      <!-- Pipeline -->
      <section class="dash-section">
        <div class="dash-section-head"><h3>Avance lineal de obra</h3><span class="dash-section-sub">PK actual sobre traza total</span></div>
        <div class="chart-card">
          <div class="pipeline" id="pipeline"></div>
        </div>
      </section>

      <!-- Resumen comparativo por especialidad -->
      <section class="dash-section">
        <div class="dash-section-head"><h3>Actividad diaria por especialidad</h3><span class="dash-section-sub">Resumen compacto · detalle en cada sección</span></div>
        <div class="dash-evo-grid" id="evoGrid"></div>
      </section>

      <!-- Sección FO -->
      ${especialidades.includes("fo") ? `
      <section class="dash-section">
        <div class="dash-section-head"><h3>🔆 Fibra Óptica</h3><span class="dash-section-sub">Tendido + empalmes + tramos + OTDR</span></div>
        <div id="foSection"></div>
      </section>` : ""}

      <!-- Sección PAT -->
      ${especialidades.includes("pat") ? `
      <section class="dash-section">
        <div class="dash-section-head"><h3>⏚ Mallas PAT</h3><span class="dash-section-sub">Resistencia a tierra · límite YPF: 2Ω</span></div>
        <div id="patSection"></div>
      </section>` : ""}

      <!-- Sección PC -->
      ${especialidades.includes("pc") ? `
      <section class="dash-section">
        <div class="dash-section-head"><h3>⚡ Protección Catódica</h3><span class="dash-section-sub">Cupros · Wenner · Juntas dieléctricas</span></div>
        <div id="pcSection"></div>
      </section>` : ""}

      <!-- Sección ELEC -->
      ${especialidades.includes("elec") ? `
      <section class="dash-section">
        <div class="dash-section-head"><h3>🔌 Eléctrico</h3><span class="dash-section-sub">Tareas registradas con avance</span></div>
        <div id="elecSection"></div>
      </section>` : ""}

      <!-- Sección INST -->
      ${especialidades.includes("inst") ? `
      <section class="dash-section">
        <div class="dash-section-head"><h3>🎛 Instrumentación</h3><span class="dash-section-sub">Instrumentos por estado</span></div>
        <div id="instSection"></div>
      </section>` : ""}

      <!-- Sección CIV -->
      ${especialidades.includes("civ") ? `
      <section class="dash-section">
        <div class="dash-section-head"><h3>🏗 Civil</h3><span class="dash-section-sub">Tareas registradas con avance</span></div>
        <div id="civSection"></div>
      </section>` : ""}

      <!-- Sección MEC -->
      ${especialidades.includes("mec") ? `
      <section class="dash-section">
        <div class="dash-section-head"><h3>⚙ Mecánico</h3><span class="dash-section-sub">Tareas registradas con avance</span></div>
        <div id="mecSection"></div>
      </section>` : ""}

      <!-- HSE -->
      <section class="dash-section dash-grid-2">
        <div class="chart-card">
          <div class="chart-head"><h4>Cumplimiento HSE</h4><span class="chart-sub">Días con / sin novedad</span></div>
          <div class="chart-body"><canvas id="chHSE"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-head"><h4>Charlas y capacitaciones</h4><span class="chart-sub">Realizadas en el período</span></div>
          <div class="chart-body" id="hseCharlasBox"></div>
        </div>
      </section>

      <!-- Sección operativa -->
      <section class="dash-section">
        <div class="dash-section-head"><h3>Información operativa</h3><span class="dash-section-sub">Personal · Empresas · Comunicación</span></div>
        <div class="dash-grid-2">
          <div class="chart-card">
            <div class="chart-head"><h4>Personal y empresas</h4><span class="chart-sub">Activos en el período</span></div>
            <div class="chart-body" id="operativaBox"></div>
          </div>
          <div class="chart-card">
            <div class="chart-head"><h4>Cambios de programa / Comunicación</h4><span class="chart-sub">Reportado por inspectores</span></div>
            <div class="chart-body" id="comunicacionBox"></div>
          </div>
        </div>
      </section>

      <!-- Pendientes y NC -->
      <section class="dash-section dash-grid-2">
        <div class="chart-card">
          <div class="chart-head"><h4>Pendientes urgentes abiertos</h4><span class="chart-sub">Criticidad Alto / Crítico</span></div>
          <div class="chart-body" id="pendientesBox"></div>
        </div>
        <div class="chart-card">
          <div class="chart-head"><h4>No conformidades del período</h4><span class="chart-sub">Detectadas y registradas</span></div>
          <div class="chart-body" id="ncBox"></div>
        </div>
      </section>

      <!-- Galería de fotos -->
      <section class="dash-section">
        <div class="dash-section-head"><h3>Registro fotográfico</h3><span class="dash-section-sub" id="fotosCount">—</span></div>
        <div class="chart-card"><div id="fotosBox"></div></div>
      </section>

      <!-- Histórico -->
      <section class="dash-section">
        <div class="dash-section-head"><h3>Histórico de partes diarios</h3><span class="dash-section-sub" id="histCount">—</span></div>
        <div class="chart-card"><div id="histBox"></div></div>
      </section>

      <div class="exec-footer no-print-hide">
        <span>GTL — GRUPO TERGO LAF</span>
        <span>YPF Upstream Neuquén</span>
        <span id="genStamp">—</span>
      </div>
    `;

    UI.renderObraTabs(view.querySelector("#obraTabs"), {
      activeId: obra.id,
      variant: "exec",
      onSwitch: () => render(view, query)
    });
    view.querySelector("#btnRefresh").onclick = () => loadAll(view);
    view.querySelector("#dFrom").onchange = () => loadAll(view);
    view.querySelector("#dTo").onchange   = () => loadAll(view);
    view.querySelector("#btnPrint").onclick = () => window.print();

    loadAll(view);

    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => loadAll(view), 5 * 60 * 1000);
  }

  /* ==========================================================
   *  CARGA DE DATOS
   * ========================================================== */
  async function loadAll(view) {
    destroyCharts();
    const obra = Store.getObraActiva();
    if (!obra) return;

    const dFrom = view.querySelector("#dFrom").value;
    const dTo   = view.querySelector("#dTo").value;

    let partes = [];
    let fromRemote = false;
    try {
      partes = await Sync.fetchPartes(obra.id, dFrom, dTo);
      fromRemote = true;
    } catch (e) {
      const local = await Store.listPartesLocal(obra.id);
      partes = local.filter(p => (!dFrom || p.fecha >= dFrom) && (!dTo || p.fecha <= dTo));
      UI.toast("Sin conexión backend — datos locales", "warn", 2200);
    }

    // Normalizar fecha
    partes.forEach(p => {
      if (p.fecha) {
        if (p.fecha instanceof Date) p.fecha = p.fecha.toISOString().slice(0, 10);
        else if (typeof p.fecha === "string" && p.fecha.length > 10) p.fecha = p.fecha.slice(0, 10);
      }
    });

    lastFetch = new Date();
    _lastPartes = partes;

    const upd = view.querySelector("#lastUpdate");
    if (upd) upd.textContent = "Actualizado " + lastFetch.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) + (fromRemote ? "" : " · datos locales");

    const stamp = view.querySelector("#genStamp");
    if (stamp) stamp.textContent = "Generado: " + lastFetch.toLocaleString("es-AR");

    const period = view.querySelector("#kpiPeriod");
    if (period) period.textContent = `${UI.formatDate(dFrom)} → ${UI.formatDate(dTo)} · ${partes.length} parte${partes.length === 1 ? "" : "s"}`;

    partes.sort((a, b) => a.fecha < b.fecha ? 1 : -1);

    drawAlerts(view, obra, partes);
    drawKPIs(view, obra, partes);
    drawPipeline(view, obra, partes);
    drawEvolucion(view, obra, partes);
    drawFOSection(view, obra, partes);
    drawPATSection(view, obra, partes);
    drawPCSection(view, partes);
    drawTareasSection(view, partes, "elec", "#elecSection");
    drawInstSection(view, partes);
    drawTareasSection(view, partes, "civ", "#civSection");
    drawTareasSection(view, partes, "mec", "#mecSection");
    drawHSE(view, partes);
    drawHSECharlas(view, partes);
    drawOperativa(view, partes);
    drawComunicacion(view, partes);
    drawPendientes(view, partes);
    drawNCs(view, partes);
    drawFotos(view, partes);
    drawHistorico(view, partes);
  }

  /* ==========================================================
   *  ALERTAS
   * ========================================================== */
  function drawAlerts(view, obra, partes) {
    const box = view.querySelector("#alerts");
    if (!box) return;
    const alerts = [];
    const ult = partes[0];
    if (ult) {
      const pat = patMediciones(ult);
      const malas = pat.filter(m => parseFloat(m.ohm) > 2);
      if (malas.length) alerts.push({ kind: "danger", msg: `🔴 PAT > 2Ω en: ${malas.map(m => esc(m.locacion)).join(", ")}` });
      const cupros = cuprosFromParte(ult);
      const fail = cupros.filter(c => (c.martillo + "").toUpperCase() === "FAIL");
      if (fail.length) alerts.push({ kind: "danger", msg: `🔴 Test martillo FAIL en ${fail.length} cupro(s)` });
    }
    const today = UI.todayIso();
    if (!partes.some(p => p.fecha === today)) {
      alerts.push({ kind: "warn", msg: `🟡 No hay parte cargado hoy (${UI.formatDate(today)}).` });
    }
    const treshold = new Date(); treshold.setDate(treshold.getDate() - 3);
    partes.forEach(p => {
      const pend = parsePendientes(p);
      const fechaP = new Date(p.fecha);
      if (fechaP < treshold) {
        const urgente = pend.find(x => /Cr[ií]tic|Alto/.test(x.criticidad || ""));
        if (urgente) alerts.push({ kind: "warn", msg: `🟡 Pendiente urgente del ${UI.formatDate(p.fecha)} sin resolver` });
      }
    });
    box.innerHTML = alerts.length
      ? alerts.map(a => `<div class="banner ${a.kind}">${a.msg}</div>`).join("")
      : `<div class="banner ok">✓ Sin alertas. Obra avanzando dentro de parámetros.</div>`;
  }

  /* ==========================================================
   *  KPIs (corregidos)
   * ========================================================== */
  function drawKPIs(view, obra, partes) {
    const total = Math.max(1, obra.pkFin - obra.pkInicio);
    let pkActual = obra.pkInicio;
    let totalTendidoFO = 0;
    let totalEmpalmes = 0;
    let cuprosTotal = 0;
    let cuprosFail = 0;
    let totalInstrumentos = 0;
    let pendUrgentes = 0;
    let ncPendientes = 0;
    let ultIncidente = null;
    let personalSum = 0, personalCount = 0;
    const empresasSet = new Set();
    // PAT: mapa locacion → MEJOR Ω visto en el período
    const patBestByLoc = {};
    // Tareas con avance promedio
    const tareasAvanceProm = { elec: [], civ: [], mec: [] };

    partes.forEach(p => {
      const fo = (p.avances && p.avances.fo) || foFromFlat(p);
      if (fo) {
        if (fo.tendidoAcum) totalTendidoFO = Math.max(totalTendidoFO, parseFloat(fo.tendidoAcum) || 0);
        if (fo.pkFinDia) pkActual = Math.max(pkActual, parseFloat(fo.pkFinDia) || 0);
        if (fo.empalmes) totalEmpalmes += parseInt(fo.empalmes, 10) || 0;
      }
      patMediciones(p).forEach(m => {
        const v = parseFloat(m.ohm);
        if (!isNaN(v) && v > 0) {
          if (!patBestByLoc[m.locacion] || v < patBestByLoc[m.locacion].ohm) {
            patBestByLoc[m.locacion] = { ohm: v, fecha: p.fecha, estado: m.estado, obs: m.obs };
          }
        }
      });
      cuprosFromParte(p).forEach(c => {
        cuprosTotal++;
        if ((c.martillo + "").toUpperCase() === "FAIL") cuprosFail++;
      });
      totalInstrumentos += tareasFromKey(p, "inst", "instrumentos").length;
      ["elec", "civ", "mec"].forEach(k => {
        tareasFromKey(p, k).forEach(t => {
          const a = parseFloat(t.avance);
          if (!isNaN(a)) tareasAvanceProm[k].push(a);
        });
      });
      const pend = parsePendientes(p);
      pendUrgentes += pend.filter(x => /Cr[ií]tico|Alto/.test(x.criticidad || "")).length;
      ncPendientes += parseNCs(p).length;
      const sinNov = (p.hseSinNovedad === true || p.hseSinNovedad === "TRUE" || (p.hse && p.hse.sinNovedad));
      if (!sinNov && (!ultIncidente || p.fecha > ultIncidente)) ultIncidente = p.fecha;
      // Personal
      const pers = parseInt(p.personalEnObra || (p.cierre && p.cierre.personalEnObra) || 0, 10);
      if (pers > 0) { personalSum += pers; personalCount++; }
      // Empresas
      const emps = empresasFromParte(p);
      emps.forEach(e => empresasSet.add(e));
    });

    // Días sin HSE
    let diasSinHSE = 0;
    if (ultIncidente) {
      const d = new Date(ultIncidente);
      diasSinHSE = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
    } else if (partes.length) {
      const minF = partes.map(p => p.fecha).sort((a,b) => a < b ? -1 : 1)[0];
      diasSinHSE = Math.floor((Date.now() - new Date(minF).getTime()) / (1000 * 60 * 60 * 24));
    }

    // PAT liberada CORRECTO: sobre total de locaciones de la obra
    const locacionesObra = (obra.locaciones || []).length;
    let liberadas = 0;
    Object.keys(patBestByLoc).forEach(loc => { if (patBestByLoc[loc].ohm <= 2) liberadas++; });
    const avancePAT = locacionesObra > 0 ? Math.round((liberadas / locacionesObra) * 100) : 0;

    // Avance promedio de tareas (civ/mec/elec)
    const avanceCMElec = ["civ", "mec", "elec"].reduce((all, k) => all.concat(tareasAvanceProm[k]), []);
    const avgTareas = avanceCMElec.length ? Math.round(avanceCMElec.reduce((a,b)=>a+b,0) / avanceCMElec.length) : 0;

    const avanceTotal = Math.min(100, Math.max(0, Math.round(((pkActual - obra.pkInicio) / total) * 100)));
    const tendKm = (totalTendidoFO / 1000).toFixed(2);
    const personalProm = personalCount ? Math.round(personalSum / personalCount) : 0;
    const cuprosFailPct = cuprosTotal ? Math.round((cuprosFail / cuprosTotal) * 100) : 0;

    view.querySelector("#kpis").innerHTML = `
      <div class="kpi accent">
        <div class="label">Avance general (PK)</div>
        <div class="value">${avanceTotal}<small>%</small></div>
        <div class="sub">PK ${UI.formatPK(pkActual)} de ${UI.formatPK(obra.pkFin)}</div>
        <div class="kpi-bar"><div class="kpi-bar-fill" style="width:${avanceTotal}%"></div></div>
      </div>
      <div class="kpi">
        <div class="label">Tendido FO</div>
        <div class="value">${tendKm}<small> km</small></div>
        <div class="sub">${Charts.fmt(totalTendidoFO, { decimals: 0 })} m · ${totalEmpalmes} empalmes</div>
      </div>
      <div class="kpi">
        <div class="label">PAT liberada</div>
        <div class="value" style="color:${avancePAT >= 80 ? "var(--ok)" : avancePAT >= 50 ? "var(--warn)" : "var(--danger)"}">${avancePAT}<small>%</small></div>
        <div class="sub">${liberadas} de ${locacionesObra} locaciones · ≤ 2Ω</div>
      </div>
      <div class="kpi">
        <div class="label">Cupros PC</div>
        <div class="value">${cuprosTotal}</div>
        <div class="sub" style="color:${cuprosFail ? "var(--danger)" : "var(--text-muted)"}">${cuprosFail} FAIL · ${cuprosFailPct}%</div>
      </div>
      <div class="kpi">
        <div class="label">Avance tareas</div>
        <div class="value">${avgTareas}<small>%</small></div>
        <div class="sub">CIV / MEC / ELEC · ${avanceCMElec.length} ítems</div>
      </div>
      <div class="kpi">
        <div class="label">Instrumentos</div>
        <div class="value">${totalInstrumentos}</div>
        <div class="sub">registrados en período</div>
      </div>
      <div class="kpi">
        <div class="label">Personal promedio</div>
        <div class="value">${personalProm}</div>
        <div class="sub">${empresasSet.size} empresa${empresasSet.size === 1 ? "" : "s"} activas</div>
      </div>
      <div class="kpi">
        <div class="label">Días sin HSE</div>
        <div class="value" style="color:${diasSinHSE >= 30 ? "var(--ok)" : "var(--text-strong)"}">${diasSinHSE}</div>
        <div class="sub">${pendUrgentes} pend. urgentes · ${ncPendientes} NC</div>
      </div>
    `;
  }

  /* ==========================================================
   *  PIPELINE
   * ========================================================== */
  function drawPipeline(view, obra, partes) {
    const box = view.querySelector("#pipeline");
    if (!box) return;
    const total = Math.max(1, obra.pkFin - obra.pkInicio);
    let pkActual = obra.pkInicio;
    partes.forEach(p => {
      const fo = (p.avances && p.avances.fo) || foFromFlat(p);
      if (fo && fo.pkFinDia) pkActual = Math.max(pkActual, parseFloat(fo.pkFinDia));
    });
    const pct = Math.min(100, Math.max(0, ((pkActual - obra.pkInicio) / total) * 100));
    const locaciones = obra.locaciones || [];
    const markers = locaciones.map((l, i) => {
      const lp = (i + 1) / (locaciones.length + 1) * 100;
      return `<div class="marker" style="left:${lp.toFixed(2)}%"><span class="lbl">${esc(l)}</span></div>`;
    }).join("");
    box.innerHTML = `
      <div class="track">
        <div class="progress" style="width:${pct.toFixed(1)}%"></div>
        ${markers}
      </div>
      <div class="scale">
        <span>${UI.formatPK(obra.pkInicio)}</span>
        <span>PK actual: <b>${UI.formatPK(pkActual)}</b> (${pct.toFixed(1)}%)</span>
        <span>${UI.formatPK(obra.pkFin)}</span>
      </div>
    `;
  }

  /* ==========================================================
   *  EVOLUCIÓN POR ESPECIALIDAD
   * ========================================================== */
  function drawEvolucion(view, obra, partes) {
    const grid = view.querySelector("#evoGrid");
    if (!grid) return;
    const especialidades = obra.especialidades || [];

    if (!partes.length) {
      grid.innerHTML = `<div class="empty"><p>Sin datos en el período.</p></div>`;
      return;
    }

    // Calcular resumen por especialidad: valor actual, tendencia, días activos
    const specs = {
      fo:   { icon: "🔆", title: "Fibra Óptica",       calc: () => {
        let maxAcum = 0, empT = 0, dias = 0;
        partes.forEach(p => { const fo = (p.avances && p.avances.fo) || foFromFlat(p); if (fo) { maxAcum = Math.max(maxAcum, parseFloat(fo.tendidoAcum) || 0); empT += parseInt(fo.empalmes, 10) || 0; if (parseFloat(fo.tendidoHoy) > 0) dias++; } });
        return { valor: (maxAcum / 1000).toFixed(2) + " km", sub: `${empT} empalmes · ${dias} día${dias===1?"":"s"} activo${dias===1?"":"s"}`, pct: -1 };
      }},
      pat:  { icon: "⏚", title: "PAT Mallas",          calc: () => {
        const locObra = (obra.locaciones || []).length;
        const best = {};
        partes.forEach(p => patMediciones(p).forEach(m => { const v = parseFloat(m.ohm); if (!isNaN(v) && v > 0 && (!best[m.locacion] || v < best[m.locacion])) best[m.locacion] = v; }));
        const lib = Object.values(best).filter(v => v <= 2).length;
        const pct = locObra > 0 ? Math.round((lib / locObra) * 100) : 0;
        return { valor: lib + " / " + locObra, sub: `locaciones liberadas (≤ 2Ω)`, pct };
      }},
      pc:   { icon: "⚡", title: "Protección Catódica", calc: () => {
        let total = 0, fail = 0;
        partes.forEach(p => cuprosFromParte(p).forEach(c => { total++; if ((c.martillo+"").toUpperCase() === "FAIL") fail++; }));
        const pct = total ? Math.round(((total - fail) / total) * 100) : 0;
        return { valor: total + " cupros", sub: `${fail} FAIL · ${total ? (100 - pct) : 0}% falla`, pct };
      }},
      elec: { icon: "🔌", title: "Eléctrico",          calc: () => calcTareasResumen(partes, "elec") },
      inst: { icon: "🎛", title: "Instrumentación",     calc: () => {
        let total = 0;
        const estados = {};
        partes.forEach(p => tareasFromKey(p, "inst", "instrumentos").forEach(i => { total++; estados[i.estado || "—"] = (estados[i.estado || "—"] || 0) + 1; }));
        const topEstado = Object.entries(estados).sort((a,b) => b[1] - a[1])[0];
        return { valor: total + " instrumentos", sub: topEstado ? `mayoría: ${topEstado[0]} (${topEstado[1]})` : "sin datos", pct: -1 };
      }},
      civ:  { icon: "🏗", title: "Civil",               calc: () => calcTareasResumen(partes, "civ") },
      mec:  { icon: "⚙", title: "Mecánico",            calc: () => calcTareasResumen(partes, "mec") }
    };

    const activeSpecs = especialidades.filter(k => specs[k]);
    if (!activeSpecs.length) {
      grid.innerHTML = `<div class="empty"><p>Sin especialidades configuradas.</p></div>`;
      return;
    }

    let html = "";
    activeSpecs.forEach(k => {
      const s = specs[k];
      const r = s.calc();
      const color = Charts.SPECIALTY_COLOR[k] || Charts.COLORS.blue;
      const colorBar = r.pct >= 80 ? "var(--ok)" : r.pct >= 50 ? "var(--warn)" : r.pct >= 0 ? "var(--danger)" : color;
      html += `<div class="dash-evo-summary" style="border-left:4px solid ${color};">
        <div class="dash-evo-icon">${s.icon}</div>
        <div class="dash-evo-info">
          <div class="dash-evo-title">${s.title}</div>
          <div class="dash-evo-valor">${r.valor}</div>
          <div class="dash-evo-sub">${r.sub}</div>
          ${r.pct >= 0 ? `<div class="kpi-bar" style="margin-top:6px;background:var(--border);"><div class="kpi-bar-fill" style="width:${r.pct}%;background:${colorBar};"></div></div>` : ""}
        </div>
      </div>`;
    });

    grid.innerHTML = html;
  }

  function calcTareasResumen(partes, key) {
    const avances = [];
    partes.forEach(p => tareasFromKey(p, key).forEach(t => { const a = parseFloat(t.avance); if (!isNaN(a)) avances.push(a); }));
    if (!avances.length) return { valor: "0 tareas", sub: "sin actividad", pct: -1 };
    const avg = Math.round(avances.reduce((a,b)=>a+b,0) / avances.length);
    const done = avances.filter(v => v >= 100).length;
    return { valor: avg + "% promedio", sub: `${avances.length} tareas · ${done} completada${done===1?"":"s"}`, pct: avg };
  }

  /* ==========================================================
   *  SECCIÓN FO COMPLETA
   * ========================================================== */
  function drawFOSection(view, obra, partes) {
    const box = view.querySelector("#foSection");
    if (!box) return;

    // Acumulados (toma el máximo de la columna acum)
    let acums = { preTapada: 0, tendido: 0, nivelacion: 0, mediaTapada: 0, tapadaFinal: 0 };
    let empalmesTotal = 0, otdrCount = 0, bobinasTotal = 0;
    const tramosAcum = [];
    const observaciones = [];
    const sorted = partes.slice().sort((a,b) => a.fecha < b.fecha ? -1 : 1);
    const labels = sorted.map(p => UI.formatDate(p.fecha).split("/").slice(0,2).join("/"));
    const tendidoDiario = [];

    sorted.forEach(p => {
      const fo = (p.avances && p.avances.fo) || foFromFlat(p);
      if (!fo) { tendidoDiario.push(0); return; }
      tendidoDiario.push(parseFloat(fo.tendidoHoy) || 0);
      ["preTapada","tendido","nivelacion","mediaTapada","tapadaFinal"].forEach(k => {
        const v = parseFloat(fo[k + "Acum"]) || 0;
        if (v > acums[k]) acums[k] = v;
      });
      empalmesTotal += parseInt(fo.empalmes, 10) || 0;
      if (fo.otdr === true || fo.otdr === "TRUE" || fo.otdr === "true") otdrCount++;
      bobinasTotal += parseInt(fo.bobinas, 10) || 0;
      const tramos = (fo.tramos && Array.isArray(fo.tramos)) ? fo.tramos
                   : (typeof p.fo_tramos_json === "string" ? safeJson(p.fo_tramos_json, []) : (p.fo_tramos_json || []));
      tramos.forEach(t => tramosAcum.push({ ...t, fecha: p.fecha }));
      if (fo.observacion) observaciones.push({ fecha: p.fecha, texto: fo.observacion });
    });

    const km = (m) => (m / 1000).toFixed(2);
    box.innerHTML = `
      <div class="dash-grid-2">
        <div class="chart-card">
          <div class="chart-head"><h4>Productividad diaria</h4><span class="chart-sub">Metros tendidos por jornada</span></div>
          <div class="chart-body"><canvas id="chFOdaily"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-head"><h4>Acumulados de tendido</h4><span class="chart-sub">Máximo registrado en el período</span></div>
          <div class="chart-body" style="height:auto;padding:var(--sp-3);">
            <div class="kpi-grid" style="grid-template-columns:repeat(2,1fr);gap:var(--sp-2);">
              <div class="mini-kpi"><span class="lbl">Pre-tapada</span><b>${km(acums.preTapada)} km</b></div>
              <div class="mini-kpi"><span class="lbl">Tendido</span><b>${km(acums.tendido)} km</b></div>
              <div class="mini-kpi"><span class="lbl">Nivelación</span><b>${km(acums.nivelacion)} km</b></div>
              <div class="mini-kpi"><span class="lbl">Media tapada</span><b>${km(acums.mediaTapada)} km</b></div>
              <div class="mini-kpi"><span class="lbl">Tapada final</span><b>${km(acums.tapadaFinal)} km</b></div>
              <div class="mini-kpi"><span class="lbl">Empalmes</span><b>${empalmesTotal}</b></div>
              <div class="mini-kpi"><span class="lbl">OTDR (días)</span><b>${otdrCount}</b></div>
              <div class="mini-kpi"><span class="lbl">Bobinas</span><b>${bobinasTotal}</b></div>
            </div>
          </div>
        </div>
      </div>
      ${tramosAcum.length ? `<div class="chart-card mt-3">
        <div class="chart-head"><h4>Tramos de tendido registrados</h4><span class="chart-sub">${tramosAcum.length} tramo${tramosAcum.length === 1 ? "" : "s"} en el período</span></div>
        <table class="tbl">
          <thead><tr><th>Fecha</th><th>Desde</th><th>Hasta</th><th>Actividad</th><th>Metros</th><th>Estado</th><th>Obs</th></tr></thead>
          <tbody>${tramosAcum.slice(0, 30).map(t => {
            const estCls = t.estado === "OK" ? "ok" : t.estado === "Parcial" ? "warn" : "";
            return `<tr>
              <td class="mono">${UI.formatDate(t.fecha)}</td>
              <td>Cám ${esc(t.camDesde || "—")}</td>
              <td>${(t.camHasta === "Receptora") ? "<b>Receptora</b>" : "Cám " + esc(t.camHasta || "—")}</td>
              <td>${esc(t.actividad || "—")}</td>
              <td class="mono">${t.metros ? esc(t.metros) + " m" : "—"}</td>
              <td><span class="badge ${estCls}">${esc(t.estado || "—")}</span></td>
              <td class="text-muted">${esc(t.obs || "—")}</td>
            </tr>`;
          }).join("")}</tbody>
        </table>
      </div>` : ""}
      ${observaciones.length ? `<div class="chart-card mt-3">
        <div class="chart-head"><h4>Observaciones del inspector</h4><span class="chart-sub">${observaciones.length} comentario${observaciones.length === 1 ? "" : "s"}</span></div>
        <div style="padding:var(--sp-3);">
          ${observaciones.slice(0, 10).map(o => `<div class="dash-note">
            <div class="dash-note-date">${UI.formatDate(o.fecha)}</div>
            <div class="dash-note-text">${esc(o.texto).replace(/\n/g, "<br>")}</div>
          </div>`).join("")}
        </div>
      </div>` : ""}
    `;

    if (tendidoDiario.some(v => v > 0)) {
      currentChartInstances.push(Charts.barChart(view.querySelector("#chFOdaily"), labels, [{
        label: "Tendido (m)", data: tendidoDiario, backgroundColor: Charts.COLORS.blueMid, borderRadius: 4
      }], {
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => Charts.fmt(ctx.parsed.y, { unit: "m", decimals: 0 }) } }
        },
        scales: { y: { title: { display: true, text: "Metros / día" } } }
      }));
    } else {
      const c = view.querySelector("#chFOdaily");
      if (c && c.parentElement) c.parentElement.innerHTML = `<div class="empty"><p>Sin tendido FO registrado.</p></div>`;
    }
  }

  /* ==========================================================
   *  SECCIÓN PAT
   * ========================================================== */
  function drawPATSection(view, obra, partes) {
    const box = view.querySelector("#patSection");
    if (!box) return;
    const locaciones = obra.locaciones || [];
    // Mejor medición por locación
    const best = {};
    const observaciones = [];
    let puntualesTotal = 0;
    partes.forEach(p => {
      patMediciones(p).forEach(m => {
        const v = parseFloat(m.ohm);
        if (!isNaN(v) && v > 0) {
          if (!best[m.locacion] || v < best[m.locacion].ohm) {
            best[m.locacion] = { ohm: v, fecha: p.fecha, estado: m.estado, obs: m.obs };
          }
        }
      });
      const pat = (p.avances && p.avances.pat) || {};
      if (pat.puntuales && Array.isArray(pat.puntuales)) puntualesTotal += pat.puntuales.length;
      else {
        const pp = safeJson(p.pat_puntuales_json, []);
        if (Array.isArray(pp)) puntualesTotal += pp.length;
      }
      if (pat.observacion) observaciones.push({ fecha: p.fecha, texto: pat.observacion });
      else if (p.pat_observacion) observaciones.push({ fecha: p.fecha, texto: p.pat_observacion });
    });

    // Ordenar locaciones por la mejor medición
    const filas = locaciones.map(loc => ({ loc, ...(best[loc] || {}) }));

    box.innerHTML = `
      <div class="dash-grid-2">
        <div class="chart-card">
          <div class="chart-head"><h4>Última campaña medida</h4><span class="chart-sub">Resistencia a tierra</span></div>
          <div class="chart-body"><canvas id="chPAT"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-head"><h4>Mejor estado por locación</h4><span class="chart-sub">Menor Ω registrado · ${puntualesTotal} medición${puntualesTotal === 1 ? "" : "es"} puntual${puntualesTotal === 1 ? "" : "es"}</span></div>
          <table class="tbl">
            <thead><tr><th>Locación</th><th>Mejor Ω</th><th>Fecha</th><th>Estado</th></tr></thead>
            <tbody>${filas.map(f => {
              const v = parseFloat(f.ohm);
              const cls = isNaN(v) ? "" : v > 2 ? "danger" : v > 1.5 ? "warn" : "ok";
              return `<tr>
                <td><b>${esc(f.loc)}</b></td>
                <td><span class="pat-cell ${cls}">${isNaN(v) ? "Sin medir" : v.toFixed(2) + " Ω"}</span></td>
                <td class="mono">${f.fecha ? UI.formatDate(f.fecha) : "—"}</td>
                <td>${esc(f.estado || "—")}</td>
              </tr>`;
            }).join("")}</tbody>
          </table>
        </div>
      </div>
      ${observaciones.length ? `<div class="chart-card mt-3">
        <div class="chart-head"><h4>Descripción de trabajos PAT</h4><span class="chart-sub">Observaciones del inspector</span></div>
        <div style="padding:var(--sp-3);">
          ${observaciones.slice(0, 10).map(o => `<div class="dash-note">
            <div class="dash-note-date">${UI.formatDate(o.fecha)}</div>
            <div class="dash-note-text">${esc(o.texto).replace(/\n/g, "<br>")}</div>
          </div>`).join("")}
        </div>
      </div>` : ""}
    `;

    // Chart de la última campaña con mediciones reales
    const ultConPAT = partes.find(p => patMediciones(p).length > 0);
    const ultPAT = ultConPAT ? patMediciones(ultConPAT) : [];
    if (ultPAT.length) {
      const labels2 = ultPAT.map(m => m.locacion);
      const data = ultPAT.map(m => parseFloat(m.ohm) || 0);
      const colors = data.map(v => v > 2 ? Charts.COLORS.danger : v > 1.5 ? Charts.COLORS.warn : Charts.COLORS.ok);
      const chart = new Chart(view.querySelector("#chPAT"), {
        type: "bar",
        data: { labels: labels2, datasets: [{ label: "Resistencia (Ω)", data, backgroundColor: colors, borderRadius: 6 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { backgroundColor: "rgba(15,23,42,0.96)", padding: 10, cornerRadius: 8, callbacks: { label: (ctx) => Charts.fmt(ctx.parsed.y, { unit: "Ω", decimals: 2 }) } }
          },
          scales: {
            x: { ticks: { maxRotation: 35, autoSkip: false, font: { family: "Barlow" } }, grid: { display: false } },
            y: { beginAtZero: true, title: { display: true, text: "Ω · límite YPF: 2Ω" }, grid: { color: "rgba(0,0,0,0.06)" } }
          }
        },
        plugins: [Charts.thresholdPlugin(2, "Límite 2Ω", Charts.COLORS.danger), Charts.thresholdPlugin(1.5, "Alerta 1.5Ω", Charts.COLORS.warn)]
      });
      currentChartInstances.push(chart);
    } else {
      const c = view.querySelector("#chPAT");
      if (c && c.parentElement) c.parentElement.innerHTML = `<div class="empty"><p>Sin mediciones PAT en el período.</p></div>`;
    }
  }

  /* ==========================================================
   *  SECCIÓN PC (Cupros + Wenner + Juntas)
   * ========================================================== */
  function drawPCSection(view, partes) {
    const box = view.querySelector("#pcSection");
    if (!box) return;
    let cuprosTotal = 0, cuprosFail = 0, cuprosPass = 0;
    const cuprosLista = [];
    let wennerTotal = 0;
    const wennerUbic = new Set();
    let juntasTotal = 0;
    const juntasEstados = {};

    partes.forEach(p => {
      cuprosFromParte(p).forEach(c => {
        cuprosTotal++;
        const fail = (c.martillo + "").toUpperCase() === "FAIL";
        if (fail) cuprosFail++; else cuprosPass++;
        cuprosLista.push({ ...c, fecha: p.fecha });
      });
      const pc = (p.avances && p.avances.pc) || {};
      const wc = parseInt(pc.wennerCount || p.pc_wennerCount || 0, 10);
      if (wc > 0) wennerTotal += wc;
      const wu = pc.wennerUbic || p.pc_wennerUbic;
      if (wu) String(wu).split(/[,;]/).map(s => s.trim()).filter(Boolean).forEach(u => wennerUbic.add(u));
      const jc = parseInt(pc.juntasCount || p.pc_juntasCount || 0, 10);
      if (jc > 0) juntasTotal += jc;
      const je = pc.juntasEstado || p.pc_juntasEstado;
      if (je) juntasEstados[je] = (juntasEstados[je] || 0) + 1;
    });

    const failPct = cuprosTotal ? Math.round((cuprosFail / cuprosTotal) * 100) : 0;

    box.innerHTML = `
      <div class="dash-grid-2">
        <div class="chart-card">
          <div class="chart-head"><h4>Test martillo cupros</h4><span class="chart-sub">${cuprosTotal} ejecutados · ${failPct}% FAIL</span></div>
          <div class="chart-body"><canvas id="chCupros"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-head"><h4>Resumen PC</h4><span class="chart-sub">Wenner · Juntas dieléctricas</span></div>
          <div class="chart-body" style="height:auto;padding:var(--sp-3);">
            <div class="kpi-grid" style="grid-template-columns:repeat(2,1fr);gap:var(--sp-2);">
              <div class="mini-kpi"><span class="lbl">Cupros total</span><b>${cuprosTotal}</b></div>
              <div class="mini-kpi"><span class="lbl">Cupros FAIL</span><b style="color:${cuprosFail ? "var(--danger)" : "inherit"};">${cuprosFail}</b></div>
              <div class="mini-kpi"><span class="lbl">Wenner (mediciones)</span><b>${wennerTotal}</b></div>
              <div class="mini-kpi"><span class="lbl">Ubicaciones Wenner</span><b>${wennerUbic.size}</b></div>
              <div class="mini-kpi"><span class="lbl">Juntas verificadas</span><b>${juntasTotal}</b></div>
              <div class="mini-kpi"><span class="lbl">Estados de junta</span><b>${Object.keys(juntasEstados).length}</b></div>
            </div>
            ${Object.keys(juntasEstados).length ? `<div class="mt-3 fs-14 text-muted">
              <b>Estados:</b> ${Object.entries(juntasEstados).map(([k, v]) => `${esc(k)} (${v})`).join(", ")}
            </div>` : ""}
            ${wennerUbic.size ? `<div class="mt-2 fs-14 text-muted">
              <b>Ubicaciones Wenner:</b> ${Array.from(wennerUbic).map(esc).join(", ")}
            </div>` : ""}
          </div>
        </div>
      </div>
      ${cuprosLista.length ? `<div class="chart-card mt-3">
        <div class="chart-head"><h4>Detalle de cupros</h4><span class="chart-sub">Últimos ${Math.min(20, cuprosLista.length)}</span></div>
        <table class="tbl">
          <thead><tr><th>Fecha</th><th>PK</th><th>Martillo</th><th>Resist. (mΩ)</th><th>Obs</th></tr></thead>
          <tbody>${cuprosLista.slice(0, 20).map(c => `<tr>
            <td class="mono">${UI.formatDate(c.fecha)}</td>
            <td class="mono">${UI.formatPK(parseFloat(c.pk) || 0)}</td>
            <td>${(c.martillo + "").toUpperCase() === "FAIL" ? `<span class="badge danger">FAIL</span>` : `<span class="badge ok">PASS</span>`}</td>
            <td class="mono">${esc(c.resistencia || "—")}</td>
            <td class="text-muted">${esc(c.obs || "—")}</td>
          </tr>`).join("")}</tbody>
        </table>
      </div>` : ""}
    `;

    if (cuprosTotal > 0) {
      currentChartInstances.push(Charts.pieChart(
        view.querySelector("#chCupros"),
        ["PASS", "FAIL"],
        [cuprosPass, cuprosFail],
        [Charts.COLORS.ok, Charts.COLORS.danger]
      ));
    } else {
      const c = view.querySelector("#chCupros");
      if (c && c.parentElement) c.parentElement.innerHTML = `<div class="empty"><p>Sin cupros ejecutados.</p></div>`;
    }
  }

  /* ==========================================================
   *  SECCIÓN GENÉRICA: tareas CIV/MEC/ELEC con avance %
   * ========================================================== */
  function drawTareasSection(view, partes, key, selector) {
    const box = view.querySelector(selector);
    if (!box) return;
    const todas = [];
    partes.forEach(p => {
      tareasFromKey(p, key).forEach(t => todas.push({ ...t, fecha: p.fecha }));
    });
    if (!todas.length) {
      box.innerHTML = `<div class="chart-card"><div class="empty"><p>Sin tareas registradas en el período.</p></div></div>`;
      return;
    }
    const avances = todas.map(t => parseFloat(t.avance) || 0);
    const avg = Math.round(avances.reduce((a,b) => a+b, 0) / avances.length);
    const completadas = avances.filter(v => v >= 100).length;
    const enProgreso = avances.filter(v => v > 0 && v < 100).length;
    const noIniciadas = avances.filter(v => v === 0).length;

    box.innerHTML = `
      <div class="dash-grid-2">
        <div class="chart-card">
          <div class="chart-head"><h4>Estado de tareas</h4><span class="chart-sub">${todas.length} tarea${todas.length === 1 ? "" : "s"} en el período</span></div>
          <div class="chart-body" style="height:auto;padding:var(--sp-3);">
            <div class="kpi-grid" style="grid-template-columns:repeat(2,1fr);gap:var(--sp-2);">
              <div class="mini-kpi"><span class="lbl">Avance promedio</span><b style="color:${avg >= 80 ? "var(--ok)" : avg >= 50 ? "var(--warn)" : "var(--danger)"};">${avg}%</b></div>
              <div class="mini-kpi"><span class="lbl">Total tareas</span><b>${todas.length}</b></div>
              <div class="mini-kpi"><span class="lbl">Completadas</span><b style="color:var(--ok);">${completadas}</b></div>
              <div class="mini-kpi"><span class="lbl">En progreso</span><b style="color:var(--warn);">${enProgreso}</b></div>
              <div class="mini-kpi"><span class="lbl">No iniciadas</span><b style="color:var(--text-muted);">${noIniciadas}</b></div>
            </div>
          </div>
        </div>
        <div class="chart-card">
          <div class="chart-head"><h4>Distribución por estado</h4><span class="chart-sub">Completadas vs en proceso</span></div>
          <div class="chart-body"><canvas id="ch_${key}_status"></canvas></div>
        </div>
      </div>
      <div class="chart-card mt-3">
        <div class="chart-head"><h4>Últimas tareas registradas</h4><span class="chart-sub">Ordenadas por fecha</span></div>
        <table class="tbl">
          <thead><tr><th>Fecha</th><th>Descripción</th><th>Tipo</th><th>Avance</th><th>Obs</th></tr></thead>
          <tbody>${todas.slice(0, 25).map(t => {
            const a = parseFloat(t.avance) || 0;
            const cls = a >= 100 ? "ok" : a >= 50 ? "warn" : "danger";
            return `<tr>
              <td class="mono">${UI.formatDate(t.fecha)}</td>
              <td>${esc(t.desc || "—")}</td>
              <td>${esc(t.tipo || "—")}</td>
              <td><span class="badge ${cls}">${a}%</span></td>
              <td class="text-muted">${esc(t.obs || "—")}</td>
            </tr>`;
          }).join("")}</tbody>
        </table>
      </div>
    `;

    currentChartInstances.push(Charts.pieChart(
      view.querySelector(`#ch_${key}_status`),
      ["Completadas", "En progreso", "No iniciadas"],
      [completadas, enProgreso, noIniciadas],
      [Charts.COLORS.ok, Charts.COLORS.warn, Charts.COLORS.muted || "#94a3b8"]
    ));
  }

  /* ==========================================================
   *  SECCIÓN INSTRUMENTACIÓN
   * ========================================================== */
  function drawInstSection(view, partes) {
    const box = view.querySelector("#instSection");
    if (!box) return;
    const todos = [];
    partes.forEach(p => {
      tareasFromKey(p, "inst", "instrumentos").forEach(i => todos.push({ ...i, fecha: p.fecha }));
    });
    if (!todos.length) {
      box.innerHTML = `<div class="chart-card"><div class="empty"><p>Sin instrumentos registrados.</p></div></div>`;
      return;
    }
    const porEstado = {};
    todos.forEach(i => { porEstado[i.estado || "—"] = (porEstado[i.estado || "—"] || 0) + 1; });

    box.innerHTML = `
      <div class="dash-grid-2">
        <div class="chart-card">
          <div class="chart-head"><h4>Distribución por estado</h4><span class="chart-sub">${todos.length} instrumento${todos.length === 1 ? "" : "s"}</span></div>
          <div class="chart-body"><canvas id="chInst"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-head"><h4>Resumen</h4><span class="chart-sub">Estados detectados</span></div>
          <div class="chart-body" style="height:auto;padding:var(--sp-3);">
            <div class="kpi-grid" style="grid-template-columns:repeat(2,1fr);gap:var(--sp-2);">
              ${Object.entries(porEstado).map(([k, v]) => `<div class="mini-kpi"><span class="lbl">${esc(k)}</span><b>${v}</b></div>`).join("")}
            </div>
          </div>
        </div>
      </div>
      <div class="chart-card mt-3">
        <div class="chart-head"><h4>Listado de instrumentos</h4><span class="chart-sub">Últimos ${Math.min(25, todos.length)}</span></div>
        <table class="tbl">
          <thead><tr><th>Fecha</th><th>TAG</th><th>Descripción</th><th>Estado</th><th>Obs</th></tr></thead>
          <tbody>${todos.slice(0, 25).map(i => `<tr>
            <td class="mono">${UI.formatDate(i.fecha)}</td>
            <td class="mono">${esc(i.tag || "—")}</td>
            <td>${esc(i.desc || "—")}</td>
            <td>${esc(i.estado || "—")}</td>
            <td class="text-muted">${esc(i.obs || "—")}</td>
          </tr>`).join("")}</tbody>
        </table>
      </div>
    `;

    const labels = Object.keys(porEstado);
    const data = labels.map(k => porEstado[k]);
    const palette = [Charts.COLORS.ok, Charts.COLORS.blueMid, Charts.COLORS.warn, Charts.COLORS.danger, "#94a3b8", "#a855f7"];
    currentChartInstances.push(Charts.pieChart(
      view.querySelector("#chInst"),
      labels, data,
      labels.map((_, i) => palette[i % palette.length])
    ));
  }

  /* ==========================================================
   *  HSE
   * ========================================================== */
  function drawHSE(view, partes) {
    const canvas = view.querySelector("#chHSE");
    if (!canvas) return;
    const ok  = partes.filter(p => p.hseSinNovedad === true || p.hseSinNovedad === "TRUE" || (p.hse && p.hse.sinNovedad)).length;
    const bad = partes.length - ok;
    if (partes.length) {
      currentChartInstances.push(Charts.pieChart(canvas, ["Sin novedad", "Con novedad"], [ok, bad], [Charts.COLORS.ok, Charts.COLORS.danger]));
    } else if (canvas.parentElement) {
      canvas.parentElement.innerHTML = `<div class="empty"><p>Sin partes en el período.</p></div>`;
    }
  }

  function drawHSECharlas(view, partes) {
    const box = view.querySelector("#hseCharlasBox");
    if (!box) return;
    const charlasMap = {};
    let incidentes = [];
    partes.forEach(p => {
      const charlas = parsePendientesField(p, "hseCharlas") || [];
      const cs = Array.isArray(charlas) ? charlas : [];
      cs.forEach(c => {
        const tema = (typeof c === "string") ? c : (c.tema || c.desc || String(c));
        if (tema) charlasMap[tema] = (charlasMap[tema] || 0) + 1;
      });
      const sinNov = (p.hseSinNovedad === true || p.hseSinNovedad === "TRUE" || (p.hse && p.hse.sinNovedad));
      if (!sinNov) {
        incidentes.push({
          fecha: p.fecha,
          detalle: p.hseDetalle || (p.hse && p.hse.detalle) || "",
          criticidad: p.hseCriticidad || (p.hse && p.hse.criticidad) || ""
        });
      }
    });
    const charlas = Object.entries(charlasMap).sort((a,b) => b[1] - a[1]).slice(0, 10);
    box.style.height = "auto";
    box.style.padding = "var(--sp-3)";
    box.innerHTML = `
      ${charlas.length ? `<div class="fs-14 mb-3"><b>Top charlas (${charlas.length}):</b></div>
        <ul class="dash-list">${charlas.map(([k, v]) => `<li><span>${esc(k)}</span><span class="badge">${v}</span></li>`).join("")}</ul>` : `<p class="text-muted fs-14">Sin charlas registradas en el período.</p>`}
      ${incidentes.length ? `<div class="fs-14 mt-3 mb-2"><b style="color:var(--danger);">⚠ ${incidentes.length} incidente${incidentes.length === 1 ? "" : "s"}:</b></div>
        <ul class="dash-list">${incidentes.slice(0, 5).map(i => `<li>
          <span><span class="mono fs-12 text-muted">${UI.formatDate(i.fecha)}</span> ${esc(i.detalle || "Sin detalle")}</span>
          <span class="badge ${/Cr[ií]tico/.test(i.criticidad) ? "danger" : /Alto/.test(i.criticidad) ? "warn" : ""}">${esc(i.criticidad || "—")}</span>
        </li>`).join("")}</ul>` : ""}
    `;
  }

  /* ==========================================================
   *  OPERATIVA: personal + empresas
   * ========================================================== */
  function drawOperativa(view, partes) {
    const box = view.querySelector("#operativaBox");
    if (!box) return;
    const personalDiario = [];
    const empresasFreq = {};
    partes.slice().reverse().forEach(p => {
      const pers = parseInt(p.personalEnObra || (p.cierre && p.cierre.personalEnObra) || 0, 10);
      personalDiario.push({ fecha: p.fecha, valor: pers });
      empresasFromParte(p).forEach(e => { empresasFreq[e] = (empresasFreq[e] || 0) + 1; });
    });
    const promedio = personalDiario.length ? Math.round(personalDiario.reduce((a, x) => a + x.valor, 0) / personalDiario.length) : 0;
    const maxP = personalDiario.reduce((m, x) => x.valor > m ? x.valor : m, 0);
    const empresas = Object.entries(empresasFreq).sort((a,b) => b[1] - a[1]);

    box.style.height = "auto";
    box.style.padding = "var(--sp-3)";
    box.innerHTML = `
      <div class="kpi-grid" style="grid-template-columns:repeat(2,1fr);gap:var(--sp-2);">
        <div class="mini-kpi"><span class="lbl">Personal promedio</span><b>${promedio}</b></div>
        <div class="mini-kpi"><span class="lbl">Personal máximo</span><b>${maxP}</b></div>
        <div class="mini-kpi"><span class="lbl">Empresas activas</span><b>${empresas.length}</b></div>
        <div class="mini-kpi"><span class="lbl">Días con personal</span><b>${personalDiario.filter(x => x.valor > 0).length}</b></div>
      </div>
      ${empresas.length ? `<div class="fs-14 mt-3 mb-2"><b>Empresas presentes:</b></div>
        <ul class="dash-list">${empresas.slice(0, 10).map(([e, n]) => `<li>
          <span>${esc(e)}</span>
          <span class="badge">${n} día${n === 1 ? "" : "s"}</span>
        </li>`).join("")}</ul>` : `<p class="text-muted fs-14 mt-3">Sin empresas registradas.</p>`}
    `;
  }

  /* ==========================================================
   *  COMUNICACIÓN: cambios programa + comunicación cliente
   * ========================================================== */
  function drawComunicacion(view, partes) {
    const box = view.querySelector("#comunicacionBox");
    if (!box) return;
    const cambios = [];
    const comunicaciones = [];
    partes.forEach(p => {
      const c = p.cambiosPrograma || (p.handover && p.handover.cambiosPrograma);
      const co = p.comunicacion || (p.handover && p.handover.comunicacion);
      if (c && String(c).trim()) cambios.push({ fecha: p.fecha, texto: c });
      if (co && String(co).trim()) comunicaciones.push({ fecha: p.fecha, texto: co });
    });
    box.style.height = "auto";
    box.style.padding = "var(--sp-3)";
    if (!cambios.length && !comunicaciones.length) {
      box.innerHTML = `<p class="text-muted fs-14">Sin cambios ni comunicaciones registradas.</p>`;
      return;
    }
    box.innerHTML = `
      ${cambios.length ? `<div class="fs-14 mb-2"><b>📋 Cambios de programa:</b></div>
        ${cambios.slice(0, 5).map(c => `<div class="dash-note">
          <div class="dash-note-date">${UI.formatDate(c.fecha)}</div>
          <div class="dash-note-text">${esc(c.texto).replace(/\n/g, "<br>")}</div>
        </div>`).join("")}` : ""}
      ${comunicaciones.length ? `<div class="fs-14 mt-3 mb-2"><b>📞 Comunicación con cliente:</b></div>
        ${comunicaciones.slice(0, 5).map(c => `<div class="dash-note">
          <div class="dash-note-date">${UI.formatDate(c.fecha)}</div>
          <div class="dash-note-text">${esc(c.texto).replace(/\n/g, "<br>")}</div>
        </div>`).join("")}` : ""}
    `;
  }

  /* ==========================================================
   *  PENDIENTES + NC
   * ========================================================== */
  function drawPendientes(view, partes) {
    const box = view.querySelector("#pendientesBox");
    if (!box) return;
    const all = [];
    partes.forEach(p => parsePendientes(p).forEach(x => {
      if (/Cr[ií]tico|Alto/.test(x.criticidad || "")) all.push({ ...x, fecha: p.fecha });
    }));
    if (!all.length) { box.innerHTML = `<div class="empty"><p>✓ Sin pendientes urgentes.</p></div>`; return; }
    box.style.height = "auto";
    box.innerHTML = `<table class="tbl">
      <thead><tr><th>Fecha</th><th>Descripción</th><th>Resp.</th><th>Crit.</th></tr></thead>
      <tbody>${all.slice(0, 20).map(x => `<tr>
        <td class="mono">${UI.formatDate(x.fecha)}</td>
        <td>${esc(x.desc || "")}</td>
        <td>${esc(x.responsable || "—")}</td>
        <td><span class="badge ${/Cr[ií]tico/.test(x.criticidad) ? "danger" : "warn"}">${esc(x.criticidad || "")}</span></td>
      </tr>`).join("")}</tbody>
    </table>`;
  }

  function drawNCs(view, partes) {
    const box = view.querySelector("#ncBox");
    if (!box) return;
    const all = [];
    partes.forEach(p => parseNCs(p).forEach(x => all.push({ ...x, fecha: p.fecha })));
    if (!all.length) { box.innerHTML = `<div class="empty"><p>✓ Sin no conformidades.</p></div>`; return; }
    box.style.height = "auto";
    box.innerHTML = `<table class="tbl">
      <thead><tr><th>Fecha</th><th>Descripción</th><th>Ubicación</th><th>Acción</th></tr></thead>
      <tbody>${all.slice(0, 20).map(x => `<tr>
        <td class="mono">${UI.formatDate(x.fecha)}</td>
        <td>${esc(x.desc || "")}</td>
        <td>${esc(x.ubicacion || "—")}</td>
        <td class="text-muted">${esc(x.accion || "—")}</td>
      </tr>`).join("")}</tbody>
    </table>`;
  }

  /* ==========================================================
   *  GALERÍA DE FOTOS
   * ========================================================== */
  function drawFotos(view, partes) {
    const box = view.querySelector("#fotosBox");
    const counter = view.querySelector("#fotosCount");
    if (!box) return;
    // Las fotos llegan solo si están en p.cierre.fotos (datos locales) — el backend solo guarda fotosCount
    let total = 0;
    let totalSheet = 0;
    const galeria = [];
    partes.forEach(p => {
      const fotos = (p.cierre && p.cierre.fotos) || [];
      if (Array.isArray(fotos)) {
        fotos.forEach(f => galeria.push({ ...f, fecha: p.fecha }));
        total += fotos.length;
      }
      const fc = parseInt(p.fotosCount || 0, 10);
      if (fc > 0) totalSheet += fc;
    });
    if (counter) counter.textContent = (total || totalSheet) + " foto" + ((total || totalSheet) === 1 ? "" : "s");

    if (!galeria.length) {
      box.innerHTML = `<div class="empty" style="padding:var(--sp-4);">
        <p>${totalSheet ? `Se reportaron <b>${totalSheet}</b> foto(s) en el período. Las imágenes se almacenan localmente en el dispositivo del inspector.` : "Sin fotos en el período."}</p>
      </div>`;
      return;
    }
    box.innerHTML = `<div class="dash-gallery">${galeria.slice(0, 24).map(f => `
      <div class="dash-photo" title="${UI.formatDate(f.fecha)}">
        <img src="${f.dataUrl}" alt="${esc(f.name || "")}" loading="lazy" />
        <span class="dash-photo-date">${UI.formatDate(f.fecha)}</span>
      </div>
    `).join("")}</div>`;
  }

  /* ==========================================================
   *  HISTÓRICO
   * ========================================================== */
  function drawHistorico(view, partes) {
    const box = view.querySelector("#histBox");
    const counter = view.querySelector("#histCount");
    if (!box) return;
    if (counter) counter.textContent = partes.length + " parte" + (partes.length === 1 ? "" : "s");
    if (!partes.length) { box.innerHTML = `<div class="empty"><p>Sin partes en el período.</p></div>`; return; }
    box.innerHTML = `<table class="tbl tbl-hist">
      <thead><tr><th>Fecha</th><th>Turno</th><th>Inspector</th><th>Clima</th><th>Alerta YPF</th><th>Personal</th><th>HSE</th><th></th></tr></thead>
      <tbody>${partes.slice(0, 30).map(p => {
        const sinNov = (p.hseSinNovedad === true || p.hseSinNovedad === "TRUE" || (p.hse && p.hse.sinNovedad));
        return `<tr data-id="${esc(p.id)}" class="hist-row">
          <td class="mono">${UI.formatDate(p.fecha)}</td>
          <td>${esc(p.turno || "—")}</td>
          <td>${esc(p.inspectorNombre || "—")}</td>
          <td>${esc(p.clima || (p.condiciones && p.condiciones.clima) || "—")}</td>
          <td>${esc(p.alertaYpf || (p.condiciones && p.condiciones.alertaYpf) || "—")}</td>
          <td class="mono">${p.personalEnObra || (p.cierre && p.cierre.personalEnObra) || 0}</td>
          <td><span class="badge ${sinNov ? "ok" : "danger"}">${sinNov ? "OK" : "Novedad"}</span></td>
          <td class="text-muted">›</td>
        </tr>`;
      }).join("")}</tbody>
    </table>`;
    box.querySelectorAll(".hist-row").forEach(tr => {
      tr.style.cursor = "pointer";
      tr.onclick = () => UI.navigate("/parte?id=" + encodeURIComponent(tr.dataset.id));
    });
  }

  /* ==========================================================
   *  HELPERS DE PARSEO
   * ========================================================== */
  function safeJson(v, def) {
    if (v == null) return def;
    if (Array.isArray(v) || typeof v === "object") return v;
    if (typeof v === "string") { try { return JSON.parse(v); } catch (e) { return def; } }
    return def;
  }
  function foFromFlat(p) {
    if (!p) return null;
    const keys = ["preTapadaHoy","preTapadaAcum","tendidoHoy","tendidoAcum","pkInicioDia","pkFinDia","nivelacionHoy","nivelacionAcum","mediaTapadaHoy","mediaTapadaAcum","tapadaFinalHoy","tapadaFinalAcum","otdr","bobinas","empalmes","observacion"];
    const out = {}; let any = false;
    keys.forEach(k => { const v = p["fo_" + k]; if (v != null && v !== "") { out[k] = v; any = true; } });
    return any ? out : null;
  }
  function patMediciones(p) {
    if (!p) return [];
    if (p.avances && p.avances.pat && Array.isArray(p.avances.pat.mediciones)) return p.avances.pat.mediciones;
    if (Array.isArray(p.pat_mediciones_json)) return p.pat_mediciones_json;
    if (typeof p.pat_mediciones_json === "string") { try { return JSON.parse(p.pat_mediciones_json) || []; } catch (e) { return []; } }
    return [];
  }
  function cuprosFromParte(p) {
    if (!p) return [];
    if (p.avances && p.avances.pc && Array.isArray(p.avances.pc.cupros)) return p.avances.pc.cupros;
    if (Array.isArray(p.pc_cupros_json)) return p.pc_cupros_json;
    if (typeof p.pc_cupros_json === "string") { try { return JSON.parse(p.pc_cupros_json) || []; } catch (e) { return []; } }
    return [];
  }
  function tareasFromKey(p, key, sub) {
    sub = sub || "tareas";
    if (!p) return [];
    if (p.avances && p.avances[key] && Array.isArray(p.avances[key][sub])) return p.avances[key][sub];
    const flat = p[key + "_" + sub + "_json"] || p[key + "_tareas_json"] || p[key + "_instrumentos_json"];
    if (Array.isArray(flat)) return flat;
    if (typeof flat === "string") { try { return JSON.parse(flat) || []; } catch (e) { return []; } }
    return [];
  }
  function parsePendientes(p) {
    if (!p) return [];
    if (p.handover && Array.isArray(p.handover.pendientes)) return p.handover.pendientes;
    if (Array.isArray(p.pendientes)) return p.pendientes;
    if (typeof p.pendientes === "string") { try { return JSON.parse(p.pendientes) || []; } catch (e) { return []; } }
    return [];
  }
  function parseNCs(p) {
    if (!p) return [];
    if (p.handover && Array.isArray(p.handover.noConformidades)) return p.handover.noConformidades;
    if (Array.isArray(p.noConformidades)) return p.noConformidades;
    if (typeof p.noConformidades === "string") { try { return JSON.parse(p.noConformidades) || []; } catch (e) { return []; } }
    return [];
  }
  function parsePendientesField(p, fieldName) {
    if (!p) return [];
    if (p.hse && Array.isArray(p.hse.charlas) && fieldName === "hseCharlas") return p.hse.charlas;
    if (Array.isArray(p[fieldName])) return p[fieldName];
    if (typeof p[fieldName] === "string") { try { return JSON.parse(p[fieldName]) || []; } catch (e) { return []; } }
    return [];
  }
  function empresasFromParte(p) {
    if (!p) return [];
    if (p.cierre && Array.isArray(p.cierre.empresas)) return p.cierre.empresas;
    if (Array.isArray(p.empresas)) return p.empresas;
    if (typeof p.empresas === "string") return p.empresas.split(",").map(s => s.trim()).filter(Boolean);
    return [];
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  global.GTL = global.GTL || {};
  global.GTL.Views = global.GTL.Views || {};
  global.GTL.Views.Dashboard = { render };
})(window);
