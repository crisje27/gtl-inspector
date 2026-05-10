/* ============================================================
   GTL Inspector — Onboarding (wizard 4 pasos) + alta de obra
   ============================================================ */
(function (global) {
  "use strict";

  const Store = global.GTL.Store;
  const Sync  = global.GTL.Sync;
  const UI    = global.GTL.UI;

  let state = null;

  function init() {
    state = {
      step: 1,
      inspector: Object.assign({}, Store.getConfig().inspector),
      backend:   Object.assign({}, Store.getConfig().backend),
      obra: emptyObra()
    };
  }

  function emptyObra() {
    return {
      nombre: "",
      cliente: "YPF",
      contratista: "",
      numero: "",
      pkInicio: 0,
      pkFin: 0,
      locaciones: [],
      especialidades: [],
      especialidadOtra: ""
    };
  }

  /* ---------- Render principal del wizard ---------- */
  function render(view) {
    if (!state) init();
    view.innerHTML = `
      <section class="setup-hero">
        <h1>GTL Inspector</h1>
        <p>Sistema de inspección E&amp;I — YPF Upstream</p>
      </section>

      <div class="stepper" id="stepper"></div>

      <div id="wizardBody"></div>

      <div class="row mt-4">
        <button class="btn btn-ghost" id="btnPrev">← Atrás</button>
        <div class="grow"></div>
        <button class="btn btn-primary" id="btnNext">Siguiente →</button>
      </div>
    `;
    drawStepper(view);
    drawStep(view);
    view.querySelector("#btnPrev").onclick = () => { if (state.step > 1) { state.step--; drawStepper(view); drawStep(view); } };
    view.querySelector("#btnNext").onclick = () => onNext(view);
  }

  function drawStepper(view) {
    const s = view.querySelector("#stepper");
    s.innerHTML = [1,2,3,4].map(n => {
      let cls = "step";
      if (n < state.step) cls += " done";
      else if (n === state.step) cls += " current";
      return `<div class="${cls}"></div>`;
    }).join("");
  }

  function drawStep(view) {
    const body = view.querySelector("#wizardBody");
    const btnNext = view.querySelector("#btnNext");
    const btnPrev = view.querySelector("#btnPrev");
    btnPrev.style.visibility = state.step === 1 ? "hidden" : "visible";
    btnNext.textContent = state.step === 4 ? "COMENZAR ✓" : "Siguiente →";

    if (state.step === 1)      body.innerHTML = stepInspector();
    else if (state.step === 2) body.innerHTML = stepBackend();
    else if (state.step === 3) body.innerHTML = stepObra();
    else                       body.innerHTML = stepResumen();

    bindStep(view);
  }

  function stepInspector() {
    const i = state.inspector;
    return `
      <div class="card">
        <div class="card-title"><span class="num">1</span> Datos del inspector</div>
        <div class="field">
          <label>Nombre completo *</label>
          <input class="input" id="i_nombre" value="${esc(i.nombre)}" placeholder="Cristian Rodriguez" />
        </div>
        <div class="field">
          <label>DNI / Legajo *</label>
          <input class="input" id="i_dni" value="${esc(i.dni)}" inputmode="numeric" placeholder="35.123.456" />
        </div>
        <div class="field">
          <label>Empresa</label>
          <input class="input" id="i_empresa" value="${esc(i.empresa || "GTL")}" />
          <small class="hint">Default: GTL (GRUPO TERGO LAF)</small>
        </div>
        <div class="field">
          <label>Cargo</label>
          <input class="input" id="i_cargo" value="${esc(i.cargo || "Inspector E&I")}" />
        </div>
      </div>
    `;
  }

  function stepBackend() {
    const b = state.backend;
    return `
      <div class="card">
        <div class="card-title"><span class="num">2</span> Conexión Google Sheets</div>
        <p class="text-muted fs-14">Pegá la URL del Web App publicado desde Google Apps Script. Si todavía no lo tenés, abrí el README para ver cómo crearlo.</p>
        <div class="field">
          <label>URL del Apps Script *</label>
          <input class="input mono fs-14" id="b_url" value="${esc(b.webhookUrl || "")}" placeholder="https://script.google.com/macros/s/AKfy.../exec" />
        </div>
        <div class="row">
          <button class="btn" id="btnTest" type="button">Probar conexión</button>
          <span id="testStatus" class="chip muted">Sin probar</span>
        </div>
        <div class="banner info mt-3">
          ℹ Si trabajás <b>offline</b> no es problema: la app encola los partes y los envía cuando vuelve la señal.
        </div>
      </div>
    `;
  }

  function stepObra() {
    const o = state.obra;
    const especialidades = Store.ESPECIALIDADES;
    const canImport = !!(state.backend && state.backend.webhookUrl);
    return `
      ${canImport ? `
      <div class="banner info" style="display:flex;align-items:center;gap:var(--sp-3);justify-content:space-between;flex-wrap:wrap;">
        <span>¿Ya hay obras registradas en el servidor?</span>
        <button class="btn btn-sm" id="btnSetupImportObras">⬇ Importar del servidor</button>
      </div>
      <div id="setupImportStatus" class="fs-14 mt-2 hidden"></div>
      ` : ""}
      <div class="card">
        <div class="card-title"><span class="num">3</span> Primera obra</div>
        <div class="field">
          <label>Nombre de la obra *</label>
          <input class="input" id="o_nombre" value="${esc(o.nombre)}" placeholder="Loop Etapa 2.1" />
        </div>
        <div class="section-grid-2">
          <div class="field">
            <label>Cliente</label>
            <input class="input" id="o_cliente" value="${esc(o.cliente)}" />
          </div>
          <div class="field">
            <label>Contratista</label>
            <input class="input" id="o_contratista" value="${esc(o.contratista)}" placeholder="MILICIC" />
          </div>
        </div>
        <div class="section-grid-2">
          <div class="field">
            <label>N° de obra</label>
            <input class="input" id="o_numero" value="${esc(o.numero)}" placeholder="377" />
          </div>
          <div class="field"><label></label><div></div></div>
        </div>
        <div class="section-grid-2">
          <div class="field">
            <label>PK inicio (m) *</label>
            <input class="input mono" id="o_pki" value="${o.pkInicio || ""}" inputmode="numeric" placeholder="42500" />
          </div>
          <div class="field">
            <label>PK fin (m) *</label>
            <input class="input mono" id="o_pkf" value="${o.pkFin || ""}" inputmode="numeric" placeholder="87633" />
          </div>
        </div>
        <div class="field">
          <label>Locaciones</label>
          <div class="dynlist" id="locList"></div>
        </div>
        <div class="field">
          <label>Especialidades activas *</label>
          <div class="row-wrap">
            ${especialidades.map(e => {
              const checked = o.especialidades.includes(e.key);
              return `<label class="check ${checked ? "checked" : ""}" data-key="${e.key}">
                <input type="checkbox" ${checked ? "checked" : ""} />
                ${e.icon} ${e.label}
              </label>`;
            }).join("")}
          </div>
          <input class="input mt-2" id="o_otra" value="${esc(o.especialidadOtra)}" placeholder="Otra (opcional)" />
        </div>
      </div>
    `;
  }

  function stepResumen() {
    const i = state.inspector, b = state.backend, o = state.obra;
    const espLbl = o.especialidades.map(k => {
      const e = Store.ESPECIALIDADES.find(x => x.key === k);
      return e ? e.label : k;
    });
    if (o.especialidadOtra) espLbl.push(o.especialidadOtra);
    return `
      <div class="card">
        <div class="card-title"><span class="num">4</span> Lista para usar</div>
        <h4 class="text-muted fs-12" style="text-transform:uppercase;letter-spacing:.04em;">Inspector</h4>
        <dl class="kv">
          <dt>Nombre</dt><dd>${esc(i.nombre)}</dd>
          <dt>DNI</dt><dd>${esc(i.dni)}</dd>
          <dt>Empresa</dt><dd>${esc(i.empresa)}</dd>
          <dt>Cargo</dt><dd>${esc(i.cargo)}</dd>
        </dl>
        <h4 class="text-muted fs-12 mt-4" style="text-transform:uppercase;letter-spacing:.04em;">Conexión</h4>
        <dl class="kv">
          <dt>Webhook</dt><dd class="mono fs-12">${b.webhookUrl ? esc(b.webhookUrl) : "<i>(sin configurar)</i>"}</dd>
          <dt>Estado</dt><dd>${b.ok ? "✓ OK" : "<span class='chip warn'>Sin probar</span>"}</dd>
        </dl>
        <h4 class="text-muted fs-12 mt-4" style="text-transform:uppercase;letter-spacing:.04em;">Obra</h4>
        <dl class="kv">
          <dt>Nombre</dt><dd>${esc(o.nombre)}</dd>
          <dt>Cliente</dt><dd>${esc(o.cliente)}</dd>
          <dt>Contratista</dt><dd>${esc(o.contratista || "—")}</dd>
          <dt>N°</dt><dd>${esc(o.numero || "—")}</dd>
          <dt>PK</dt><dd class="mono">${UI.formatPK(o.pkInicio)} → ${UI.formatPK(o.pkFin)}</dd>
          <dt>Distancia</dt><dd>${((o.pkFin - o.pkInicio)/1000).toFixed(2)} km</dd>
          <dt>Locaciones</dt><dd>${o.locaciones.length ? o.locaciones.map(esc).join(", ") : "—"}</dd>
          <dt>Especialidades</dt><dd>${espLbl.length ? espLbl.map(esc).join(", ") : "—"}</dd>
        </dl>
      </div>
      <div class="banner ok">¡Listo! Al apretar <b>COMENZAR</b> se guarda la configuración y arrancás a usar la app.</div>
    `;
  }

  /* ---------- Bind interacciones por paso ---------- */
  function bindStep(view) {
    if (state.step === 1) {
      view.querySelectorAll("#i_nombre,#i_dni,#i_empresa,#i_cargo").forEach(inp => {
        inp.addEventListener("input", (e) => {
          const k = e.target.id.replace(/^i_/, "");
          state.inspector[k] = e.target.value;
        });
      });
    }
    if (state.step === 2) {
      const inp = view.querySelector("#b_url");
      inp.addEventListener("input", () => { state.backend.webhookUrl = inp.value.trim(); state.backend.ok = false; renderTestBadge(view); });
      view.querySelector("#btnTest").onclick = async () => {
        const badge = view.querySelector("#testStatus");
        badge.className = "chip"; badge.textContent = "Probando...";
        try {
          await Sync.testConnection(state.backend.webhookUrl);
          state.backend.ok = true;
          state.backend.lastTest = new Date().toISOString();
          badge.className = "chip ok"; badge.textContent = "✓ Conectado";
        } catch (err) {
          state.backend.ok = false;
          badge.className = "chip danger"; badge.textContent = "✗ " + (err.message || "Error");
        }
      };
    }
    if (state.step === 3) {
      // Importar obras del servidor durante el wizard
      const btnSIO = view.querySelector("#btnSetupImportObras");
      if (btnSIO) btnSIO.onclick = () => setupImportObras(view);

      view.querySelectorAll("#o_nombre,#o_cliente,#o_contratista,#o_numero,#o_otra").forEach(inp => {
        inp.addEventListener("input", e => {
          const map = { o_nombre: "nombre", o_cliente: "cliente", o_contratista: "contratista", o_numero: "numero", o_otra: "especialidadOtra" };
          state.obra[map[e.target.id]] = e.target.value;
        });
      });
      view.querySelector("#o_pki").addEventListener("input", e => state.obra.pkInicio = parseInt(e.target.value || "0", 10));
      view.querySelector("#o_pkf").addEventListener("input", e => state.obra.pkFin    = parseInt(e.target.value || "0", 10));
      view.querySelectorAll("[data-key]").forEach(lbl => {
        lbl.addEventListener("change", (e) => {
          const k = lbl.dataset.key;
          const checked = e.target.checked;
          if (checked && !state.obra.especialidades.includes(k)) state.obra.especialidades.push(k);
          if (!checked) state.obra.especialidades = state.obra.especialidades.filter(x => x !== k);
          lbl.classList.toggle("checked", checked);
        });
      });
      drawLocList(view);
    }
  }

  function drawLocList(view) {
    const list = view.querySelector("#locList");
    if (!list) return;
    list.innerHTML = state.obra.locaciones.map((loc, idx) => `
      <div class="row-item" data-idx="${idx}">
        <input class="input grow" value="${esc(loc)}" placeholder="SCRL-604" />
        <button class="btn-rm" type="button" title="Quitar">✕</button>
      </div>
    `).join("") + `<button class="btn-add" type="button">＋ Agregar locación</button>`;
    list.querySelectorAll(".row-item").forEach(row => {
      const idx = +row.dataset.idx;
      row.querySelector("input").addEventListener("input", e => state.obra.locaciones[idx] = e.target.value);
      row.querySelector(".btn-rm").onclick = () => { state.obra.locaciones.splice(idx, 1); drawLocList(view); };
    });
    list.querySelector(".btn-add").onclick = () => { state.obra.locaciones.push(""); drawLocList(view); };
  }

  async function setupImportObras(view) {
    const btn = view.querySelector("#btnSetupImportObras");
    const status = view.querySelector("#setupImportStatus");
    if (!btn || !status) return;
    btn.disabled = true;
    btn.textContent = "Descargando...";
    status.className = "fs-14 mt-2";
    status.style.color = "";

    try {
      // Usamos la URL ingresada en el paso 2 (aún no guardada en config).
      // La ponemos temporalmente en config para que fetchObras() la encuentre,
      // y la restauramos con un finally para no contaminar el estado guardado.
      const tempCfg = Store.getConfig();
      const savedUrl = tempCfg.backend.webhookUrl;
      let remoteObras;
      try {
        tempCfg.backend.webhookUrl = state.backend.webhookUrl;
        Store.setConfig(tempCfg);
        remoteObras = await Sync.fetchObras();
      } finally {
        tempCfg.backend.webhookUrl = savedUrl;
        Store.setConfig(tempCfg);
      }

      if (!remoteObras.length) {
        status.textContent = "El servidor no tiene obras registradas. Completá el formulario manualmente.";
        status.style.color = "var(--text-muted)";
        btn.disabled = false; btn.textContent = "⬇ Importar del servidor";
        return;
      }

      // Mostrar modal de selección de obra
      const wrap = document.createElement("div");
      wrap.innerHTML = `
        <p class="text-muted fs-14 mb-3">Elegí la obra que vas a inspeccionar:</p>
        <div id="obraPickList" class="col" style="gap:var(--sp-2);max-height:60vh;overflow-y:auto;"></div>
      `;
      const pickList = wrap.querySelector("#obraPickList");
      remoteObras.forEach((o, idx) => {
        const obraBtn = document.createElement("button");
        obraBtn.className = "btn";
        obraBtn.style.cssText = "text-align:left;padding:var(--sp-3);";
        const espIcons = (o.especialidades || []).map(k => {
          const e = Store.ESPECIALIDADES.find(x => x.key === k);
          return e ? e.icon : "";
        }).join(" ");
        obraBtn.innerHTML = `<strong>${esc(o.nombre || "Sin nombre")}</strong><br>
          <small class="text-muted">${esc(o.cliente || "")} · N° ${esc(o.numero || "—")} · ${espIcons}</small>`;
        obraBtn.dataset.idx = idx;
        pickList.appendChild(obraBtn);
      });

      UI.modal({
        title: "Seleccionar obra",
        content: wrap,
        actions: [{ label: "Cancelar", kind: "ghost" }]
      });

      // Cuando el usuario hace click en una obra
      pickList.querySelectorAll("button[data-idx]").forEach(oBtn => {
        oBtn.onclick = () => {
          const ro = remoteObras[+oBtn.dataset.idx];
          // Rellenar state.obra con los datos del servidor
          state.obra.nombre          = ro.nombre || "";
          state.obra.cliente         = ro.cliente || "YPF";
          state.obra.contratista     = ro.contratista || "";
          state.obra.numero          = ro.numero || "";
          state.obra.pkInicio        = Number(ro.pkInicio) || 0;
          state.obra.pkFin           = Number(ro.pkFin) || 0;
          state.obra.locaciones      = Array.isArray(ro.locaciones) ? ro.locaciones : [];
          state.obra.especialidades  = Array.isArray(ro.especialidades) ? ro.especialidades.filter(Boolean) : [];
          state.obra.id              = ro.id || state.obra.id;
          // Cerrar modal y re-renderizar el paso
          document.querySelector(".modal-overlay")?.remove();
          drawStep(view);
          bindStep(view);
          // drawStep recrea el DOM; buscamos el status en el nuevo DOM
          const newStatus = view.querySelector("#setupImportStatus");
          if (newStatus) {
            newStatus.textContent = `✓ "${ro.nombre}" cargada. Revisá los datos y continuá.`;
            newStatus.style.color = "var(--ok)";
            newStatus.className = "fs-14 mt-2";
          }
          UI.toast(`Obra "${ro.nombre}" seleccionada`, "ok");
        };
      });

    } catch (err) {
      status.className = "fs-14 mt-2";
      status.style.color = "var(--danger)";
      status.textContent = "✗ " + (err.message || "Error al conectar con el servidor");
      btn.disabled = false; btn.textContent = "⬇ Importar del servidor";
    }
  }

  function renderTestBadge(view) {
    const badge = view.querySelector("#testStatus");
    if (!badge) return;
    badge.className = "chip muted"; badge.textContent = "Sin probar";
  }

  /* ---------- Validaciones y avance ---------- */
  function onNext(view) {
    if (state.step === 1) {
      if (!state.inspector.nombre.trim()) return UI.toast("Cargá tu nombre", "warn");
      if (!state.inspector.dni.trim()) return UI.toast("Cargá DNI / legajo", "warn");
      state.step = 2; drawStepper(view); drawStep(view); return;
    }
    if (state.step === 2) {
      if (state.backend.webhookUrl) {
        const re = /^https:\/\/script\.google(usercontent)?\.com\/.+/i;
        if (!re.test(state.backend.webhookUrl)) return UI.toast("URL del Apps Script inválida", "warn");
      }
      state.step = 3; drawStepper(view); drawStep(view); return;
    }
    if (state.step === 3) {
      if (!state.obra.nombre.trim()) return UI.toast("Falta nombre de la obra", "warn");
      if (!(state.obra.pkFin > state.obra.pkInicio)) return UI.toast("PK fin debe ser mayor que PK inicio", "warn");
      if (state.obra.especialidades.length === 0 && !state.obra.especialidadOtra.trim())
        return UI.toast("Marcá al menos una especialidad", "warn");
      state.obra.locaciones = state.obra.locaciones.map(s => s.trim()).filter(Boolean);
      state.step = 4; drawStepper(view); drawStep(view); return;
    }
    if (state.step === 4) {
      finish();
    }
  }

  function finish() {
    const cfg = Store.getConfig();
    cfg.inspector = state.inspector;
    cfg.backend = state.backend;
    cfg.onboarded = true;
    Store.setConfig(cfg);
    Store.addObra(state.obra);
    UI.toast("¡Listo! Bienvenido al sistema.", "ok");
    UI.vibrate(50);
    state = null;
    setTimeout(() => global.GTL.Router.navigate("/home"), 200);
  }

  /* ---------- Alta de obra (sin onboarding completo) ---------- */
  function renderObraOnly(view) {
    const tmpState = { obra: emptyObra() };

    function draw() {
      view.innerHTML = `
        <h2>Nueva obra</h2>
        <div class="card" id="cardObra"></div>
        <div class="row mt-3">
          <button class="btn btn-ghost" id="btnCancel">Cancelar</button>
          <div class="grow"></div>
          <button class="btn btn-primary" id="btnSave">Guardar obra</button>
        </div>
      `;
      // Reusamos stepObra
      const prev = state;
      state = { step: 3, obra: tmpState.obra };
      view.querySelector("#cardObra").outerHTML = stepObra();
      bindStep(view);
      state = prev;

      view.querySelector("#btnCancel").onclick = () => global.GTL.Router.navigate("/home");
      view.querySelector("#btnSave").onclick = () => {
        const o = tmpState.obra;
        if (!o.nombre.trim()) return UI.toast("Falta nombre", "warn");
        if (!(o.pkFin > o.pkInicio)) return UI.toast("PK fin > inicio", "warn");
        if (o.especialidades.length === 0 && !o.especialidadOtra.trim()) return UI.toast("Marcá al menos una especialidad", "warn");
        o.locaciones = o.locaciones.map(s => s.trim()).filter(Boolean);
        Store.addObra(o);
        UI.toast("Obra guardada", "ok");
        global.GTL.Router.navigate("/home");
      };
    }
    // Como reutilizamos stepObra que lee state.obra, hacemos un workaround sencillo:
    state = { step: 3, obra: tmpState.obra };
    view.innerHTML = `
      <h2>Nueva obra</h2>
      ${stepObra()}
      <div class="row mt-3">
        <button class="btn btn-ghost" id="btnCancel">Cancelar</button>
        <div class="grow"></div>
        <button class="btn btn-primary" id="btnSave">Guardar obra</button>
      </div>
    `;
    bindStep(view);

    view.querySelector("#btnCancel").onclick = () => global.GTL.Router.navigate("/home");
    view.querySelector("#btnSave").onclick = () => {
      const o = state.obra;
      if (!o.nombre.trim()) return UI.toast("Falta nombre", "warn");
      if (!(o.pkFin > o.pkInicio)) return UI.toast("PK fin > inicio", "warn");
      if (o.especialidades.length === 0 && !o.especialidadOtra.trim()) return UI.toast("Marcá al menos una especialidad", "warn");
      o.locaciones = o.locaciones.map(s => s.trim()).filter(Boolean);
      Store.addObra(o);
      state = null;
      UI.toast("Obra guardada", "ok");
      global.GTL.Router.navigate("/home");
    };
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  global.GTL = global.GTL || {};
  global.GTL.Views = global.GTL.Views || {};
  global.GTL.Views.Setup = { render, renderObraOnly };
})(window);
