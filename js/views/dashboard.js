/* ============================================================
   GTL Inspector — Dashboard ejecutivo
   Reporte gerencial para YPF Upstream
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

  function render(view, query) {
    const cfg = Store.getConfig();
    const obras = cfg.obras || [];
    const obra = Store.getObraActiva();

    if (!obra) {
      view.innerHTML = `<div class="empty"><div class="ic">📊</div><p>Configurá una obra primero.</p></div>`;
      return;
    }

    const { dateFrom, dateTo } = defaultRange();

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

      <section class="dash-section">
        <div class="dash-section-head"><h3>Indicadores clave</h3><span class="dash-section-sub" id="kpiPeriod">—</span></div>
        <div class="kpi-grid kpi-grid-exec" id="kpis">
          ${[1,2,3,4,5,6,7,8].map(() => `<div class="kpi"><div class="sk sk-line" style="width:60%"></div><div class="sk sk-block"></div></div>`).join("")}
        </div>
      </section>

      <section class="dash-section">
        <div class="dash-section-head"><h3>Avance lineal de obra</h3><span class="dash-section-sub">PK actual sobre traza total</span></div>
        <div class="chart-card">
          <div class="pipeline" id="pipeline"></div>
        </div>
      </section>

      <section class="dash-section">
        <div class="dash-section-head"><h3>Evolución por especialidad</h3><span class="dash-section-sub">Avance acumulado en el período</span></div>
        <div class="chart-card chart-tall">
          <canvas id="chAvance"></canvas>
        </div>
      </section>

      <section class="dash-section dash-grid-2">
        <div class="chart-card">
          <div class="chart-head"><h4>Mediciones PAT — última campaña</h4><span class="chart-sub">Resistencia a tierra · límite YPF: 2Ω</span></div>
          <div class="chart-body"><canvas id="chPAT"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-head"><h4>Cumplimiento HSE</h4><span class="chart-sub">Días con / sin novedad</span></div>
          <div class="chart-body"><canvas id="chHSE"></canvas></div>
        </div>
      </section>

      <section class="dash-section dash-grid-2">
        <div class="chart-card">
          <div class="chart-head"><h4>Distribución de actividad</h4><span class="chart-sub">Volumen por especialidad</span></div>
          <div class="chart-body"><canvas id="chPie"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-head"><h4>Productividad diaria — Fibra Óptica</h4><span class="chart-sub">Metros tendidos por jornada</span></div>
          <div class="chart-body"><canvas id="chFOdaily"></canvas></div>
        </div>
      </section>

      <section class="dash-section">
        <div class="dash-section-head"><h3>Estado por locación · Mallas PAT</h3><span class="dash-section-sub">Última medición disponible</span></div>
        <div class="chart-card">
          <div id="patTable"></div>
        </div>
      </section>

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

  /* ---------- Carga ---------- */
  async function loadAll(view) {
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
    drawCharts(view, obra, partes);
    drawPATTable(view, obra, partes);
    drawPendientes(view, partes);
    drawNCs(view, partes);
    drawHistorico(view, partes);
  }

  /* ---------- Alertas automáticas ---------- */
  function drawAlerts(view, obra, partes) {
    const box = view.querySelector("#alerts");
    const alerts = [];
    const ult = partes[0];
    if (ult) {
      const pat = patMediciones(ult);
      const malas = pat.filter(m => parseFloat(m.ohm) > 2);
      if (malas.length) {
        alerts.push({ kind: "danger", msg: `🔴 PAT &gt; 2Ω en: ${malas.map(m => esc(m.locacion)).join(", ")}` });
      }
      const cupros = cuprosFromParte(ult);
      const fail = cupros.filter(c => (c.martillo + "").toUpperCase() === "FAIL");
      if (fail.length) {
        alerts.push({ kind: "danger", msg: `🔴 Test martillo FAIL en ${fail.length} cupro(s)` });
      }
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

  /* ---------- KPIs ---------- */
  function drawKPIs(view, obra, partes) {
    const total = Math.max(1, obra.pkFin - obra.pkInicio);
    let pkActual = obra.pkInicio;
    let totalTendidoFO = 0;
    let avancePAT = 0;
    let cuprosPC = 0;
    let pendUrgentes = 0;
    let ncPendientes = 0;
    let diasSinHSE = 0;
    let ultIncidente = null;
    let totalEmpalmes = 0;
    let totalInstrumentos = 0;

    partes.forEach(p => {
      const fo = (p.avances && p.avances.fo) || foFromFlat(p);
      if (fo) {
        if (fo.tendidoAcum) totalTendidoFO = Math.max(totalTendidoFO, parseFloat(fo.tendidoAcum));
        if (fo.pkFinDia) pkActual = Math.max(pkActual, parseFloat(fo.pkFinDia));
        if (fo.empalmes) totalEmpalmes += parseInt(fo.empalmes, 10) || 0;
      }
      const pat = patMediciones(p);
      if (pat.length) {
        const ok = pat.filter(m => parseFloat(m.ohm) > 0 && parseFloat(m.ohm) <= 2).length;
        avancePAT = Math.max(avancePAT, Math.round((ok / Math.max(1, pat.length)) * 100));
      }
      cuprosPC += cuprosFromParte(p).length;
      totalInstrumentos += tareasFromKey(p, "inst", "instrumentos").length;
      const pend = parsePendientes(p);
      pendUrgentes += pend.filter(x => /Cr[ií]tico|Alto/.test(x.criticidad || "")).length;
      ncPendientes += parseNCs(p).length;

      const sinNov = (p.hseSinNovedad === true || p.hseSinNovedad === "TRUE" || (p.hse && p.hse.sinNovedad));
      if (!sinNov && (!ultIncidente || p.fecha > ultIncidente)) ultIncidente = p.fecha;
    });

    if (ultIncidente) {
      const d = new Date(ultIncidente);
      diasSinHSE = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
    } else if (partes.length) {
      const minF = partes.map(p => p.fecha).sort((a,b) => a < b ? -1 : 1)[0];
      diasSinHSE = Math.floor((Date.now() - new Date(minF).getTime()) / (1000 * 60 * 60 * 24));
    }
    const avanceTotal = Math.min(100, Math.max(0, Math.round(((pkActual - obra.pkInicio) / total) * 100)));
    const tendKm = (totalTendidoFO / 1000).toFixed(2);

    view.querySelector("#kpis").innerHTML = `
      <div class="kpi accent">
        <div class="label">Avance general</div>
        <div class="value">${avanceTotal}<small>%</small></div>
        <div class="sub">PK ${UI.formatPK(pkActual)} de ${UI.formatPK(obra.pkFin)}</div>
        <div class="kpi-bar"><div class="kpi-bar-fill" style="width:${avanceTotal}%"></div></div>
      </div>
      <div class="kpi">
        <div class="label">Tendido FO</div>
        <div class="value">${tendKm}<small> km</small></div>
        <div class="sub">${Charts.fmt(totalTendidoFO, { decimals: 0 })} m acumulados</div>
      </div>
      <div class="kpi">
        <div class="label">PAT liberada</div>
        <div class="value" style="color:${avancePAT >= 80 ? "var(--ok)" : avancePAT >= 50 ? "var(--warn)" : "var(--danger)"}">${avancePAT}<small>%</small></div>
        <div class="sub">≤ 2Ω · norma YPF</div>
      </div>
      <div class="kpi">
        <div class="label">Empalmes FO</div>
        <div class="value">${totalEmpalmes}</div>
        <div class="sub">ejecutados en período</div>
      </div>
      <div class="kpi">
        <div class="label">Cupros PC</div>
        <div class="value">${cuprosPC}</div>
        <div class="sub">protección catódica</div>
      </div>
      <div class="kpi">
        <div class="label">Instrumentos</div>
        <div class="value">${totalInstrumentos}</div>
        <div class="sub">registrados</div>
      </div>
      <div class="kpi">
        <div class="label">Días sin HSE</div>
        <div class="value" style="color:${diasSinHSE >= 30 ? "var(--ok)" : "var(--text-strong)"}">${diasSinHSE}</div>
        <div class="sub">sin incidentes</div>
      </div>
      <div class="kpi">
        <div class="label">Pend. urgentes</div>
        <div class="value" style="color:${pendUrgentes ? "var(--danger)" : "var(--ok)"}">${pendUrgentes}</div>
        <div class="sub">${ncPendientes} no conformidades</div>
      </div>
    `;
  }

  /* ---------- Pipeline visual ---------- */
  function drawPipeline(view, obra, partes) {
    const box = view.querySelector("#pipeline");
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

  /* ---------- Charts ---------- */
  function drawCharts(view, obra, partes) {
    destroyCharts();
    const especialidades = obra.especialidades || [];
    const sorted = partes.slice().sort((a,b) => a.fecha < b.fecha ? -1 : 1);
    const labels = sorted.map(p => UI.formatDate(p.fecha).split("/").slice(0,2).join("/"));

    /* === 1. Avance acumulado por especialidad === */
    const datasets = especialidades.map(k => {
      const color = Charts.SPECIALTY_COLOR[k] || Charts.COLORS.blue;
      const data = sorted.map(p => {
        if (k === "fo") {
          const fo = (p.avances && p.avances.fo) || foFromFlat(p);
          return fo ? (parseFloat(fo.tendidoAcum) || 0) / 1000 : 0;
        }
        if (k === "pat") return patMediciones(p).filter(m => parseFloat(m.ohm) > 0 && parseFloat(m.ohm) <= 2).length;
        if (k === "pc")  return cuprosFromParte(p).length;
        if (k === "elec") return tareasFromKey(p, "elec").length;
        if (k === "inst") return tareasFromKey(p, "inst", "instrumentos").length;
        if (k === "civ")  return tareasFromKey(p, "civ").length;
        if (k === "mec")  return tareasFromKey(p, "mec").length;
        return 0;
      });
      const meta = Store.ESPECIALIDADES.find(e => e.key === k);
      return {
        label: (meta ? meta.label : k),
        data,
        borderColor: color,
        backgroundColor: color + "25"
      };
    }).filter(d => d.data.some(v => v > 0));

    if (labels.length && datasets.length) {
      currentChartInstances.push(Charts.lineChart(view.querySelector("#chAvance"), labels, datasets, {
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const isFO = /Fibra/i.test(ctx.dataset.label);
                return ctx.dataset.label + ": " + Charts.fmt(ctx.parsed.y, isFO ? { unit: "km", decimals: 2 } : { decimals: 0 });
              }
            }
          }
        }
      }));
    } else {
      const c = view.querySelector("#chAvance");
      if (c && c.parentElement) c.parentElement.innerHTML = `<div class="empty"><p>Sin datos para graficar.</p></div>`;
    }

    /* === 2. PAT última campaña === */
    const ultPAT = patMediciones(sorted[sorted.length - 1] || {});
    if (ultPAT.length) {
      const labels2 = ultPAT.map(m => m.locacion);
      const data = ultPAT.map(m => parseFloat(m.ohm) || 0);
      const colors = data.map(v => v > 2 ? Charts.COLORS.danger : v > 1.5 ? Charts.COLORS.warn : Charts.COLORS.ok);
      const chart = new Chart(view.querySelector("#chPAT"), {
        type: "bar",
        data: { labels: labels2, datasets: [{ label: "Resistencia (Ω)", data, backgroundColor: colors, borderRadius: 6 }] },
        options: deepMergeLocal({
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "rgba(15,23,42,0.96)", padding: 10, cornerRadius: 8,
              callbacks: { label: (ctx) => Charts.fmt(ctx.parsed.y, { unit: "Ω", decimals: 2 }) }
            }
          },
          scales: {
            x: { ticks: { maxRotation: 35, minRotation: 0, autoSkip: false, font: { family: "Barlow" } }, grid: { display: false } },
            y: { beginAtZero: true, title: { display: true, text: "Ω · límite YPF: 2Ω" }, grid: { color: "rgba(0,0,0,0.06)" } }
          }
        }, {}),
        plugins: [Charts.thresholdPlugin(2, "Límite 2Ω", Charts.COLORS.danger), Charts.thresholdPlugin(1.5, "Alerta 1.5Ω", Charts.COLORS.warn)]
      });
      currentChartInstances.push(chart);
    } else {
      empty(view.querySelector("#chPAT"), "Sin mediciones PAT en el período");
    }

    /* === 3. HSE: días con / sin novedad === */
    const hseOk = sorted.filter(p => p.hseSinNovedad === true || p.hseSinNovedad === "TRUE" || (p.hse && p.hse.sinNovedad)).length;
    const hseBad = sorted.length - hseOk;
    if (sorted.length) {
      currentChartInstances.push(Charts.pieChart(
        view.querySelector("#chHSE"),
        ["Sin novedad", "Con novedad"],
        [hseOk, hseBad],
        [Charts.COLORS.ok, Charts.COLORS.danger]
      ));
    } else {
      empty(view.querySelector("#chHSE"), "Sin partes en el período");
    }

    /* === 4. Pie: distribución por especialidad === */
    const counts = {};
    especialidades.forEach(k => { counts[k] = 0; });
    sorted.forEach(p => {
      especialidades.forEach(k => {
        if (k === "fo") {
          const fo = (p.avances && p.avances.fo) || foFromFlat(p);
          if (fo && (parseFloat(fo.tendidoHoy) > 0 || parseFloat(fo.empalmes) > 0)) counts.fo += 1;
        }
        if (k === "pat")  counts.pat  += patMediciones(p).length;
        if (k === "pc")   counts.pc   += cuprosFromParte(p).length;
        if (k === "elec") counts.elec += tareasFromKey(p, "elec").length;
        if (k === "inst") counts.inst += tareasFromKey(p, "inst", "instrumentos").length;
        if (k === "civ")  counts.civ  += tareasFromKey(p, "civ").length;
        if (k === "mec")  counts.mec  += tareasFromKey(p, "mec").length;
      });
    });
    const ks = Object.keys(counts).filter(k => counts[k] > 0);
    if (ks.length) {
      const labels3 = ks.map(k => (Store.ESPECIALIDADES.find(e => e.key === k) || {}).label || k);
      const colors  = ks.map(k => Charts.SPECIALTY_COLOR[k] || Charts.COLORS.blue);
      currentChartInstances.push(Charts.pieChart(view.querySelector("#chPie"), labels3, ks.map(k => counts[k]), colors));
    } else {
      empty(view.querySelector("#chPie"), "Sin actividad registrada");
    }

    /* === 5. Productividad diaria FO === */
    const foDaily = sorted.map(p => {
      const fo = (p.avances && p.avances.fo) || foFromFlat(p);
      return fo ? parseFloat(fo.tendidoHoy) || 0 : 0;
    });
    if (foDaily.some(v => v > 0)) {
      currentChartInstances.push(Charts.barChart(view.querySelector("#chFOdaily"), labels, [{
        label: "Tendido (m)",
        data: foDaily,
        backgroundColor: Charts.COLORS.blueMid,
        borderRadius: 4
      }], {
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => Charts.fmt(ctx.parsed.y, { unit: "m", decimals: 0 }) } }
        },
        scales: { y: { title: { display: true, text: "Metros / día" } } }
      }));
    } else {
      empty(view.querySelector("#chFOdaily"), "Sin tendido FO registrado");
    }
  }

  function empty(canvas, msg) {
    if (!canvas || !canvas.parentElement) return;
    canvas.parentElement.innerHTML = `<div class="empty"><p>${esc(msg)}</p></div>`;
  }
  function deepMergeLocal(a, b) {
    return Object.assign({}, a, b);
  }

  /* ---------- PAT table ---------- */
  function drawPATTable(view, obra, partes) {
    const box = view.querySelector("#patTable");
    const last = partes.find(p => patMediciones(p).length > 0);
    const meds = last ? patMediciones(last) : [];
    if (!meds.length) {
      box.innerHTML = `<div class="empty"><p>Sin mediciones de PAT en el período.</p></div>`;
      return;
    }
    const fechaPat = last ? UI.formatDate(last.fecha) : "—";
    box.innerHTML = `
      <div class="dash-table-meta"><b>Última medición:</b> ${fechaPat}</div>
      <table class="tbl">
        <thead><tr><th>Locación</th><th>Resistencia (Ω)</th><th>Estado</th><th>Observaciones</th></tr></thead>
        <tbody>
          ${meds.map(m => {
            const v = parseFloat(m.ohm);
            const cls = isNaN(v) ? "" : v > 2 ? "danger" : v > 1.5 ? "warn" : "ok";
            return `<tr>
              <td><b>${esc(m.locacion)}</b></td>
              <td><span class="pat-cell ${cls}">${isNaN(v) ? "—" : v.toFixed(2) + " Ω"}</span></td>
              <td>${esc(m.estado || "—")}</td>
              <td class="text-muted">${esc(m.obs || "—")}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>`;
  }

  function drawPendientes(view, partes) {
    const box = view.querySelector("#pendientesBox");
    const all = [];
    partes.forEach(p => parsePendientes(p).forEach(x => {
      if (/Cr[ií]tico|Alto/.test(x.criticidad || "")) all.push({ ...x, fecha: p.fecha });
    }));
    if (!all.length) {
      box.innerHTML = `<div class="empty"><p>✓ Sin pendientes urgentes.</p></div>`;
      return;
    }
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
    const all = [];
    partes.forEach(p => parseNCs(p).forEach(x => all.push({ ...x, fecha: p.fecha })));
    if (!all.length) {
      box.innerHTML = `<div class="empty"><p>✓ Sin no conformidades.</p></div>`;
      return;
    }
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

  function drawHistorico(view, partes) {
    const box = view.querySelector("#histBox");
    const counter = view.querySelector("#histCount");
    if (counter) counter.textContent = partes.length + " parte" + (partes.length === 1 ? "" : "s");
    if (!partes.length) {
      box.innerHTML = `<div class="empty"><p>Sin partes en el período.</p></div>`;
      return;
    }
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

  /* ---------- Helpers de parseo ---------- */
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
    if (typeof p.pat_mediciones_json === "string") {
      try { return JSON.parse(p.pat_mediciones_json) || []; } catch (e) { return []; }
    }
    return [];
  }
  function cuprosFromParte(p) {
    if (!p) return [];
    if (p.avances && p.avances.pc && Array.isArray(p.avances.pc.cupros)) return p.avances.pc.cupros;
    if (Array.isArray(p.pc_cupros_json)) return p.pc_cupros_json;
    if (typeof p.pc_cupros_json === "string") {
      try { return JSON.parse(p.pc_cupros_json) || []; } catch (e) { return []; }
    }
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
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  global.GTL = global.GTL || {};
  global.GTL.Views = global.GTL.Views || {};
  global.GTL.Views.Dashboard = { render };
})(window);
