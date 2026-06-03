/* ============================================================
   GTL Inspector — Bootstrap + Router + UI helpers
   ============================================================ */
(function (global) {
  "use strict";

  const Store = global.GTL.Store;
  const Sync  = global.GTL.Sync;

  /* ---------- Toasts ---------- */
  function toast(msg, kind, ms) {
    const stack = document.getElementById("toastStack");
    if (!stack) return;
    const el = document.createElement("div");
    el.className = "toast " + (kind || "");
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = "translateY(10px)";
      el.style.transition = "all 220ms";
      setTimeout(() => el.remove(), 240);
    }, ms || 2600);
  }

  /* ---------- Modal ---------- */
  function modal({ title, content, actions, onClose }) {
    const root = document.getElementById("modalRoot");
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    const m = document.createElement("div");
    m.className = "modal";
    m.innerHTML = `<h3>${title || ""}</h3><div class="modal-body"></div>`;
    const body = m.querySelector(".modal-body");
    if (typeof content === "string") body.innerHTML = content;
    else if (content instanceof HTMLElement) body.appendChild(content);

    const bar = document.createElement("div");
    bar.className = "row mt-4";
    bar.style.justifyContent = "flex-end";
    (actions || [{ label: "Cerrar", kind: "ghost" }]).forEach(a => {
      const b = document.createElement("button");
      b.className = "btn " + (a.kind === "primary" ? "btn-primary" : a.kind === "danger" ? "btn-danger" : "btn-ghost");
      b.textContent = a.label;
      b.addEventListener("click", () => {
        if (a.onClick) a.onClick(close);
        else close();
      });
      bar.appendChild(b);
    });
    m.appendChild(bar);
    overlay.appendChild(m);
    root.appendChild(overlay);

    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

    function close() {
      overlay.remove();
      if (onClose) onClose();
    }
    return { close };
  }

  function confirm(message, title) {
    return new Promise((resolve) => {
      modal({
        title: title || "Confirmar",
        content: `<p>${message}</p>`,
        actions: [
          { label: "Cancelar", kind: "ghost", onClick: (c) => { c(); resolve(false); } },
          { label: "Aceptar",  kind: "primary", onClick: (c) => { c(); resolve(true); } }
        ]
      });
    });
  }

  /* ---------- Router ---------- */
  const routes = {};
  function route(path, fn) { routes[path] = fn; }

  function navigate(path) {
    if (!path.startsWith("#")) location.hash = "#" + path;
    else location.hash = path;
  }

  function currentRoute() {
    const h = location.hash || "#/home";
    const path = h.replace(/^#/, "");
    const [pathname, query] = path.split("?");
    const params = {};
    if (query) query.split("&").forEach(kv => {
      const [k, v] = kv.split("=");
      if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || "");
    });
    return { pathname, params };
  }

  function render() {
    const { pathname, params } = currentRoute();
    const view = document.getElementById("view");
    if (!view) return;
    // Limpiar timers de la vista anterior (ej: auto-save del form)
    if (view._autoSaveTimer) { clearInterval(view._autoSaveTimer); view._autoSaveTimer = null; }
    view.innerHTML = "";
    window.scrollTo(0, 0);

    const cfg = Store.getConfig();

    if (!cfg.onboarded) {
      // Forzar onboarding hasta que esté listo
      global.GTL.Views.Setup.render(view);
      setActiveTab(null);
      return;
    }

    let renderer = routes[pathname];
    if (!renderer) {
      renderer = routes["/home"];
      navigate("/home");
    }
    try {
      renderer(view, params);
    } catch (e) {
      console.error(e);
      view.innerHTML = `<div class="banner danger">Error al renderizar: ${e.message}</div>`;
    }
    setActiveTab(pathname);
    updateTopbar();
  }

  function setActiveTab(path) {
    document.querySelectorAll(".bottomnav .tab").forEach(t => {
      const target = t.dataset.route;
      let active = false;
      if (path === target) active = true;
      if (path === "/history" || path === "/settings" || path === "/parte") active = (target === "/more");
      t.classList.toggle("active", active);
    });
  }

  function updateTopbar() {
    const obra = Store.getObraActiva();
    const el = document.getElementById("topbarObra");
    if (el) el.textContent = obra ? obra.nombre : "Sin obra activa";
    refreshConnUI();
  }

  function refreshConnUI() {
    const el = document.getElementById("connStatus");
    if (!el) return;
    const lbl = el.querySelector(".lbl");
    el.classList.remove("offline", "error");
    if (!Sync.isOnline()) {
      el.classList.add("offline");
      lbl.textContent = "Offline";
    } else {
      lbl.textContent = "Online";
    }
    // Pendientes
    Store.listPending().then(p => {
      if (p.length > 0 && Sync.isOnline()) {
        lbl.textContent = `${p.length} pend.`;
        el.classList.add("offline");
      } else if (p.length > 0) {
        lbl.textContent = `Offline · ${p.length}`;
      }
    }).catch(() => {});
  }

  /* ---------- Home ---------- */
  function renderHome(view) {
    const obra = Store.getObraActiva();
    const cfg = Store.getConfig();

    if (!obra) {
      view.innerHTML = `
        <div class="empty">
          <div class="ic">🏗</div>
          <h3>No hay obras configuradas</h3>
          <p>Cargá tu primera obra para arrancar a usar la app.</p>
          <button class="btn btn-primary" id="goSetup">Configurar obra</button>
        </div>`;
      view.querySelector("#goSetup").onclick = () => navigate("/setup-obra");
      return;
    }

    const total = Math.max(1, obra.pkFin - obra.pkInicio);
    const especialidades = (obra.especialidades || []).map(k => Store.ESPECIALIDADES.find(e => e.key === k)).filter(Boolean);

    view.innerHTML = `
      <div id="homeObraTabs"></div>
      <section class="home-hero">
        <span class="obra-tag">Obra activa</span>
        <h2>${esc(obra.nombre)}</h2>
        <div class="text-muted" style="color: rgba(255,255,255,0.85);">${esc(obra.contratista || "")} · ${esc(obra.cliente || "YPF")} · N° ${esc(obra.numero || "—")}</div>
        <div class="meta">
          <div><span class="text-muted" style="color:rgba(255,255,255,0.7);">PK Inicio</span><b>${formatPK(obra.pkInicio)}</b></div>
          <div><span class="text-muted" style="color:rgba(255,255,255,0.7);">PK Fin</span><b>${formatPK(obra.pkFin)}</b></div>
          <div><span class="text-muted" style="color:rgba(255,255,255,0.7);">Total</span><b>${(total/1000).toFixed(2)} km</b></div>
          <div><span class="text-muted" style="color:rgba(255,255,255,0.7);">Locaciones</span><b>${(obra.locaciones||[]).length}</b></div>
        </div>
        <div class="home-cta">
          <button class="btn btn-accent btn-lg btn-block" id="ctaCargar">＋ Cargar parte de hoy</button>
        </div>
      </section>

      <div class="row-wrap mb-3">
        ${especialidades.map(e => `<span class="chip info">${e.icon} ${e.label}</span>`).join("")}
      </div>

      <div class="home-quick">
        <button class="qcard" data-route="/dashboard">
          <span class="ic">📊</span>
          <span class="lbl">Dashboard</span>
          <span class="val">KPIs</span>
        </button>
        <button class="qcard" data-route="/history">
          <span class="ic">📂</span>
          <span class="lbl">Histórico</span>
          <span class="val" id="hisCount">—</span>
        </button>
        <button class="qcard" data-route="/more">
          <span class="ic">⚙</span>
          <span class="lbl">Configuración</span>
          <span class="val">${esc(cfg.inspector.nombre.split(" ")[0] || "—")}</span>
        </button>
        <button class="qcard" id="qcSync">
          <span class="ic">🔄</span>
          <span class="lbl">Sincronizar</span>
          <span class="val" id="pendCount">0</span>
        </button>
      </div>

      <div class="card" id="alertsHome"></div>
    `;

    renderObraTabs(view.querySelector("#homeObraTabs"), {
      activeId: obra.id,
      onSwitch: () => renderHome(view)
    });

    view.querySelector("#ctaCargar").onclick = () => navigate("/form");
    view.querySelectorAll(".qcard[data-route]").forEach(b => b.onclick = () => navigate(b.dataset.route));
    view.querySelector("#qcSync").onclick = () => Sync.drainQueue().then(r => {
      if (r.skipped) toast("Sin conexión, se reintentará", "warn");
      else toast(`Sincronizados: ${r.sent} · Errores: ${r.failed}`, r.failed ? "warn" : "ok");
      refreshConnUI();
    });

    // Pendientes count
    Store.listPending().then(p => {
      const el = view.querySelector("#pendCount");
      if (el) el.textContent = p.length;
    });
    // Histórico count
    Store.listPartesLocal(obra.id).then(p => {
      const el = view.querySelector("#hisCount");
      if (el) el.textContent = p.length;
    });

    // Alertas locales (parte de hoy)
    const today = todayIso();
    Store.listPartesLocal(obra.id).then(partes => {
      const hoy = partes.find(p => p.fecha === today);
      const al = view.querySelector("#alertsHome");
      if (!al) return;
      if (!hoy) {
        al.innerHTML = `<div class="banner warn">⚠ Aún no cargaste el parte de hoy (${formatDate(today)}).</div>`;
      } else {
        al.innerHTML = `<div class="banner ok">✓ Parte de hoy cargado correctamente · ${esc(hoy.turno || "")} · ${esc(hoy.condiciones && hoy.condiciones.clima || hoy.clima || "")}</div>`;
      }
    });
  }

  /* ---------- Más / menú ---------- */
  function renderMore(view) {
    view.innerHTML = `
      <h2>Más</h2>
      <div class="settings-list">
        <button class="item" data-route="/history">
          <span class="ic">📂</span>
          <span class="text"><b>Histórico de partes</b><small>Ver y editar partes anteriores</small></span>
          <span>›</span>
        </button>
        <button class="item" data-route="/settings">
          <span class="ic">⚙</span>
          <span class="text"><b>Configuración</b><small>Inspector, obras, conexión, backups</small></span>
          <span>›</span>
        </button>
        <button class="item" id="forceSync">
          <span class="ic">🔄</span>
          <span class="text"><b>Sincronizar ahora</b><small>Forzar envío de partes pendientes</small></span>
          <span>›</span>
        </button>
        <button class="item" id="aboutBtn">
          <span class="ic">ℹ</span>
          <span class="text"><b>Acerca de</b><small>Versión, créditos</small></span>
          <span>›</span>
        </button>
      </div>
    `;
    view.querySelectorAll(".item[data-route]").forEach(b => b.onclick = () => navigate(b.dataset.route));
    view.querySelector("#forceSync").onclick = () => Sync.drainQueue().then(r => {
      if (r.skipped) toast("Sin conexión", "warn");
      else toast(`✓ ${r.sent} enviados, ${r.failed} con error`, r.failed ? "warn" : "ok");
    });
    view.querySelector("#aboutBtn").onclick = () => modal({
      title: "GTL Inspector",
      content: `<p><b>Versión:</b> 1.0.0</p>
                <p><b>Empresa:</b> GRUPO TERGO LAF (GTL)</p>
                <p><b>Cliente:</b> YPF Upstream Neuquén</p>
                <p class="text-muted">Sistema de inspección de Electricidad, Instrumentación y Control para obras en Vaca Muerta.</p>`,
      actions: [{ label: "Cerrar", kind: "primary" }]
    });
  }

  /* ---------- Helpers globales ---------- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function formatPK(meters) {
    if (meters == null || isNaN(meters)) return "—";
    const m = Number(meters);
    const km = Math.floor(m / 1000);
    const rest = m % 1000;
    return `${km}+${String(rest).padStart(3, "0")}`;
  }
  function formatDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
    return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }
  function formatDateTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
      + " " + d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  }
  function todayIso() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function vibrate(pattern) {
    if (navigator.vibrate) try { navigator.vibrate(pattern); } catch (e) {}
  }

  /* ---------- Tabs de obras (cambio rápido) ---------- */
  function renderObraTabs(container, opts) {
    if (!container) return;
    opts = opts || {};
    const cfg = Store.getConfig();
    const obras = cfg.obras || [];
    const activeId = opts.activeId || cfg.obraActivaId;
    if (obras.length <= 1 && !opts.alwaysShow) {
      container.innerHTML = "";
      return;
    }
    container.innerHTML = `
      <div class="obra-tabs ${opts.variant || ""}" role="tablist">
        ${obras.map(o => `
          <button class="obra-tab ${o.id === activeId ? "active" : ""}" data-id="${esc(o.id)}" role="tab" aria-selected="${o.id === activeId}">
            <span class="obra-tab-name">${esc(o.nombre)}</span>
            ${o.numero ? `<span class="obra-tab-num">${esc(o.numero)}</span>` : ""}
          </button>
        `).join("")}
        <button class="obra-tab obra-tab-add" id="obraTabAdd" title="Agregar obra">＋</button>
      </div>
    `;
    container.querySelectorAll(".obra-tab[data-id]").forEach(t => {
      t.onclick = () => {
        const id = t.dataset.id;
        if (id === activeId) return;
        Store.setObraActiva(id);
        if (opts.onSwitch) opts.onSwitch(id);
      };
    });
    const addBtn = container.querySelector("#obraTabAdd");
    if (addBtn) addBtn.onclick = () => navigate("/setup-obra");
  }

  /* =========================================================
     OB-377 — Oleoducto 24" Loop Etapa 2.1 (config oficial)
     ========================================================= */
  const OB377 = {
    proyecto: 'OBRA OLEODUCTO 24" - LOOP ETAPA 2.1',
    contratista: 'MILICIC S.A.',
    cliente: 'YPF Midstream',
    inspectora: 'GRUPO TERGO LAF',
    totalMetros: 45133,
    ductoInicio: 42500,
    ductoFin: 87633,
    etapa1: { inicio: 42500, fin: 60700, total: 18200, label: 'TRAMO 1 (PK 42+500 → 60+700)' },
    etapa2: { inicio: 60700, fin: 87633, total: 26933, label: 'TRAMO 2 (PK 60+700 → 87+633)' },
    totalInstrumentos: 64,
    totalCupros: 53,
    patLimite: 2.0,
    locaciones: [
      { id: 'SCRL-604', pk: '42+500', pkMetros: 42500, tipo: 'Trampa Lanzadora' },
      { id: 'LB-640',   pk: '55+000', pkMetros: 55000, tipo: 'Estación de Válvula' },
      { id: 'LB-641',   pk: '66+300', pkMetros: 66300, tipo: 'Estación de Válvula' },
      { id: 'LB-642',   pk: '70+500', pkMetros: 70500, tipo: 'Estación de Válvula' },
      { id: 'SCRR-605', pk: '87+633', pkMetros: 87633, tipo: 'Trampa Receptora' }
    ],
    camaras: [
      { id: 'Cámara H° FO.01', pk: 'PK 46+050' },
      { id: 'Cámara H° FO.02', pk: 'PK 58+450' },
      { id: 'Cámara H° FO.03', pk: 'PK 54+500' },
      { id: 'Cámara H° FO.04', pk: 'PK 49+800' },
      { id: 'Cámara Madera',   pk: 'PK 50+830' },
      { id: 'Cámara Madera',   pk: 'PK 60+450' }
    ]
  };

  /** Convierte "PK 42+500" / "42+500" / 42500 → 42500 (metros absolutos). */
  function parsePK(s) {
    if (s == null) return null;
    if (typeof s === 'number') return s;
    const m = String(s).replace(/PK/i, '').trim().match(/(\d+)\s*\+\s*(\d+)/);
    if (m) return parseInt(m[1], 10) * 1000 + parseInt(m[2], 10);
    const n = parseInt(String(s).replace(/\D/g, ''), 10);
    return isNaN(n) ? null : n;
  }

  /** Formatea metros → "PK 42+500" */
  function fmtPK(metros) {
    if (metros == null || isNaN(metros)) return '—';
    const km = Math.floor(metros / 1000);
    const m  = Math.floor(metros % 1000);
    return `PK ${km}+${String(m).padStart(3, '0')}`;
  }

  /* =========================================================
     PDF EJECUTIVO — Formato Hugo Farias (2 páginas + fotos)
     ========================================================= */
  function printParteEjecutivo(p) {
    if (!p) return;
    const fd = formatDate(p.fecha);
    const tryJson = (v, def) => {
      if (Array.isArray(v)) return v;
      if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return def; } }
      return v != null ? v : def;
    };

    // ----- Normalizar datos -----
    const cond = p.condiciones || { clima: p.clima, alertaYpf: p.alertaYpf, temperatura: p.temperatura, visibilidad: p.visibilidad };
    const hse  = p.hse || { sinNovedad: p.hseSinNovedad !== false, detalle: p.hseDetalle, criticidad: p.hseCriticidad };
    const fo   = (p.avances && p.avances.fo)   || {};
    const pat  = (p.avances && p.avances.pat)  || {};
    const pcA  = (p.avances && p.avances.pc)   || {};
    const elec = (p.avances && p.avances.elec) || {};
    const inst = (p.avances && p.avances.inst) || {};
    const ho   = p.handover || { pendientes: tryJson(p.pendientes, []), noConformidades: tryJson(p.noConformidades, []) };
    const ci   = p.cierre || {};
    const tramos = Array.isArray(fo.tramos) ? fo.tramos : tryJson(p.fo_tramos_json, []);

    // ----- Cálculos: avances acumulados -----
    const acum = {
      pretapada:    +(fo.preTapadaAcum   || 0),
      tendido:      +(fo.tendidoAcum     || 0),
      nivelacion:   +(fo.nivelacionAcum  || 0),
      mediaTapada:  +(fo.mediaTapadaAcum || 0),
      tapadaFinal:  +(fo.tapadaFinalAcum || 0),
      mallaAdv:     +(fo.mallaAdvAcum    || fo.mediaTapadaAcum || 0)
    };
    const pct = (v, total) => total > 0 ? Math.min(100, Math.round((v / total) * 100)) : 0;
    const foAvanceGeneral = pct(acum.pretapada, OB377.totalMetros);

    // PAT: contar liberadas / con datos — match flexible por locación
    const patArr = Array.isArray(pat.mediciones) ? pat.mediciones : (Array.isArray(p.pat) ? p.pat : []);
    const matchPatLoc = (x, L) => {
      if (!x) return false;
      const loc = (x.locacion || x.id || '').toUpperCase();
      if (loc === L.id.toUpperCase()) return true;
      // Buscar por número: "604" en "SCRL-604"
      const num = L.id.replace(/[^\d]/g, '');
      if (num && loc.includes(num)) return true;
      // Buscar con variantes comunes (SCRC vs SCRR, etc.)
      if (L.id.startsWith('SCRR') && loc.includes('SCRC')) return loc.includes(num);
      if (L.id.startsWith('SCRL') && loc.includes('SCRL')) return true;
      return false;
    };
    const patPorLoc = OB377.locaciones.map(L => {
      const m = patArr.find(x => matchPatLoc(x, L));
      const r = m && m.ohm != null && m.ohm !== '' ? parseFloat(m.ohm) : (m && m.resistencia != null ? parseFloat(m.resistencia) : null);
      const estado = m && m.estado ? m.estado : 'No iniciada';
      const obs = (m && m.obs) || '';
      const liberada = estado === 'Liberada';
      const fueraNorma = r != null && !isNaN(r) && r > OB377.patLimite;
      const pctLoc = r == null || isNaN(r) ? 0 : (estado === 'Liberada' ? 100 : (r <= OB377.patLimite ? 50 : 10));
      return { ...L, resistencia: (r != null && !isNaN(r)) ? r : null, estado, obs, liberada, fueraNorma, pctLoc };
    });
    const patPctTotal = Math.round(patPorLoc.reduce((s, x) => s + x.pctLoc, 0) / OB377.locaciones.length);
    const patLiberadas = patPorLoc.filter(x => x.estado === 'Liberada').length;

    // Canalizaciones E&I por locación (a partir de elec.tareas / canalizaciones)
    const elecTareas = Array.isArray(elec.tareas) ? elec.tareas : [];
    // Match flexible: busca el ID de locación en locacion, desc o tarea del parte
    const matchLoc = (t, L) => {
      if (!t) return false;
      const txt = ((t.locacion || '') + ' ' + (t.desc || '') + ' ' + (t.tarea || '')).toUpperCase();
      // Matchea "SCRL-604", "SCRL604", "604", etc.
      if (txt.includes(L.id.toUpperCase())) return true;
      // Matchea por número corto: "604", "640", etc.
      const num = L.id.replace(/[^\d]/g, '');
      if (num && txt.includes(num)) return true;
      return false;
    };
    const canalPorLoc = OB377.locaciones.map(L => {
      const tareasLoc = elecTareas.filter(t => matchLoc(t, L));
      const av = tareasLoc.length ? Math.round(tareasLoc.reduce((s, t) => s + (parseInt(t.avance, 10) || 0), 0) / tareasLoc.length) : 0;
      const desc = tareasLoc.map(t => t.desc || t.tarea || '').filter(Boolean).join(' · ') || 'Sin tareas registradas';
      return { ...L, avance: av, desc };
    });
    // Si ninguna tarea matcheó locaciones, usamos promedio directo de las tareas
    const anyMatch = canalPorLoc.some(x => x.avance > 0);
    const canalAvanceGeneral = anyMatch
      ? Math.round(canalPorLoc.reduce((s, x) => s + x.avance, 0) / OB377.locaciones.length)
      : (elecTareas.length ? Math.round(elecTareas.reduce((s, t) => s + (parseInt(t.avance, 10) || 0), 0) / elecTareas.length) : 0);

    // Protección Catódica
    const cupros = Array.isArray(pcA.cupros) ? pcA.cupros : [];
    const cuprosOK = cupros.filter(c => c.martillo === 'PASS' || /PASS/i.test(c.martillo || '')).length;
    const pcPct = pct(cuprosOK, OB377.totalCupros);

    // Instrumentación
    const instArr = Array.isArray(inst.instrumentos) ? inst.instrumentos : [];
    const instLiberados = instArr.filter(x => /Liberad|Precom/i.test(x.estado || '')).length;
    const instMontados = instArr.filter(x => /Montad|Conex|Liberad|Precom/i.test(x.estado || '')).length;

    // FO por etapa (a partir de tramos cargados o aproximación por PK del frente)
    // pkFinDia puede ser número directo (metros) o string "PK 71+000"
    const pkFinVal = typeof fo.pkFinDia === 'number' ? fo.pkFinDia : (parsePK(fo.pkFinDia) || 0);
    const frenteActual = Math.max(
      OB377.ductoInicio,
      ...tramos.map(t => parsePK(t.pkHasta || t.pkFin || t.camHasta) || 0),
      pkFinVal,
      // Si hay acumulado de pre-tapada, estimar frente como inicio + acumulado
      acum.pretapada > 0 ? OB377.ductoInicio + acum.pretapada : 0
    );
    const calcEtapa = (e) => {
      const enRango = (m) => Math.max(0, Math.min(m, e.fin) - Math.max(0, e.inicio));
      // Aproximación: distribuir acumulados proporcionalmente al avance del frente en cada etapa
      const frenteEnEtapa = Math.max(0, Math.min(frenteActual, e.fin) - e.inicio);
      const fracEtapa = Math.min(1, frenteEnEtapa / e.total);
      return {
        pretapada:   Math.min(e.total, Math.round(acum.pretapada   * (fracEtapa > 0 ? (frenteEnEtapa / Math.max(1, frenteActual - OB377.ductoInicio)) : 0))),
        tendido:     Math.min(e.total, Math.round(acum.tendido     * (fracEtapa > 0 ? (frenteEnEtapa / Math.max(1, frenteActual - OB377.ductoInicio)) : 0))),
        mediaTapada: Math.min(e.total, Math.round(acum.mediaTapada * (fracEtapa > 0 ? (frenteEnEtapa / Math.max(1, frenteActual - OB377.ductoInicio)) : 0))),
        tapadaFinal: Math.min(e.total, Math.round(acum.tapadaFinal * (fracEtapa > 0 ? (frenteEnEtapa / Math.max(1, frenteActual - OB377.ductoInicio)) : 0))),
        total: e.total
      };
    };
    const e1 = calcEtapa(OB377.etapa1);
    const e2 = calcEtapa(OB377.etapa2);
    const tramo1Pct = pct(e1.pretapada + e1.tendido + e1.tapadaFinal, e1.total * 3);
    const tramo2Pct = pct(e2.pretapada + e2.tendido + e2.tapadaFinal, e2.total * 3);

    // ----- Helpers de UI -----
    const tareasTexto = (arr, prop) => {
      if (!arr || !arr.length) return 'Sin tareas en el día de hoy';
      return arr.map(x => {
        const txt = (typeof x === 'string') ? x : (x[prop] || x.desc || x.tarea || x.descripcion || '');
        return esc(txt);
      }).filter(Boolean).join(' · ') || 'Sin tareas en el día de hoy';
    };
    const bar = (p, color) => `<div class="bar"><div class="bar-fill" style="width:${p}%;background:${color || '#003087'};"><span>${p}%</span></div></div>`;
    const barLoc = (loc) => `<div class="locbar"><div class="locbar-label">${esc(loc.id)}</div>${bar(loc.avance, loc.avance >= 80 ? '#00884A' : loc.avance >= 30 ? '#D97706' : '#CC1F1F')}</div>`;
    const patEstadoBadge = (loc) => {
      if (loc.estado === 'Liberada') return `<span class="badge ok">Liberada</span>`;
      if (loc.fueraNorma) return `<span class="badge danger">${loc.resistencia}Ω &gt; 2Ω</span>`;
      if (loc.resistencia != null) return `<span class="badge warn">${loc.resistencia}Ω · ${esc(loc.estado)}</span>`;
      return `<span class="badge muted">${esc(loc.estado)}</span>`;
    };

    // ----- Tramos FO por etapa (texto para página 1) -----
    const tramosE1 = tramos.filter(t => (parsePK(t.pkDesde || t.pkInicio) || 0) < OB377.etapa2.inicio);
    const tramosE2 = tramos.filter(t => (parsePK(t.pkDesde || t.pkInicio) || 0) >= OB377.etapa2.inicio);
    const tramoLine = (t) => {
      const desde = fmtPK(parsePK(t.pkDesde || t.pkInicio));
      const hasta = fmtPK(parsePK(t.pkHasta || t.pkFin));
      const m = t.metros ? `${t.metros} mts` : '—';
      return `${desde} → ${hasta} · ${m}${t.actividad ? ' · ' + esc(t.actividad) : ''}`;
    };

    // ----- Cámaras inteligentes (las que cayeron dentro del frente) -----
    const camarasAlcanzadas = OB377.camaras.filter(c => (parsePK(c.pk) || 0) <= frenteActual);

    // ----- HTML -----
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0"/>
    <title>Parte Diario — ${esc(p.obraNombre || OB377.proyecto)} ${fd}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box;}
      body{font-family:'Barlow',Arial,Helvetica,sans-serif;font-size:11px;color:#0D1B3E;background:#fff;padding:8px;max-width:100vw;overflow-x:hidden;-webkit-text-size-adjust:100%;line-height:1.35;}
      .pagebreak{page-break-after:always;}
      .page{max-width:1000px;margin:0 auto 16px;}
      .topbar{background:#003087;color:#fff;padding:8px 12px;border-radius:4px 4px 0 0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;}
      .topbar h1{font-family:'Barlow Condensed','Barlow',sans-serif;font-size:14px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;}
      .topbar .fecha{background:#FFD100;color:#003087;padding:3px 10px;border-radius:3px;font-weight:700;font-size:12px;}
      .subbar{background:#F4F6FA;border:1px solid #d1d9e6;border-top:none;padding:6px 12px;font-size:10px;display:grid;grid-template-columns:1fr;gap:3px;}
      .subbar b{color:#003087;}
      .meta-row{display:grid;grid-template-columns:1fr;gap:6px;margin:8px 0;font-size:10px;}
      .meta-cell{border:1px solid #d1d9e6;border-radius:3px;padding:5px 8px;background:#fff;}
      .meta-cell b{display:block;color:#003087;font-size:9px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;}
      .section-title{background:#003087;color:#fff;padding:5px 10px;margin:10px 0 6px;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.5px;border-radius:3px;}
      .specialty-block{border:1px solid #d1d9e6;border-radius:4px;margin-bottom:8px;background:#fff;overflow:hidden;}
      .specialty-header{background:#F4F6FA;padding:5px 10px;border-bottom:1px solid #d1d9e6;display:flex;justify-content:space-between;align-items:center;}
      .specialty-header h3{font-family:'Barlow Condensed',sans-serif;font-size:12px;color:#003087;font-weight:700;text-transform:uppercase;letter-spacing:.3px;}
      .specialty-header .header-meta{font-size:9px;color:#475569;text-align:right;}
      .specialty-body{padding:6px 10px;font-size:10px;}
      .specialty-body .no-data{color:#94a3b8;font-style:italic;}
      .fo-grid{display:grid;grid-template-columns:1fr;gap:3px;font-size:10px;}
      .fo-row{display:flex;flex-wrap:wrap;gap:2px 8px;padding:4px 0;border-bottom:1px dotted #e5e7eb;align-items:baseline;}
      .fo-row b{color:#003087;font-size:9px;text-transform:uppercase;min-width:110px;flex-shrink:0;}
      .fo-row .fo-detail{flex:1;min-width:100px;font-size:10px;color:#475569;word-break:break-word;}
      .fo-row .acum{margin-left:auto;text-align:right;font-family:'JetBrains Mono',monospace;font-weight:600;color:#00884A;font-size:10px;white-space:nowrap;flex-shrink:0;}
      .fo-row .acum.zero{color:#94a3b8;}
      .footer-row{display:grid;grid-template-columns:1fr;gap:8px;margin-top:10px;}
      .dato-relevante{border:1px solid #d1d9e6;border-radius:4px;padding:8px;background:#FFFEF0;}
      .dato-relevante b{color:#003087;font-size:10px;display:block;margin-bottom:3px;text-transform:uppercase;}
      .firmas{display:grid;grid-template-columns:1fr;gap:4px;}
      .firma{border:1px solid #d1d9e6;border-radius:3px;padding:6px 8px;font-size:9px;background:#fff;display:flex;justify-content:space-between;align-items:center;}
      .firma b{color:#475569;text-transform:uppercase;font-size:8px;letter-spacing:.3px;}
      .firma .who{font-weight:600;color:#0D1B3E;}
      /* Page 2 — Estadísticas */
      .stats-grid{display:grid;grid-template-columns:1fr;gap:10px;}
      .stat-card{border:1px solid #d1d9e6;border-radius:4px;padding:8px;background:#fff;}
      .stat-card h4{font-family:'Barlow Condensed',sans-serif;color:#003087;font-size:12px;font-weight:700;text-transform:uppercase;margin-bottom:6px;border-bottom:2px solid #FFD100;padding-bottom:3px;letter-spacing:.3px;}
      .stat-card .stat-sub{font-size:9px;color:#475569;margin-bottom:6px;}
      .locbar{margin:5px 0;}
      .locbar-label{font-size:9px;font-weight:700;color:#003087;margin-bottom:2px;display:flex;justify-content:space-between;}
      .bar{background:#E5E7EB;height:16px;border-radius:8px;overflow:hidden;position:relative;}
      .bar-fill{height:100%;border-radius:8px;display:flex;align-items:center;justify-content:flex-end;padding-right:6px;transition:width .3s;min-width:32px;}
      .bar-fill span{color:#fff;font-size:9px;font-weight:700;font-family:'JetBrains Mono',monospace;}
      .summary-line{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dotted #e5e7eb;font-size:10px;}
      .summary-line:last-child{border-bottom:none;}
      .summary-line b{color:#003087;}
      .summary-line .val{font-family:'JetBrains Mono',monospace;font-weight:700;}
      .avance-total{background:#003087;color:#fff;padding:6px 10px;border-radius:3px;display:flex;justify-content:space-between;align-items:center;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:13px;text-transform:uppercase;margin-top:6px;}
      .avance-total .val{background:#FFD100;color:#003087;padding:2px 8px;border-radius:3px;font-family:'JetBrains Mono',monospace;}
      .pat-grid{display:grid;grid-template-columns:1fr;gap:4px;}
      .pat-row{display:grid;grid-template-columns:80px 1fr auto;gap:6px;padding:4px 6px;background:#F4F6FA;border-radius:3px;font-size:9px;align-items:center;}
      .pat-row b{color:#003087;font-family:'JetBrains Mono',monospace;}
      .pat-row .obs{color:#475569;font-size:9px;}
      .badge{display:inline-block;padding:2px 7px;border-radius:8px;font-size:8px;font-weight:700;white-space:nowrap;text-transform:uppercase;letter-spacing:.3px;}
      .badge.ok{background:#d1fae5;color:#00884A;} .badge.warn{background:#fef3c7;color:#D97706;} .badge.danger{background:#fee2e2;color:#CC1F1F;} .badge.muted{background:#e5e7eb;color:#475569;}
      .ducto-bar{position:relative;height:36px;background:linear-gradient(90deg,#E5E7EB,#E5E7EB);border-radius:18px;margin:14px 0 50px;overflow:visible;}
      .ducto-progress{position:absolute;left:0;top:0;height:100%;background:linear-gradient(90deg,#22d3ee,#003087);border-radius:18px;transition:width .3s;}
      .ducto-loc{position:absolute;top:-2px;width:12px;height:40px;background:#FFD100;border:2px solid #003087;border-radius:3px;transform:translateX(-50%);}
      .ducto-loc::after{content:attr(data-label);position:absolute;top:42px;left:50%;transform:translateX(-50%) rotate(-35deg);font-size:7px;font-weight:700;color:#003087;white-space:nowrap;font-family:'JetBrains Mono',monospace;transform-origin:top left;}
      .ducto-marker-frente{position:absolute;top:-8px;width:0;height:52px;border-left:3px dashed #CC1F1F;transform:translateX(-50%);}
      .ducto-marker-frente::after{content:'◀ FRENTE ' attr(data-pk);position:absolute;top:-12px;left:6px;font-size:8px;font-weight:700;color:#CC1F1F;white-space:nowrap;background:#fff;padding:1px 4px;border-radius:2px;}
      .fo-etapa-chart{display:flex;flex-wrap:wrap;gap:2px 8px;align-items:center;padding:4px 0;font-size:10px;}
      .fo-etapa-chart b{color:#003087;font-size:9px;text-transform:uppercase;min-width:100px;flex-shrink:0;}
      .fo-etapa-chart .bar{flex:1;min-width:80px;}
      .fo-etapa-chart .val{font-family:'JetBrains Mono',monospace;font-weight:700;text-align:right;white-space:nowrap;min-width:50px;flex-shrink:0;}
      .camaras-list{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;}
      .camaras-list span{background:#F4F6FA;border:1px solid #d1d9e6;border-radius:3px;padding:2px 6px;font-size:8px;color:#003087;font-family:'JetBrains Mono',monospace;}
      .photo-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-top:6px;}
      .photo-grid .ph{border:1px solid #d1d9e6;border-radius:3px;padding:3px;background:#fafafa;text-align:center;}
      .photo-grid .ph img{width:100%;max-height:140px;object-fit:cover;display:block;border-radius:2px;}
      .photo-grid .ph small{display:block;font-size:8px;color:#666;margin-top:2px;}
      .actions{position:sticky;top:0;z-index:99;background:#fff;padding:8px 0;margin-bottom:8px;border-bottom:1px solid #eee;display:flex;gap:8px;flex-wrap:wrap;}
      .actions button{padding:10px 16px;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;}
      .btn-print{background:#003087;color:#fff;} .btn-share{background:#00884A;color:#fff;}
      .pend-list{display:flex;flex-direction:column;gap:4px;}
      .pend-item{border-left:3px solid #D97706;background:#FFFEF0;padding:4px 8px;border-radius:0 3px 3px 0;font-size:9px;}
      .pend-item.crit{border-left-color:#CC1F1F;background:#FEF2F2;}
      .pend-item.cerrado{border-left-color:#00884A;background:#F0FDF4;opacity:.7;text-decoration:line-through;}

      @media screen and (min-width:600px){
        body{padding:14px;font-size:11px;max-width:1000px;margin:0 auto;}
        .subbar{grid-template-columns:1fr 1fr 1fr;gap:10px;}
        .meta-row{grid-template-columns:1fr 1fr 1fr 1fr;}
        .footer-row{grid-template-columns:1fr 1fr;}
        .firmas{grid-template-columns:1fr 1fr 1fr;}
        .stats-grid{grid-template-columns:1fr 1fr;}
        .stats-grid .full{grid-column:1 / -1;}
        .photo-grid{grid-template-columns:repeat(4,1fr);}
      }
      @media print{
        body{padding:5mm;font-size:9px;}
        .no-print,.actions{display:none!important;}
        .pagebreak{page-break-after:always;}
        .stats-grid{grid-template-columns:1fr 1fr;}
        .meta-row{grid-template-columns:1fr 1fr 1fr 1fr;}
        .subbar{grid-template-columns:1fr 1fr 1fr;}
        .firmas{grid-template-columns:1fr 1fr 1fr;}
        .photo-grid{grid-template-columns:repeat(3,1fr);}
        .ducto-loc::after{font-size:7px;}
      }
      @page{size:A4;margin:8mm 6mm;}
    </style>
    </head><body>

    <!-- ===================== PÁGINA 1 ===================== -->
    <div class="page">
      <div class="topbar">
        <h1>Informe Diario Inspección</h1>
        <span class="fecha">${fd}</span>
      </div>
      <div class="subbar">
        <div><b>Contratista:</b> ${esc(OB377.contratista)}</div>
        <div><b>Proyecto:</b> ${esc(p.obraNombre || OB377.proyecto)}</div>
        <div><b>Frente:</b> Oleoducto 24" — Etapa 2.1</div>
      </div>

      <div class="meta-row">
        <div class="meta-cell"><b>Inspector</b>${esc(p.inspectorNombre || '—')}</div>
        <div class="meta-cell"><b>Condiciones</b>${esc(cond.clima || '—')} · ${cond.temperatura ? cond.temperatura + '°C' : '—'} · ${esc(cond.visibilidad || '—')}</div>
        <div class="meta-cell"><b>Especialidad</b>Elect. & Instrum.</div>
        <div class="meta-cell"><b>N° Reporte / Turno</b>${esc((p.id || '').slice(-6).toUpperCase() || '—')} · ${esc(p.turno || '—')}</div>
      </div>

      <div class="section-title">Novedades HSE</div>
      <div class="specialty-block"><div class="specialty-body">
        ${hse.sinNovedad
          ? '<b style="color:#00884A;">✓ SIN NOVEDAD</b> — Sin incidentes ni cuasi-accidentes en el período.'
          : `<b style="color:#CC1F1F;">⚠ CON NOVEDAD</b> — Criticidad: ${esc(hse.criticidad || '—')}<br/>${esc(hse.detalle || '')}`}
      </div></div>

      <div class="section-title">Tareas Realizadas</div>

      <div class="specialty-block">
        <div class="specialty-header"><h3>⏚ Malla de P.A.T.</h3><div class="header-meta">${patLiberadas} de ${OB377.locaciones.length} liberadas · ${patPctTotal}%</div></div>
        <div class="specialty-body">
          ${patArr.length
            ? patArr.map(m => `<div>• <b>${esc(m.locacion || '—')}</b>: ${m.ohm != null ? m.ohm + ' Ω' : 's/medición'} — ${esc(m.estado || '—')}${m.obs ? ' · ' + esc(m.obs) : ''}</div>`).join('')
            : '<div class="no-data">Sin tareas en el día de hoy</div>'}
        </div>
      </div>

      <div class="specialty-block">
        <div class="specialty-header"><h3>⚡ Protección Catódica</h3><div class="header-meta">${cuprosOK} / ${OB377.totalCupros} cupros · ${pcPct}%</div></div>
        <div class="specialty-body">
          ${cupros.length
            ? cupros.map(c => `<div>• <b>${esc(c.pk)}</b> — Martillo: <span class="badge ${c.martillo === 'PASS' ? 'ok' : 'danger'}">${esc(c.martillo || '—')}</span> · R: ${c.resistencia || '—'} mΩ</div>`).join('')
            : '<div class="no-data">Sin tareas en el día de hoy</div>'}
        </div>
      </div>

      <div class="specialty-block">
        <div class="specialty-header"><h3>🔌 Canalizaciones E&I</h3><div class="header-meta">${canalAvanceGeneral}% promedio</div></div>
        <div class="specialty-body">
          ${elecTareas.length
            ? elecTareas.map(t => `<div>• <b>${esc(t.locacion || '—')}</b>: ${esc(t.desc || t.tarea || '')} — ${t.avance != null ? t.avance + '%' : ''} ${t.obs ? '· ' + esc(t.obs) : ''}</div>`).join('')
            : '<div class="no-data">Sin tareas en el día de hoy</div>'}
        </div>
      </div>

      <div class="specialty-block">
        <div class="specialty-header"><h3>🔆 Fibra Óptica</h3><div class="header-meta">Avance general: <b style="color:#00884A;font-size:11px;">${foAvanceGeneral}%</b></div></div>
        <div class="specialty-body">
          <div class="fo-grid">
            <div class="fo-row"><b>Pre-tapada FO</b><span class="fo-detail">${fo.preTapadaHoy ? fo.preTapadaHoy + ' m hoy' : 'Sin tareas hoy'}</span><span class="acum ${acum.pretapada === 0 ? 'zero' : ''}">${acum.pretapada.toLocaleString('es-AR')} mts</span></div>
            <div class="fo-row"><b>Tendido FO</b><span class="fo-detail">${fo.tendidoHoy ? fo.tendidoHoy + ' m hoy' : 'Sin tareas hoy'}</span><span class="acum ${acum.tendido === 0 ? 'zero' : ''}">${acum.tendido.toLocaleString('es-AR')} mts</span></div>
            <div class="fo-row"><b>Nivelación</b><span class="fo-detail">${fo.nivelacionHoy ? fo.nivelacionHoy + ' m hoy' : 'Sin tareas hoy'}</span><span class="acum ${acum.nivelacion === 0 ? 'zero' : ''}">${acum.nivelacion.toLocaleString('es-AR')} mts</span></div>
            <div class="fo-row"><b>Media Tapada + Malla</b><span class="fo-detail">${fo.mediaTapadaHoy ? fo.mediaTapadaHoy + ' m hoy' : 'Sin tareas hoy'}</span><span class="acum ${acum.mediaTapada === 0 ? 'zero' : ''}">${acum.mediaTapada.toLocaleString('es-AR')} mts</span></div>
            <div class="fo-row"><b>Tapada Final</b><span class="fo-detail">${fo.tapadaFinalHoy ? fo.tapadaFinalHoy + ' m hoy' : 'Sin tareas hoy'}</span><span class="acum ${acum.tapadaFinal === 0 ? 'zero' : ''}">${acum.tapadaFinal.toLocaleString('es-AR')} mts</span></div>
            <div class="fo-row"><b>OTROS</b><span class="fo-detail">${esc(fo.observacion || '—')}</span><span class="acum">${fo.empalmes || 0} emp · ${fo.bobinas || 0} bob</span></div>
          </div>
        </div>
      </div>

      ${(ci.fotos && ci.fotos.length) ? `
        <div class="section-title">Reporte Fotográfico del Día (${ci.fotos.length})</div>
        <div class="photo-grid">
          ${ci.fotos.slice(0, 8).map((f, i) => `<div class="ph">
            <img src="${f.dataUrl || f.src || ''}" alt="Foto ${i+1}" />
            ${f.name ? `<small>${esc(f.name)}</small>` : ''}
          </div>`).join('')}
        </div>` : ''}

      <div class="footer-row">
        <div class="dato-relevante">
          <b>Dato relevante del día</b>
          ${esc((ho.comunicacion || ci.novedadOperativa || ho.cambiosPrograma || '—'))}
        </div>
        <div class="firmas">
          <div class="firma"><b>Firma Inspector</b><span class="who">${esc(p.inspectorNombre || ci.firma || '—')}</span></div>
          <div class="firma"><b>Firma Jefe Insp.</b><span class="who">—</span></div>
          <div class="firma"><b>Firma YPF</b><span class="who">—</span></div>
        </div>
      </div>
    </div>

    <div class="pagebreak"></div>

    <!-- ===================== PÁGINA 2 — ESTADÍSTICAS ===================== -->
    <div class="page">
      <div class="topbar">
        <h1>Estadísticas — Avance General</h1>
        <span class="fecha">${fd}</span>
      </div>
      <div class="subbar">
        <div><b>Contratista:</b> ${esc(OB377.contratista)}</div>
        <div><b>Proyecto:</b> ${esc(p.obraNombre || OB377.proyecto)}</div>
        <div><b>Total ducto:</b> 45.133 m · ${fmtPK(OB377.ductoInicio)} → ${fmtPK(OB377.ductoFin)}</div>
      </div>

      <!-- Barra lineal del ducto con frente actual -->
      <div class="section-title">Avance lineal del ducto (frente de pre-tapada FO)</div>
      <div class="ducto-bar">
        <div class="ducto-progress" style="width:${Math.min(100, Math.round(((frenteActual - OB377.ductoInicio) / (OB377.ductoFin - OB377.ductoInicio)) * 100))}%"></div>
        ${OB377.locaciones.map(L => {
          const pos = ((L.pkMetros - OB377.ductoInicio) / (OB377.ductoFin - OB377.ductoInicio)) * 100;
          return `<div class="ducto-loc" style="left:${pos}%" data-label="${L.id}"></div>`;
        }).join('')}
        ${frenteActual > OB377.ductoInicio ? `<div class="ducto-marker-frente" style="left:${Math.min(100, ((frenteActual - OB377.ductoInicio) / (OB377.ductoFin - OB377.ductoInicio)) * 100)}%" data-pk="${fmtPK(frenteActual)}"></div>` : ''}
      </div>

      <div class="stats-grid">
        <!-- Canalizaciones E&I -->
        <div class="stat-card">
          <h4>Canalizaciones E&I</h4>
          <div class="stat-sub">Estado de canalización por locación</div>
          ${anyMatch
            ? canalPorLoc.map(barLoc).join('')
            : elecTareas.map(t => `<div class="locbar"><div class="locbar-label">${esc(t.locacion || t.desc || '—')}</div>${bar(parseInt(t.avance,10)||0, (parseInt(t.avance,10)||0)>=80?'#00884A':(parseInt(t.avance,10)||0)>=30?'#D97706':'#CC1F1F')}</div>`).join('')}
          <div class="avance-total"><span>Avance general</span><span class="val">${canalAvanceGeneral}%</span></div>
          ${anyMatch
            ? canalPorLoc.map(L => `<div class="summary-line"><b>${esc(L.id)}:</b><span>${esc(L.desc.slice(0, 80))}</span><span class="val">${L.avance}%</span></div>`).join('')
            : elecTareas.map(t => `<div class="summary-line"><b>${esc(t.locacion || '—')}:</b><span>${esc((t.desc||t.tarea||'').slice(0,80))}</span><span class="val">${t.avance||0}%</span></div>`).join('')}
        </div>

        <!-- Protección Catódica + PAT -->
        <div class="stat-card">
          <h4>Protección Catódica</h4>
          <div class="stat-sub">Puntos de medición (cupros)</div>
          <div class="summary-line"><b>Montados (PASS):</b><span class="val">${cuprosOK}</span></div>
          <div class="summary-line"><b>Totales planificados:</b><span class="val">${OB377.totalCupros}</span></div>
          <div class="avance-total"><span>Avance</span><span class="val">${pcPct}%</span></div>

          <h4 style="margin-top:12px;">Avances P.A.T.</h4>
          <div class="stat-sub">Resistencia ≤ ${OB377.patLimite}Ω · Liberación por locación</div>
          <div class="pat-grid">
            ${patPorLoc.map(L => `<div class="pat-row">
              <b>${esc(L.id)}</b>
              <span class="obs">${L.resistencia != null ? `<b style="color:${L.fueraNorma ? '#CC1F1F' : '#00884A'};">${L.resistencia}Ω</b>` : 'Sin medición'}${L.obs ? ' · ' + esc(L.obs.slice(0, 40)) : ''}</span>
              ${patEstadoBadge(L)}
            </div>`).join('')}
          </div>
          <div class="avance-total"><span>Avances P.A.T.</span><span class="val">${patPctTotal}%</span></div>
        </div>

        <!-- Fibra Óptica Etapa 1 -->
        <div class="stat-card full">
          <h4>Fibra Óptica — Avance por Etapas</h4>

          <div style="border:1px solid #d1d9e6;border-radius:3px;padding:6px;margin-bottom:8px;background:#F4F6FA;">
            <b style="color:#003087;font-size:10px;">${OB377.etapa1.label}</b>
            <div class="fo-etapa-chart"><b>Pre-tapada ducto</b>${bar(pct(e1.pretapada, e1.total), '#22d3ee')}<span class="val" >${e1.pretapada.toLocaleString('es-AR')} m</span></div>
            <div class="fo-etapa-chart"><b>Tendido FO</b>${bar(pct(e1.tendido, e1.total), '#a78bfa')}<span class="val" >${e1.tendido.toLocaleString('es-AR')} m</span></div>
            <div class="fo-etapa-chart"><b>Tapada FO</b>${bar(pct(e1.tapadaFinal, e1.total), '#fb923c')}<span class="val" >${e1.tapadaFinal.toLocaleString('es-AR')} m</span></div>
            <div class="avance-total" style="margin-top:6px;font-size:11px;"><span>Avance Total Tramo 1</span><span class="val">${tramo1Pct}%</span></div>
          </div>

          <div style="border:1px solid #d1d9e6;border-radius:3px;padding:6px;margin-bottom:8px;background:#F4F6FA;">
            <b style="color:#003087;font-size:10px;">${OB377.etapa2.label}</b>
            <div class="fo-etapa-chart"><b>Pre-tapada</b>${bar(pct(e2.pretapada, e2.total), '#22d3ee')}<span class="val" >${e2.pretapada.toLocaleString('es-AR')} m</span></div>
            <div class="fo-etapa-chart"><b>Tendido FO</b>${bar(pct(e2.tendido, e2.total), '#a78bfa')}<span class="val" >${e2.tendido.toLocaleString('es-AR')} m</span></div>
            <div class="fo-etapa-chart"><b>1/2 Tapada + Malla</b>${bar(pct(e2.mediaTapada, e2.total), '#fbbf24')}<span class="val" >${e2.mediaTapada.toLocaleString('es-AR')} m</span></div>
            <div class="fo-etapa-chart"><b>Tapada Final</b>${bar(pct(e2.tapadaFinal, e2.total), '#fb923c')}<span class="val" >${e2.tapadaFinal.toLocaleString('es-AR')} m</span></div>
            <div class="avance-total" style="margin-top:6px;font-size:11px;"><span>Avance Total Tramo 2</span><span class="val">${tramo2Pct}%</span></div>
          </div>

          <div class="avance-total" style="font-size:14px;background:#FFD100;color:#003087;">
            <span>Avance Total Montaje F.O.</span>
            <span class="val" style="background:#003087;color:#FFD100;">${foAvanceGeneral}%</span>
          </div>

          <div style="margin-top:8px;font-size:9px;color:#475569;">
            <b style="color:#003087;">Distribución de cámaras alcanzadas:</b>
            <div class="camaras-list">
              ${camarasAlcanzadas.length ? camarasAlcanzadas.map(c => `<span>${esc(c.id)} · ${esc(c.pk)}</span>`).join('') : '<span>Sin cámaras alcanzadas en el frente actual</span>'}
            </div>
          </div>
        </div>

        <!-- Instrumentación -->
        <div class="stat-card">
          <h4>Instrumentación</h4>
          <div class="stat-sub">${OB377.totalInstrumentos} instrumentos planificados</div>
          <div class="summary-line"><b>Liberados / Precom:</b><span class="val">${instLiberados}</span></div>
          <div class="summary-line"><b>Montados / Conexionados:</b><span class="val">${instMontados}</span></div>
          <div class="summary-line"><b>Total cargados:</b><span class="val">${instArr.length}</span></div>
          <div class="avance-total"><span>Avance</span><span class="val">${pct(instLiberados, OB377.totalInstrumentos)}%</span></div>
        </div>

        <!-- Pendientes -->
        <div class="stat-card">
          <h4>Pendientes Hand Over</h4>
          <div class="stat-sub">Acciones abiertas / cerradas</div>
          ${(ho.pendientes && ho.pendientes.length) ? `<div class="pend-list">
            ${ho.pendientes.slice(0, 8).map(x => {
              if (typeof x === 'string') return `<div class="pend-item">${esc(x)}</div>`;
              const crit = /Cr[ií]tico/i.test(x.criticidad || '') ? 'crit' : '';
              const cerr = x.estado === 'Cerrado' ? 'cerrado' : '';
              return `<div class="pend-item ${crit} ${cerr}"><b>${esc(x.criticidad || 'Medio')}</b> — ${esc(x.desc || '')}${x.responsable ? ' · <b>' + esc(x.responsable) + '</b>' : ''}</div>`;
            }).join('')}
          </div>` : '<div class="no-data">Sin pendientes registrados.</div>'}
        </div>
      </div>

      <div class="footer-row" style="margin-top:12px;">
        <div class="dato-relevante">
          <b>Resumen ejecutivo</b>
          Frente de pre-tapada FO en <b>${fmtPK(frenteActual)}</b> · acumulado <b>${acum.pretapada.toLocaleString('es-AR')} m</b> de ${OB377.totalMetros.toLocaleString('es-AR')} m (<b>${foAvanceGeneral}%</b>). PAT con <b>${patLiberadas}</b> de ${OB377.locaciones.length} locaciones liberadas (${patPctTotal}% promedio). Cupros PC: ${cuprosOK}/${OB377.totalCupros}. Instrumentos liberados: ${instLiberados}/${OB377.totalInstrumentos}.
        </div>
        <div class="firmas">
          <div class="firma"><b>Inspector</b><span class="who">${esc(p.inspectorNombre || '—')}</span></div>
          <div class="firma"><b>Jefe Insp.</b><span class="who">—</span></div>
          <div class="firma"><b>YPF</b><span class="who">—</span></div>
        </div>
      </div>
    </div>

    <script>
    document.addEventListener('DOMContentLoaded',()=>{
      const isMobile=/iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const bar=document.createElement('div');bar.className='actions no-print';
      bar.innerHTML='<button class="btn-print" onclick="window.print()">🖨 Imprimir / Guardar PDF</button>'
        +(navigator.share?'<button class="btn-share" id="shareBtn">📤 Compartir</button>':'');
      document.body.prepend(bar);
      const sb=document.getElementById('shareBtn');
      if(sb)sb.onclick=async()=>{try{await navigator.share({title:document.title,text:'Parte Diario GTL',url:location.href})}catch(e){}};
      if(!isMobile){setTimeout(()=>window.print(),400);}
    });
    <\/script>
    </body></html>`;

    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
    else UI.toast('Permitir pop-ups para exportar PDF', 'warn');
  }

  // Función original (fallback legacy)
  function printParte(p) {
    if (!p) return;
    const fd = formatDate(p.fecha);

    // Normalizar estructura: parte puede venir anidado (local) o flat (Sheet)
    const tryJson = (v, def) => {
      if (Array.isArray(v)) return v;
      if (typeof v === "string") { try { return JSON.parse(v); } catch (e) { return def; } }
      return v != null ? v : def;
    };
    const pickFlat = (prefix, keys) => {
      const o = {}; let any = false;
      keys.forEach(k => { const v = p[prefix + k]; if (v != null && v !== "") { o[k] = v; any = true; } });
      return any ? o : null;
    };

    const cond = p.condiciones || {
      clima: p.clima, alertaYpf: p.alertaYpf, temperatura: p.temperatura, visibilidad: p.visibilidad
    };
    const hse = p.hse || {
      sinNovedad: p.hseSinNovedad !== false,
      detalle: p.hseDetalle, criticidad: p.hseCriticidad,
      charlas: tryJson(p.hseCharlas, [])
    };
    // Mergeamos: nested tiene precedencia, flat completa lo que falte
    const foFlat = pickFlat("fo_", ["preTapadaHoy","preTapadaAcum","tendidoHoy","tendidoAcum","pkInicioDia","pkFinDia","nivelacionHoy","nivelacionAcum","mediaTapadaHoy","mediaTapadaAcum","tapadaFinalHoy","tapadaFinalAcum","otdr","bobinas","empalmes","observacion"]) || {};
    let fo  = Object.assign({}, foFlat, (p.avances && p.avances.fo) || {});
    if (!fo.tramos || !fo.tramos.length) fo.tramos = tryJson(p.fo_tramos_json, fo.tramos || []);
    let pat = Object.assign({}, (p.avances && p.avances.pat) || {});
    if (!pat.mediciones || !pat.mediciones.length) pat.mediciones = tryJson(p.pat_mediciones_json, []);
    if (!pat.puntuales  || !pat.puntuales.length)  pat.puntuales  = tryJson(p.pat_puntuales_json, []);
    let pc  = Object.assign({}, (p.avances && p.avances.pc) || {});
    if (!pc.cupros || !pc.cupros.length) pc.cupros = tryJson(p.pc_cupros_json, []);
    if (pc.wennerCount == null && p.pc_wennerCount != null) pc.wennerCount = p.pc_wennerCount;
    if (pc.wennerUbic == null  && p.pc_wennerUbic != null)  pc.wennerUbic  = p.pc_wennerUbic;
    if (pc.juntasCount == null && p.pc_juntasCount != null) pc.juntasCount = p.pc_juntasCount;
    if (pc.juntasEstado == null&& p.pc_juntasEstado != null) pc.juntasEstado= p.pc_juntasEstado;
    let elec = Object.assign({}, (p.avances && p.avances.elec) || {});
    if (!elec.tareas || !elec.tareas.length) elec.tareas = tryJson(p.elec_tareas_json, []);
    let inst = Object.assign({}, (p.avances && p.avances.inst) || {});
    if (!inst.instrumentos || !inst.instrumentos.length) inst.instrumentos = tryJson(p.inst_instrumentos_json, []);
    let civ = Object.assign({}, (p.avances && p.avances.civ) || {});
    if (!civ.tareas || !civ.tareas.length) civ.tareas = tryJson(p.civ_tareas_json, []);
    let mec = Object.assign({}, (p.avances && p.avances.mec) || {});
    if (!mec.tareas || !mec.tareas.length) mec.tareas = tryJson(p.mec_tareas_json, []);
    if (!pat.observacion && p.pat_observacion) pat.observacion = p.pat_observacion;
    const ho  = p.handover || {
      pendientes: tryJson(p.pendientes, []),
      noConformidades: tryJson(p.noConformidades, []),
      cambiosPrograma: p.cambiosPrograma, comunicacion: p.comunicacion
    };
    const ci  = p.cierre || {
      personalEnObra: p.personalEnObra,
      empresas: typeof p.empresas === "string" ? p.empresas.split(",").map(s => s.trim()).filter(Boolean) : (p.empresas || []),
      firma: p.firma, timestamp: p.timestampCierre
    };

    // Lookup de la obra para obtener locaciones y especialidades configuradas
    let obra = null;
    try {
      const cfg = (window.GTL && GTL.Store && GTL.Store.getConfig) ? GTL.Store.getConfig() : null;
      if (cfg && cfg.obras) obra = cfg.obras.find(o => o.id === p.obraId);
    } catch (e) {}
    const obraEsp = (obra && obra.especialidades) || [];
    const obraLocs = (obra && obra.locaciones) || [];

    // ¿Qué especialidades mostrar? Las de la obra + las que tengan datos en el parte
    const especialidades = obraEsp.slice();
    [["fo", Object.keys(fo).length],
     ["pat", pat.mediciones.length || pat.puntuales.length],
     ["pc", pc.cupros.length || pc.wennerCount || pc.juntasCount],
     ["elec", elec.tareas.length],
     ["inst", inst.instrumentos.length],
     ["civ", civ.tareas.length],
     ["mec", mec.tareas.length]].forEach(([k, v]) => {
      if (v && !especialidades.includes(k)) especialidades.push(k);
    });
    const has = (k) => especialidades.includes(k);

    // Si PAT está habilitada en la obra pero el parte no trae mediciones, generamos placeholders por cada locación
    if (has("pat") && (!pat.mediciones || !pat.mediciones.length) && obraLocs.length) {
      pat.mediciones = obraLocs.map(l => ({ locacion: l, ohm: "", estado: "No iniciada", obs: "" }));
    }

    const row = (k, v) => v != null && v !== "" ? `<tr><td class="k">${k}</td><td>${v}</td></tr>` : "";
    const badge = (v, ok) => `<span class="badge ${ok ? "ok":"danger"}">${v}</span>`;
    const nl2li = arr => {
      if (!arr || !arr.length) return "—";
      return `<ul>${arr.map(x => {
        if (typeof x === "string") return `<li>${esc(x)}</li>`;
        const desc = esc(x.texto || x.desc || JSON.stringify(x));
        const estado = x.estado === "Cerrado" ? ' <span class="badge ok">Cerrado</span>' : "";
        const crit = x.criticidad ? ` <span class="badge ${/Cr[ií]tico/.test(x.criticidad) ? "danger" : /Alto/.test(x.criticidad) ? "warn" : "muted"}">${esc(x.criticidad)}</span>` : "";
        const resp = x.responsable ? ` — ${esc(x.responsable)}` : "";
        return `<li>${desc}${resp}${crit}${estado}</li>`;
      }).join("")}</ul>`;
    };

    const tramosHtml = (fo.tramos && fo.tramos.length)
      ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Desde</th><th>Hasta</th><th>Actividad</th><th>Metros</th><th>Estado</th><th>Obs</th></tr></thead><tbody>
          ${fo.tramos.map(t => `<tr>
            <td>Cám ${esc(t.camDesde)}</td><td>${t.camHasta === "Receptora" ? "<b>Receptora</b>" : "Cám " + esc(t.camHasta)}</td>
            <td>${esc(t.actividad)}</td><td>${t.metros ? esc(t.metros) + " m" : "—"}</td>
            <td><span class="badge ${t.estado === "OK" ? "ok" : t.estado === "Parcial" ? "warn" : "danger"}">${esc(t.estado)}</span></td>
            <td>${esc(t.obs || "")}</td>
          </tr>`).join("")}
        </tbody></table></div>` : "<p class='none'>Sin tramos registrados</p>";

    const patHtml = (pat.mediciones && pat.mediciones.length)
      ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Locación</th><th>Ω</th><th>Estado</th><th>Obs</th></tr></thead><tbody>
          ${pat.mediciones.map(m => {
            const v = parseFloat(m.ohm);
            const cls = !isNaN(v) ? (v > 2 ? "danger" : v > 1.5 ? "warn" : "ok") : "";
            return `<tr class="${cls}"><td>${esc(m.locacion)}</td><td>${esc(m.ohm) || "—"}</td><td>${esc(m.estado)}</td><td>${esc(m.obs || "")}</td></tr>`;
          }).join("")}
        </tbody></table></div>` : "";

    const cuprosHtml = (pc.cupros && pc.cupros.length)
      ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>PK</th><th>Martillo</th><th>Resistencia</th></tr></thead><tbody>
          ${pc.cupros.map(c => `<tr><td>${esc(c.pk)}</td><td>${badge(c.martillo || "—", c.martillo === "PASS")}</td><td>${c.resistencia ? esc(c.resistencia) + " mΩ" : "—"}</td></tr>`).join("")}
        </tbody></table></div>` : "";

    const tareasHtml = (arr) => (arr && arr.length)
      ? `<ul>${arr.map(t => `<li>${esc(t.desc || t.tag || "")} — <b>${esc(t.tipo || t.estado || "")}</b> ${t.avance != null ? t.avance + "%" : ""} ${t.obs ? "· " + esc(t.obs) : ""}</li>`).join("")}</ul>` : "";

    const foSection = has("fo") ? `
      <h3>🔆 Fibra Óptica</h3>
      <table class="kv">
        ${row("Tendido hoy", fo.tendidoHoy ? fo.tendidoHoy + " m" : null)}
        ${row("Tendido acumulado", fo.tendidoAcum ? fo.tendidoAcum + " m" : null)}
        ${row("Pre-tapada hoy/acum", fo.preTapadaHoy || fo.preTapadaAcum ? (fo.preTapadaHoy || 0) + " / " + (fo.preTapadaAcum || 0) + " m" : null)}
        ${row("Nivelación hoy/acum", fo.nivelacionHoy || fo.nivelacionAcum ? (fo.nivelacionHoy || 0) + " / " + (fo.nivelacionAcum || 0) + " m" : null)}
        ${row("Media tapada hoy/acum", fo.mediaTapadaHoy || fo.mediaTapadaAcum ? (fo.mediaTapadaHoy || 0) + " / " + (fo.mediaTapadaAcum || 0) + " m" : null)}
        ${row("Tapada final hoy/acum", fo.tapadaFinalHoy || fo.tapadaFinalAcum ? (fo.tapadaFinalHoy || 0) + " / " + (fo.tapadaFinalAcum || 0) + " m" : null)}
        ${row("PK inicio/fin del día", fo.pkInicioDia || fo.pkFinDia ? formatPK(fo.pkInicioDia) + " → " + formatPK(fo.pkFinDia) : null)}
        ${row("OTDR / bobinas", (fo.otdr === true || fo.otdr === "true") ? "Sí · " + (fo.bobinas || 0) + " bobinas" : null)}
        ${row("Empalmes hoy", fo.empalmes || null)}
        ${row("Observación", fo.observacion || null)}
      </table>
      <h4 style="margin:8px 0 4px;font-size:12px;color:#555;">Tramos por cámara</h4>
      ${tramosHtml}` : "";

    const patSection = has("pat") ? `
      <h3>⏚ Mallas PAT</h3>${patHtml || "<p class='none'>Sin mediciones</p>"}
      ${pat.puntuales && pat.puntuales.length ? `<p style="margin:4px 0;font-size:11px;"><b>Mediciones puntuales:</b> ${pat.puntuales.length} registrada(s)</p>` : ""}
      ${pat.observacion ? `<p style="margin:4px 0;font-size:11px;"><b>Observación inspector:</b> ${esc(pat.observacion)}</p>` : ""}
      ${pat.resumen ? `<p style="margin:4px 0;font-size:11px;"><b>Resumen:</b> ${esc(pat.resumen)}</p>` : ""}` : "";

    const pcSection = has("pc") ? `
      <h3>⚡ Protección Catódica</h3>
      ${cuprosHtml || "<p class='none'>Sin cupros registrados</p>"}
      <table class="kv">
        ${row("Wenner (cant)", pc.wennerCount || null)}
        ${row("Ubicaciones Wenner", pc.wennerUbic || null)}
        ${row("Juntas dieléctricas", pc.juntasCount || null)}
        ${row("Estado megado", pc.juntasEstado || null)}
      </table>` : "";

    const elecSection = has("elec") ? `
      <h3>🔌 Eléctrico</h3>${tareasHtml(elec.tareas) || "<p class='none'>Sin tareas</p>"}` : "";

    const instSection = has("inst") ? `
      <h3>🎛 Instrumentación</h3>
      ${inst.instrumentos && inst.instrumentos.length ? `
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>TAG</th><th>Descripción</th><th>Estado</th><th>Obs</th></tr></thead><tbody>
          ${inst.instrumentos.map(t => `<tr>
            <td><b>${esc(t.tag || "")}</b></td>
            <td>${esc(t.desc || "")}</td>
            <td>${esc(t.estado || "")}</td>
            <td>${esc(t.obs || "")}</td>
          </tr>`).join("")}
        </tbody></table></div>` : "<p class='none'>Sin instrumentos</p>"}` : "";

    const civSection = has("civ") ? `
      <h3>🏗 Civil</h3>
      ${civ.tareas && civ.tareas.length ? `
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tarea</th><th>Tipo</th><th>Avance</th><th>Obs</th></tr></thead><tbody>
          ${civ.tareas.map(t => `<tr>
            <td>${esc(t.desc || "")}</td>
            <td>${esc(t.tipo || "")}</td>
            <td>${t.avance != null ? t.avance + "%" : "—"}</td>
            <td>${esc(t.obs || "")}</td>
          </tr>`).join("")}
        </tbody></table></div>` : "<p class='none'>Sin tareas civiles</p>"}` : "";

    const mecSection = has("mec") ? `
      <h3>⚙ Mecánico</h3>
      ${mec.tareas && mec.tareas.length ? `
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tarea</th><th>Tipo</th><th>Avance</th><th>Obs</th></tr></thead><tbody>
          ${mec.tareas.map(t => `<tr>
            <td>${esc(t.desc || "")}</td>
            <td>${esc(t.tipo || "")}</td>
            <td>${t.avance != null ? t.avance + "%" : "—"}</td>
            <td>${esc(t.obs || "")}</td>
          </tr>`).join("")}
        </tbody></table></div>` : "<p class='none'>Sin tareas mecánicas</p>"}` : "";

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0"/>
    <title>Parte Diario — ${esc(p.obraNombre)} ${fd}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box;}
      body{font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#111;background:#fff;padding:10px;max-width:100vw;overflow-x:hidden;-webkit-text-size-adjust:100%;}
      .header{background:#0055A4;color:#fff;padding:10px;border-radius:6px;margin-bottom:12px;}
      .header h1{font-size:15px;letter-spacing:.3px;margin-bottom:4px;line-height:1.3;} .header h1 span{color:#2ECC40;}
      .header .meta{font-size:11px;opacity:.9;line-height:1.5;}
      .header .meta div{margin-bottom:2px;}
      h2{background:#0078D4;color:#fff;padding:5px 8px;margin:12px 0 6px;font-size:12px;letter-spacing:.4px;border-radius:4px;}
      h3{color:#0055A4;border-bottom:2px solid #cce;padding:3px 0 2px;margin:10px 0 5px;font-size:12px;}
      h4{font-size:11px;}
      .tbl-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:4px 0;max-width:100%;}
      table.tbl{width:100%;border-collapse:collapse;font-size:11px;table-layout:auto;}
      table.tbl th{background:#0055A4;color:#fff;padding:4px 5px;font-size:10px;text-align:left;white-space:nowrap;}
      table.tbl td{padding:4px 5px;border-bottom:1px solid #eee;vertical-align:top;font-size:11px;word-break:break-word;}
      table.tbl tr.ok td{background:#f0fff4;} table.tbl tr.warn td{background:#fffbeb;} table.tbl tr.danger td{background:#fff0f0;}
      table.kv{width:100%;border-collapse:collapse;margin:4px 0;}
      table.kv td{padding:3px 5px;border-bottom:1px dotted #ddd;vertical-align:top;word-break:break-word;font-size:11px;}
      table.kv td.k{font-weight:bold;white-space:nowrap;color:#333;padding-right:8px;width:1%;}
      .badge{display:inline-block;padding:1px 6px;border-radius:8px;font-size:9px;font-weight:bold;white-space:nowrap;}
      .badge.ok{background:#d1fae5;color:#065f46;} .badge.warn{background:#fef3c7;color:#92400e;} .badge.danger{background:#fee2e2;color:#991b1b;} .badge.muted{background:#e5e7eb;color:#374151;}
      .hse-ok{color:#065f46;font-weight:bold;} .hse-bad{color:#991b1b;font-weight:bold;}
      ul{margin:4px 0 4px 16px;} li{margin:2px 0;line-height:1.3;font-size:11px;}
      p.none{color:#888;font-style:italic;margin:4px 0;font-size:11px;}
      .pend-list{display:flex;flex-direction:column;gap:6px;margin:4px 0 8px;}
      .pend-item-pdf{border:1px solid #ddd;border-radius:5px;padding:6px 8px;background:#fafbfc;display:flex;flex-direction:column;gap:3px;}
      .pend-item-pdf.pend-closed{background:#f0fff4;border-color:#86efac;opacity:.8;}
      .pend-item-pdf.pend-closed .pend-desc-pdf{text-decoration:line-through;color:#666;}
      .pend-desc-pdf{font-size:12px;line-height:1.3;color:#111;word-break:break-word;}
      .pend-info-pdf{display:flex;flex-wrap:wrap;gap:4px;align-items:center;font-size:10px;color:#555;}
      .pend-info-pdf b{font-weight:600;color:#333;}
      .footer{margin-top:16px;border-top:1px solid #ccc;padding-top:6px;font-size:9px;color:#888;display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px;}
      .firma-box{border:1px solid #ccc;padding:6px 10px;border-radius:4px;display:inline-block;min-width:120px;margin-top:6px;font-size:11px;}
      .photo-grid{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;}
      .photo-grid .ph{border:1px solid #ddd;border-radius:4px;padding:3px;background:#fafafa;text-align:center;flex:1;min-width:80px;max-width:48%;}
      .photo-grid .ph img{width:100%;max-height:140px;object-fit:cover;display:block;border-radius:2px;}
      .photo-grid .ph small{display:block;font-size:8px;color:#666;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      .actions{position:sticky;top:0;z-index:99;background:#fff;padding:8px 0;margin-bottom:8px;border-bottom:1px solid #eee;display:flex;gap:8px;flex-wrap:wrap;}
      .actions button{padding:8px 14px;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;}
      .btn-print{background:#0055A4;color:#fff;} .btn-share{background:#2ECC40;color:#fff;}
      @media screen and (min-width:600px){body{padding:24px;font-size:12px;max-width:800px;margin:0 auto;} .header{display:flex;justify-content:space-between;align-items:center;padding:14px;} .header .meta{text-align:right;} .header h1{font-size:18px;margin-bottom:0;} table.tbl td,table.tbl th{padding:5px 6px;font-size:12px;} table.kv td{font-size:12px;padding:4px 6px;} h2{font-size:13px;padding:6px 10px;} li{font-size:12px;}}
      @media print{body{padding:8mm;font-size:10px;} .no-print,.actions{display:none!important;} .photo-grid .ph{break-inside:avoid;} .tbl-wrap{overflow:visible;} table.tbl{font-size:9px;} table.tbl th,table.tbl td{padding:3px 4px;} table.kv td{padding:3px 4px;font-size:10px;} h2{font-size:11px;padding:4px 8px;margin:10px 0 5px;} h3{font-size:11px;} .header{padding:8px;} .header h1{font-size:14px;} .header .meta{font-size:10px;}}
      @page{size:A4;margin:10mm 8mm;}
    </style>
    </head><body>
    <div class="header">
      <h1>GTL <span>●</span> INSPECTOR — Parte Diario</h1>
      <div class="meta">
        <div><b>Obra:</b> ${esc(p.obraNombre)}</div>
        <div><b>Fecha:</b> ${fd} &nbsp;|&nbsp; <b>Turno:</b> ${esc(p.turno)}</div>
        <div><b>Inspector:</b> ${esc(p.inspectorNombre)} &nbsp;|&nbsp; DNI: ${esc(p.inspectorDni)}</div>
      </div>
    </div>

    <h2>1. CONDICIONES DEL DÍA</h2>
    <table class="kv">
      ${row("Clima", cond.clima)} ${row("Alerta YPF", cond.alertaYpf)}
      ${row("Temperatura", cond.temperatura ? cond.temperatura + " °C" : null)} ${row("Visibilidad", cond.visibilidad)}
    </table>

    <h2>2. HSE</h2>
    <table class="kv">
      ${row("Sin novedad", `<span class="${hse.sinNovedad ? "hse-ok":"hse-bad"}">${hse.sinNovedad ? "✓ SÍ" : "✗ NO"}</span>`)}
      ${row("Detalle", hse.detalle || null)}
      ${row("Criticidad", hse.criticidad || null)}
      ${row("Charlas / capacitaciones", hse.charlas && hse.charlas.length ? hse.charlas.map(c => esc(c.tema || c)).join(", ") : null)}
    </table>

    <h2>3. AVANCES</h2>
    ${(foSection + patSection + pcSection + elecSection + instSection + civSection + mecSection) || "<p class='none'>Sin especialidades cargadas para esta obra.</p>"}

    <h2>4. HAND OVER</h2>
    ${ho.pendientes && ho.pendientes.length ? `
      <h4 style="margin:6px 0 4px;color:#333;">Pendientes (${ho.pendientes.length})</h4>
      <div class="pend-list">
        ${ho.pendientes.map(x => {
          if (typeof x === "string") return `<div class="pend-item-pdf"><span class="pend-desc-pdf">${esc(x)}</span></div>`;
          const desc = esc(x.texto || x.desc || "");
          const cerrado = x.estado === "Cerrado";
          return `<div class="pend-item-pdf${cerrado ? " pend-closed" : ""}">
            <span class="pend-desc-pdf">${desc}</span>
            <span class="pend-info-pdf">
              ${x.responsable ? `<b>${esc(x.responsable)}</b>` : ""}
              ${x.criticidad ? `<span class="badge ${/Cr[ií]tico/.test(x.criticidad) ? "danger" : /Alto/.test(x.criticidad) ? "warn" : "muted"}">${esc(x.criticidad)}</span>` : ""}
              ${cerrado ? '<span class="badge ok">Cerrado</span>' : '<span class="badge muted">Abierto</span>'}
            </span>
          </div>`;
        }).join("")}
      </div>` : `<p class="none">Sin pendientes.</p>`}
    ${ho.noConformidades && ho.noConformidades.length ? `
      <h4 style="margin:10px 0 4px;color:#333;">No Conformidades (${ho.noConformidades.length})</h4>
      <div class="pend-list">
        ${ho.noConformidades.map(x => {
          if (typeof x === "string") return `<div class="pend-item-pdf"><span class="pend-desc-pdf">${esc(x)}</span></div>`;
          const desc = esc(x.texto || x.desc || JSON.stringify(x));
          return `<div class="pend-item-pdf"><span class="pend-desc-pdf">${desc}</span></div>`;
        }).join("")}
      </div>` : ""}
    <table class="kv">
      ${row("Cambios de programa", ho.cambiosPrograma || null)}
      ${row("Comunicaciones", ho.comunicacion || null)}
    </table>

    <h2>5. CIERRE</h2>
    <table class="kv">
      ${row("Personal en obra", ci.personalEnObra || null)}
      ${row("Empresas presentes", ci.empresas && ci.empresas.length ? ci.empresas.join(", ") : null)}
    </table>
    <div style="margin-top:10px;">
      <span style="font-size:11px;color:#555;">Firma / conformidad:</span><br/>
      <div class="firma-box">${esc(ci.firma || p.inspectorNombre)}</div>
    </div>

    ${(ci.fotos && ci.fotos.length) ? `
      <h3 style="margin-top:14px;">📷 Fotos del día (${ci.fotos.length})</h3>
      <div class="photo-grid">
        ${ci.fotos.map((f, i) => `<div class="ph">
          <img src="${f.dataUrl || f.src || ''}" alt="Foto ${i+1}" />
          ${f.name ? `<small>${esc(f.name)}</small>` : ""}
        </div>`).join("")}
      </div>
    ` : (p.fotosCount > 0 ? `
      <p style="margin-top:14px;color:#888;font-style:italic;font-size:11px;">
        📷 Hay ${p.fotosCount} foto(s) en el parte (no disponibles en esta vista — abrir el parte original).
      </p>` : "")}

    <div class="footer">
      <span>ID: ${esc(p.id || "—")}</span>
      <span>GTL Inspector — YPF Upstream &nbsp;|&nbsp; GRUPO TERGO LAF</span>
      <span>Generado: ${new Date().toLocaleString("es-AR")}</span>
    </div>
    <script>
    document.addEventListener('DOMContentLoaded',()=>{
      const isMobile=/iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if(!isMobile){window.print();return;}
      const bar=document.createElement('div');bar.className='actions no-print';
      bar.innerHTML='<button class="btn-print" onclick="window.print()">🖨 Imprimir / PDF</button>'
        +(navigator.share?'<button class="btn-share" id="shareBtn">📤 Compartir</button>':'');
      document.body.prepend(bar);
      const sb=document.getElementById('shareBtn');
      if(sb)sb.onclick=async()=>{try{await navigator.share({title:document.title,text:'Parte Diario GTL',url:location.href})}catch(e){}};
    });
    <\/script>
    </body></html>`;

    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
    else UI.toast("Permitir pop-ups para exportar PDF", "warn");
  }

  global.GTL = global.GTL || {};
  // Exportamos printParte apuntando a la versión ejecutiva (formato Hugo Farias OB-377)
  // La función legacy queda disponible internamente como fallback.
  global.GTL.UI = { toast, modal, confirm, navigate, esc, formatPK, formatDate, formatDateTime, todayIso, vibrate, refreshConnUI, printParte: printParteEjecutivo, printParteLegacy: printParte, renderObraTabs, OB377, parsePK, fmtPK };
  global.GTL.Router = { route, navigate, render };

  /* ---------- Bootstrap ---------- */
  function boot() {
    // Registramos rutas
    route("/home",       renderHome);
    route("/more",       renderMore);
    route("/setup-obra", (v) => global.GTL.Views.Setup.renderObraOnly(v));
    route("/form",       (v, q) => global.GTL.Views.Form.render(v, q));
    route("/dashboard",  (v, q) => global.GTL.Views.Dashboard.render(v, q));
    route("/history",    (v) => global.GTL.Views.Settings.renderHistory(v));
    route("/parte",      (v, q) => global.GTL.Views.Settings.renderParteDetail(v, q));
    route("/settings",   (v) => global.GTL.Views.Settings.render(v));

    // Bottom nav
    document.querySelectorAll(".bottomnav .tab").forEach(t => {
      t.addEventListener("click", () => navigate(t.dataset.route));
    });

    window.addEventListener("hashchange", render);

    Sync.bindNetworkEvents();
    Sync.onSync((e) => {
      if (e.type === "drain-end" && e.sent > 0) toast(`✓ Sincronizados ${e.sent} parte(s)`, "ok");
      refreshConnUI();
    });

    // Splash off
    setTimeout(() => {
      document.getElementById("splash").style.display = "none";
      document.getElementById("app").classList.remove("hidden");
      render();
    }, 250);

    // Service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(err => console.warn("SW reg fail", err));
    }

    // Drain inicial
    setTimeout(() => Sync.drainQueue().catch(() => {}), 1500);

    // Refresh conn UI periódico
    setInterval(refreshConnUI, 15000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
