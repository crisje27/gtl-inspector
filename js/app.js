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
     PDF — PARTE DIARIO (formato limpio, 1 página + stats)
     ========================================================= */
  function printParteEjecutivo(p) {
    if (!p) return;
    const fd = formatDate(p.fecha);
    const tryJson = (v, def) => {
      if (Array.isArray(v)) return v;
      if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return def; } }
      return v != null ? v : def;
    };

    // --- Normalizar datos ---
    const cond = p.condiciones || { clima: p.clima, alertaYpf: p.alertaYpf, temperatura: p.temperatura, visibilidad: p.visibilidad };
    const hse  = p.hse || { sinNovedad: p.hseSinNovedad !== false, detalle: p.hseDetalle };
    const fo   = (p.avances && p.avances.fo) || {};
    const pat  = (p.avances && p.avances.pat) || {};
    const pcA  = (p.avances && p.avances.pc) || {};
    const elec = (p.avances && p.avances.elec) || {};
    const inst = (p.avances && p.avances.inst) || {};
    const ho   = p.handover || { pendientes: tryJson(p.pendientes, []), noConformidades: tryJson(p.noConformidades, []) };
    const ci   = p.cierre || {};

    // --- PAT ---
    const patArr = Array.isArray(pat.mediciones) ? pat.mediciones : [];
    const patRows = patArr.length ? patArr.map(m => {
      const v = m.ohm != null && m.ohm !== '' ? parseFloat(m.ohm) : null;
      const ok = v != null && !isNaN(v) && v <= 2;
      return `<tr>
        <td class="bold">${esc(m.locacion || '—')}</td>
        <td class="mono ${v == null ? 'muted' : ok ? 'ok' : 'danger'}">${v != null ? v + ' Ω' : 'S/M'}</td>
        <td>${esc(m.estado || '—')}</td>
        <td class="obs">${esc((m.obs || '').slice(0, 50))}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="4" class="muted">Sin mediciones PAT cargadas</td></tr>';

    // --- Canalizaciones ---
    const elecTareas = Array.isArray(elec.tareas) ? elec.tareas : [];
    const canalRows = elecTareas.length ? elecTareas.map(t =>
      `<tr><td class="bold">${esc(t.locacion || '—')}</td><td>${esc(t.desc || t.tarea || '')}</td><td class="mono">${t.avance != null ? t.avance + '%' : '—'}</td><td class="obs">${esc((t.obs || '').slice(0, 40))}</td></tr>`
    ).join('') : '<tr><td colspan="4" class="muted">Sin tareas cargadas</td></tr>';

    // --- FO ---
    const foHoy = (k) => { const v = fo[k + 'Hoy'] || fo[k + '_hoy']; return v ? v + ' m' : '—'; };
    const foAcum = (k) => { const v = +(fo[k + 'Acum'] || fo[k + '_acum'] || 0); return v > 0 ? v.toLocaleString('es-AR') + ' m' : '—'; };

    // --- Instrumentación ---
    const instArr = Array.isArray(inst.instrumentos) ? inst.instrumentos : [];

    // --- Cupros ---
    const cupros = Array.isArray(pcA.cupros) ? pcA.cupros : [];

    // --- Pendientes ---
    const pends = ho.pendientes || [];

    // --- Fotos ---
    const fotos = (ci.fotos && ci.fotos.length) ? ci.fotos : [];

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
    <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
    <title>Parte Diario — ${esc(p.obraNombre || '')} ${fd}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box;}
      body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#1a1a2e;background:#fff;padding:10px;max-width:100vw;overflow-x:hidden;-webkit-text-size-adjust:100%;}
      .header{background:#003087;color:#fff;padding:10px 12px;border-radius:4px;margin-bottom:8px;}
      .header h1{font-size:14px;font-weight:700;margin-bottom:2px;}
      .header h1 span{color:#FFD100;}
      .header-info{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:10px;opacity:.9;margin-top:4px;}
      .section{margin-bottom:8px;}
      .section-title{background:#003087;color:#fff;padding:4px 8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;border-radius:2px;margin-bottom:4px;}
      .section-title span{color:#FFD100;}
      table{width:100%;border-collapse:collapse;margin-bottom:2px;}
      th{background:#e8ecf4;color:#003087;padding:3px 6px;font-size:9px;text-align:left;font-weight:700;text-transform:uppercase;letter-spacing:.3px;border-bottom:2px solid #003087;}
      td{padding:3px 6px;border-bottom:1px solid #e5e7eb;font-size:10px;vertical-align:top;}
      tr:nth-child(even) td{background:#f8f9fc;}
      .bold{font-weight:700;color:#003087;white-space:nowrap;}
      .mono{font-family:monospace;font-weight:700;}
      .ok{color:#00884A;} .danger{color:#CC1F1F;} .warn{color:#D97706;} .muted{color:#94a3b8;font-style:italic;}
      .obs{color:#64748b;font-size:9px;max-width:140px;word-break:break-word;}
      .kv{display:flex;flex-wrap:wrap;gap:2px 16px;font-size:10px;padding:4px 0;}
      .kv b{color:#003087;}
      .hse-box{padding:6px 8px;border-radius:3px;font-size:10px;font-weight:600;}
      .hse-ok{background:#d1fae5;color:#00884A;border:1px solid #00884A;}
      .hse-bad{background:#fee2e2;color:#CC1F1F;border:1px solid #CC1F1F;}
      .badge{display:inline-block;padding:1px 6px;border-radius:6px;font-size:8px;font-weight:700;text-transform:uppercase;}
      .badge-crit{background:#CC1F1F;color:#fff;} .badge-alto{background:#D97706;color:#fff;} .badge-medio{background:#e5e7eb;color:#475569;} .badge-bajo{background:#d1fae5;color:#00884A;}
      .pend-item{padding:3px 0;border-bottom:1px dotted #e5e7eb;font-size:10px;display:flex;gap:6px;align-items:baseline;}
      .pend-item:last-child{border-bottom:none;}
      .dato-dia{background:#FFF8E1;border:1px solid #FFD100;border-radius:3px;padding:6px 8px;font-size:10px;margin-top:4px;}
      .dato-dia b{color:#003087;}
      .firmas{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;padding-top:6px;border-top:1px solid #ccc;}
      .firma{flex:1;min-width:120px;text-align:center;font-size:9px;}
      .firma b{display:block;margin-bottom:16px;color:#003087;}
      .firma .line{border-top:1px solid #333;padding-top:2px;}
      .photo-grid{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;}
      .ph{border:1px solid #ddd;border-radius:2px;padding:2px;text-align:center;width:calc(50% - 4px);max-width:180px;}
      .ph img{width:100%;max-height:120px;object-fit:cover;display:block;}
      .ph small{font-size:7px;color:#666;display:block;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      .footer{margin-top:8px;font-size:8px;color:#94a3b8;display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px;border-top:1px solid #e5e7eb;padding-top:4px;}
      .actions{position:sticky;top:0;z-index:99;background:#fff;padding:6px 0;margin-bottom:6px;border-bottom:1px solid #eee;display:flex;gap:6px;}
      .actions button{padding:6px 12px;border:none;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;}
      .btn-print{background:#003087;color:#fff;} .btn-share{background:#00884A;color:#fff;}
      @media(min-width:600px){body{padding:20px;max-width:800px;margin:0 auto;font-size:12px;} td,th{padding:4px 8px;font-size:11px;} .header h1{font-size:16px;}}
      @media print{.actions{display:none!important;} body{padding:6mm;} @page{size:A4;margin:8mm;}}
    </style>
    </head><body>

    <div class="header">
      <h1><span>GTL</span> INSPECTOR — Parte Diario</h1>
      <div class="header-info">
        <span><b>Obra:</b> ${esc(p.obraNombre || '')}</span>
        <span><b>Fecha:</b> ${fd}</span>
        <span><b>Turno:</b> ${esc(p.turno || '')}</span>
        <span><b>Inspector:</b> ${esc(p.inspectorNombre || '')}</span>
        <span><b>DNI:</b> ${esc(p.inspectorDni || '')}</span>
      </div>
    </div>

    <!-- Condiciones -->
    <div class="section">
      <div class="kv">
        <span><b>Clima:</b> ${esc(cond.clima || '—')}</span>
        <span><b>Alerta YPF:</b> ${esc(cond.alertaYpf || '—')}</span>
        <span><b>Temp:</b> ${cond.temperatura != null ? cond.temperatura + '°C' : '—'}</span>
        <span><b>Visibilidad:</b> ${esc(cond.visibilidad || '—')}</span>
      </div>
    </div>

    <!-- HSE -->
    <div class="section">
      <div class="section-title">Novedades HSE</div>
      <div class="hse-box ${hse.sinNovedad ? 'hse-ok' : 'hse-bad'}">
        ${hse.sinNovedad ? '✓ SIN NOVEDAD — Sin incidentes ni cuasi-accidentes en el período.' : '✗ CON NOVEDAD — ' + esc(hse.detalle || '') + (hse.criticidad ? ' · Criticidad: ' + esc(hse.criticidad) : '')}
      </div>
    </div>

    <!-- TAREAS REALIZADAS -->
    <div class="section">
      <div class="section-title">Tareas realizadas — <span>Malla P.A.T.</span></div>
      <table>
        <thead><tr><th>Locación</th><th>Resistencia</th><th>Estado</th><th>Observación</th></tr></thead>
        <tbody>${patRows}</tbody>
      </table>
    </div>

    <div class="section">
      <div class="section-title">Tareas realizadas — <span>Canalizaciones E&I</span></div>
      <table>
        <thead><tr><th>Locación</th><th>Descripción</th><th>Avance</th><th>Obs.</th></tr></thead>
        <tbody>${canalRows}</tbody>
      </table>
    </div>

    ${cupros.length ? `<div class="section">
      <div class="section-title">Tareas realizadas — <span>Protección Catódica</span></div>
      <table>
        <thead><tr><th>PK</th><th>Test Martillo</th><th>Resistencia</th></tr></thead>
        <tbody>${cupros.map(c => `<tr><td class="bold">${esc(c.pk || '—')}</td><td class="${/PASS/i.test(c.martillo||'') ? 'ok' : 'danger'} mono">${esc(c.martillo || '—')}</td><td class="mono">${c.resistencia != null ? c.resistencia + ' mΩ' : '—'}</td></tr>`).join('')}</tbody>
      </table>
    </div>` : ''}

    <div class="section">
      <div class="section-title">Tareas realizadas — <span>Fibra Óptica</span></div>
      <table>
        <thead><tr><th>Actividad</th><th>Hoy</th><th>Acumulado</th></tr></thead>
        <tbody>
          <tr><td class="bold">Pre-tapada FO</td><td class="mono">${foHoy('preTapada')}</td><td class="mono">${foAcum('preTapada')}</td></tr>
          <tr><td class="bold">Tendido FO</td><td class="mono">${foHoy('tendido')}</td><td class="mono">${foAcum('tendido')}</td></tr>
          <tr><td class="bold">Nivelación</td><td class="mono">${foHoy('nivelacion')}</td><td class="mono">${foAcum('nivelacion')}</td></tr>
          <tr><td class="bold">Media tapada + Malla</td><td class="mono">${foHoy('mediaTapada')}</td><td class="mono">${foAcum('mediaTapada')}</td></tr>
          <tr><td class="bold">Tapada final / Coronamiento</td><td class="mono">${foHoy('tapadaFinal')}</td><td class="mono">${foAcum('tapadaFinal')}</td></tr>
        </tbody>
      </table>
      <div class="kv" style="margin-top:2px;">
        ${fo.otdr ? '<span class="ok"><b>OTDR:</b> Realizado</span>' : ''}
        ${fo.bobinas ? '<span><b>Bobinas:</b> ' + fo.bobinas + '</span>' : ''}
        ${fo.empalmes ? '<span><b>Empalmes:</b> ' + fo.empalmes + '</span>' : ''}
        ${fo.observacion ? '<span><b>Obs:</b> ' + esc(fo.observacion) + '</span>' : ''}
      </div>
    </div>

    ${instArr.length ? `<div class="section">
      <div class="section-title">Tareas realizadas — <span>Instrumentación</span></div>
      <table>
        <thead><tr><th>TAG</th><th>Descripción</th><th>Estado</th><th>Obs.</th></tr></thead>
        <tbody>${instArr.slice(0, 20).map(t => `<tr><td class="bold">${esc(t.tag || '')}</td><td>${esc(t.desc || '')}</td><td>${esc(t.estado || '')}</td><td class="obs">${esc((t.obs || '').slice(0, 40))}</td></tr>`).join('')}</tbody>
      </table>
    </div>` : ''}

    <!-- Pendientes Hand Over -->
    ${pends.length ? `<div class="section">
      <div class="section-title">Pendientes — <span>Hand Over</span></div>
      ${pends.map(x => {
        if (typeof x === 'string') return `<div class="pend-item">${esc(x)}</div>`;
        const cls = /Cr[ií]tico/i.test(x.criticidad||'') ? 'badge-crit' : /Alto/i.test(x.criticidad||'') ? 'badge-alto' : /Medio/i.test(x.criticidad||'') ? 'badge-medio' : 'badge-bajo';
        return `<div class="pend-item"><span class="badge ${cls}">${esc(x.criticidad||'Medio')}</span><span>${esc(x.desc||'')}${x.responsable ? ' · <b>' + esc(x.responsable) + '</b>' : ''}</span></div>`;
      }).join('')}
    </div>` : ''}

    <!-- Comunicaciones / Dato del día -->
    ${(ho.comunicacion || ci.novedadOperativa) ? `<div class="dato-dia">
      ${ho.comunicacion ? '<div><b>Comunicaciones:</b> ' + esc(ho.comunicacion) + '</div>' : ''}
      ${ci.novedadOperativa ? '<div><b>Novedad operativa:</b> ' + esc(ci.novedadOperativa) + '</div>' : ''}
    </div>` : ''}

    <!-- Fotos -->
    ${fotos.length ? `<div class="section" style="margin-top:6px;">
      <div class="section-title">Reporte fotográfico (${fotos.length})</div>
      <div class="photo-grid">
        ${fotos.slice(0, 6).map((f, i) => `<div class="ph"><img src="${f.dataUrl || f.src || ''}" alt="Foto ${i+1}" />${f.name ? `<small>${esc(f.name)}</small>` : ''}</div>`).join('')}
      </div>
    </div>` : ''}

    <!-- Firmas -->
    <div class="firmas">
      <div class="firma"><b>Firma Inspector</b><div class="line">${esc(ci.firma || p.inspectorNombre || '')}</div></div>
      <div class="firma"><b>Firma Jefe Insp.</b><div class="line">—</div></div>
      <div class="firma"><b>Firma YPF</b><div class="line">—</div></div>
    </div>

    <div class="footer">
      <span>ID: ${esc(p.id || '—')}</span>
      <span>GTL Inspector — YPF Upstream · GRUPO TERGO LAF</span>
      <span>${new Date().toLocaleString('es-AR')}</span>
    </div>

    <script>
    document.addEventListener('DOMContentLoaded',()=>{
      if(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)){
        var bar=document.createElement('div');bar.className='actions';
        bar.innerHTML='<button class="btn-print" onclick="window.print()">Imprimir / PDF</button>'
          +(navigator.share?'<button class="btn-share" onclick="navigator.share({title:document.title}).catch(()=>{})">Compartir</button>':'');
        document.body.prepend(bar);
      } else { window.print(); }
    });
    <\/script>
    </body></html>`;

    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
    else toast('Permitir pop-ups para exportar PDF', 'warn');
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

    // Service worker � forzar actualizaci�n en cada carga
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").then(reg => {
        // Forzar check de actualizaci�n
        reg.update().catch(() => {});
        // Cuando hay un SW nuevo esperando, activarlo autom�ticamente
        if (reg.waiting) reg.waiting.postMessage({ type: "skip-waiting" });
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          if (nw) nw.addEventListener("statechange", () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller) {
              nw.postMessage({ type: "skip-waiting" });
              toast("App actualizada � recargando...", "ok");
              setTimeout(() => location.reload(), 1500);
            }
          });
        });
      }).catch(err => console.warn("SW reg fail", err));
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
