/* ============================================================
   GTL Inspector — Formulario diario
   Secciones dinámicas según especialidades activas de la obra
   ============================================================ */
(function (global) {
  "use strict";

  const Store = global.GTL.Store;
  const Sync  = global.GTL.Sync;
  const UI    = global.GTL.UI;

  let parte = null;

  /* ---------- Estructura del parte ---------- */
  function emptyParte(obra, inspector) {
    return {
      id: null,
      obraId: obra ? obra.id : null,
      obraNombre: obra ? obra.nombre : "",
      fecha: UI.todayIso(),
      turno: "Mañana",
      inspectorNombre: inspector.nombre,
      inspectorDni: inspector.dni,
      condiciones: {
        clima: "Despejado",
        alertaYpf: "Normal",
        temperatura: "",
        visibilidad: "Buena"
      },
      hse: {
        sinNovedad: true,
        detalle: "",
        criticidad: "Bajo",
        charlas: []
      },
      avances: {},
      handover: {
        pendientes: [],
        noConformidades: [],
        cambiosPrograma: "",
        comunicacion: ""
      },
      cierre: {
        personalEnObra: 0,
        empresas: [],
        fotos: [],
        firma: inspector.nombre,
        timestamp: null
      },
      _enviadoEn: null
    };
  }

  /* ---------- Render principal ---------- */
  function render(view, query) {
    const cfg = Store.getConfig();
    const obra = Store.getObraActiva();
    if (!obra) {
      view.innerHTML = `<div class="empty"><div class="ic">🏗</div><p>Necesitás configurar una obra primero.</p>
        <button class="btn btn-primary" id="goSetup">Crear obra</button></div>`;
      view.querySelector("#goSetup").onclick = () => UI.navigate("/setup-obra");
      return;
    }

    const draft = Store.getDraft();
    if (parte && parte.obraId !== obra.id) parte = null;
    if (!parte) {
      if (draft && draft.data && draft.data.obraId === obra.id) {
        parte = draft.data;
        UI.toast("Borrador recuperado", "ok");
      } else {
        parte = emptyParte(obra, cfg.inspector);
      }
    }

    drawForm(view, obra, cfg);
  }

  function drawForm(view, obra, cfg) {
    view.innerHTML = `
      <div class="form-header">
        <div class="row1">
          <div>
            <div class="obra-name">${esc(obra.nombre)}</div>
            <div class="text-muted fs-12">${esc(cfg.inspector.nombre)} · ${esc(obra.contratista || "")}</div>
          </div>
          ${cfg.obras.length > 1 ? `<select class="input" id="selObra" style="max-width:160px;">
            ${cfg.obras.map(o => `<option value="${o.id}" ${o.id === obra.id ? "selected" : ""}>${esc(o.nombre)}</option>`).join("")}
          </select>` : ""}
        </div>
        <div class="row2">
          <div class="field" style="margin:0;">
            <label class="fs-12">Fecha</label>
            <input class="input" type="date" id="fFecha" value="${parte.fecha}" max="${UI.todayIso()}" />
          </div>
          <div class="field" style="margin:0;">
            <label class="fs-12">Turno</label>
            <div class="segmented" id="fTurno">
              ${["Mañana","Tarde","Noche"].map(t => `<button type="button" data-v="${t}" class="${parte.turno === t ? "active":""}">${t}</button>`).join("")}
            </div>
          </div>
        </div>
      </div>

      <!-- Sección 1: Condiciones -->
      ${sectionCondiciones()}

      <!-- Sección 2: HSE -->
      ${sectionHSE()}

      <!-- Sección 3: Avances por especialidad -->
      <div id="avancesContainer">${renderAvances(obra)}</div>

      <!-- Sección 4: Hand Over -->
      ${sectionHandover()}

      <!-- Sección 5: Cierre -->
      ${sectionCierre()}

      <div class="submit-bar">
        <button class="btn btn-ghost" id="btnDraft">💾 Guardar borrador</button>
        <button class="btn btn-cta grow" id="btnEnviar">ENVIAR PARTE</button>
      </div>
      <div class="text-center mt-2" style="min-height:18px;">
        <span id="autoSaveLbl" class="fs-12 text-muted" style="opacity:0;transition:opacity .5s;"></span>
      </div>
    `;

    bindAll(view, obra, cfg);
  }

  /* ---------- Sección 1 ---------- */
  function sectionCondiciones() {
    const c = parte.condiciones;
    return `
      <div class="card">
        <div class="card-title"><span class="num">1</span> Condiciones</div>
        <div class="field">
          <label>Clima</label>
          <select class="input" id="cClima">
            ${Store.CLIMAS.map(x => `<option ${x === c.clima ? "selected":""}>${x}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>Alerta climática YPF</label>
          <div class="segmented" id="cAlerta">
            ${Store.ALERTAS_YPF.map(x => {
              const cls = x === "Normal" ? "" : x === "Amarilla" ? "warn" : x === "Roja" ? "danger" : "";
              return `<button type="button" data-v="${x}" class="${c.alertaYpf === x ? "active":""}">${x}</button>`;
            }).join("")}
          </div>
        </div>
        <div class="section-grid-2">
          <div class="field">
            <label>Temperatura aprox</label>
            <div class="input-group">
              <input class="input mono" id="cTemp" inputmode="decimal" value="${esc(c.temperatura)}" placeholder="22" />
              <span class="addon">°C</span>
            </div>
          </div>
          <div class="field">
            <label>Visibilidad</label>
            <select class="input" id="cVis">
              ${["Buena","Reducida","Mala"].map(v => `<option ${v === c.visibilidad ? "selected":""}>${v}</option>`).join("")}
            </select>
          </div>
        </div>
      </div>
    `;
  }

  /* ---------- Sección 2 HSE ---------- */
  function sectionHSE() {
    const h = parte.hse;
    return `
      <div class="card">
        <div class="card-title"><span class="num">2</span> HSE</div>
        <div class="field">
          <label>¿Sin novedad?</label>
          <div class="bigtoggle" id="hseToggle">
            <button type="button" class="on-yes ${h.sinNovedad ? "active":""}" data-v="1">SÍ</button>
            <button type="button" class="on-no ${!h.sinNovedad ? "active":""}" data-v="0">NO</button>
          </div>
        </div>
        <div id="hseDetalleWrap" class="${h.sinNovedad ? "hidden" : ""}">
          <div class="field">
            <label>Detalle del incidente / observación</label>
            <textarea class="input" id="hDetalle" placeholder="Describí qué pasó, dónde y cuándo">${esc(h.detalle)}</textarea>
          </div>
          <div class="field">
            <label>Criticidad</label>
            <div class="segmented" id="hCrit">
              ${Store.CRITICIDADES.map(c => `<button type="button" data-v="${c}" class="${h.criticidad === c ? "active":""}">${c}</button>`).join("")}
            </div>
          </div>
        </div>
        <div class="field">
          <label>Charlas / capacitaciones del día</label>
          <div class="dynlist" id="charlasList"></div>
        </div>
      </div>
    `;
  }

  /* ---------- Sección 3: avances por especialidad ---------- */
  function renderAvances(obra) {
    const especialidades = obra.especialidades || [];
    if (especialidades.length === 0) return "";
    const blocks = especialidades.map(key => avanceBlock(key, obra)).join("");
    return `<div class="card">
      <div class="card-title"><span class="num">3</span> Avances por especialidad</div>
      ${blocks}
    </div>`;
  }

  function avanceBlock(key, obra) {
    if (!parte.avances[key]) parte.avances[key] = defaultAvance(key, obra);
    const data = parte.avances[key];
    const meta = Store.ESPECIALIDADES.find(e => e.key === key);
    if (!meta) return "";

    let body = "";
    if (key === "fo")        body = blockFO(data);
    else if (key === "pat")  body = blockPAT(data, obra);
    else if (key === "pc")   body = blockPC(data);
    else if (key === "elec") body = blockTaskList(data, "elec");
    else if (key === "inst") body = blockInstrum(data);
    else if (key === "civ")  body = blockTaskListGeneric(data, "civ");
    else if (key === "mec")  body = blockTaskListGeneric(data, "mec");

    return `<div class="specialty ${key}" data-key="${key}">
      <h4>${meta.icon} ${meta.label}</h4>
      ${body}
    </div>`;
  }

  function defaultAvance(key, obra) {
    if (key === "fo") return {
      preTapadaHoy: 0, preTapadaAcum: 0,
      tendidoHoy: 0,   tendidoAcum: 0, pkInicioDia: 0, pkFinDia: 0,
      nivelacionHoy: 0, nivelacionAcum: 0,
      mediaTapadaHoy: 0, mediaTapadaAcum: 0,
      tapadaFinalHoy: 0, tapadaFinalAcum: 0,
      otdr: false, bobinas: 0,
      empalmes: 0,
      tramos: [],
      observacion: ""
    };
    if (key === "pat") return {
      mediciones: (obra.locaciones || []).map(l => ({ locacion: l, ohm: "", estado: "No iniciada", obs: "" })),
      puntuales: [],
      observacion: ""
    };
    if (key === "pc") return { cupros: [], wennerCount: 0, wennerUbic: "", juntasCount: 0, juntasEstado: "" };
    if (key === "elec") return { tareas: [] };
    if (key === "inst") return { instrumentos: [] };
    if (key === "civ" || key === "mec") return { tareas: [] };
    return {};
  }

  /* ---------- FO ---------- */
  function blockFO(d) {
    return `
      <div class="section-grid-2">
        ${pairMetros("Pre-tapada", "preTapadaHoy", "preTapadaAcum", d)}
        ${pairMetros("Nivelación", "nivelacionHoy", "nivelacionAcum", d)}
        ${pairMetros("Media tapada", "mediaTapadaHoy", "mediaTapadaAcum", d)}
        ${pairMetros("Tapada final", "tapadaFinalHoy", "tapadaFinalAcum", d)}
      </div>
      <div class="field"><label>Tendido FO</label></div>
      <div class="section-grid-2">
        ${pairMetros("Tendido", "tendidoHoy", "tendidoAcum", d)}
        <div></div>
      </div>
      <div class="section-grid-2">
        <div class="field">
          <label>PK inicio del día</label>
          <input class="input mono" data-fo="pkInicioDia" value="${d.pkInicioDia || ""}" inputmode="numeric" />
        </div>
        <div class="field">
          <label>PK fin del día</label>
          <input class="input mono" data-fo="pkFinDia" value="${d.pkFinDia || ""}" inputmode="numeric" />
        </div>
      </div>
      <div class="row-wrap mt-2">
        <label class="check ${d.otdr ? "checked":""}" data-fo-toggle="otdr">
          <input type="checkbox" ${d.otdr ? "checked":""}/> Mediciones OTDR
        </label>
        ${d.otdr ? `<div class="input-group" style="max-width:180px;">
            <input class="input mono" data-fo="bobinas" value="${d.bobinas}" inputmode="numeric" />
            <span class="addon">bobinas</span>
          </div>` : ""}
      </div>
      <div class="section-grid-2 mt-3">
        <div class="field">
          <label>Empalmes ejecutados hoy</label>
          <input class="input mono" data-fo="empalmes" value="${d.empalmes}" inputmode="numeric" />
        </div>
        <div></div>
      </div>
      <div class="field mt-3">
        <label>Tramos por cámara</label>
        <small class="hint">Registrá cada tramo trabajado hoy: cámara inicio → cámara fin, tipo de trabajo.</small>
        <div class="dynlist" id="foTramosList"></div>
      </div>
      <div class="field">
        <label>Observación</label>
        <textarea class="input" data-fo="observacion" placeholder="Notas, atrasos, etc.">${esc(d.observacion)}</textarea>
      </div>
    `;
  }

  function pairMetros(label, kHoy, kAcum, d) {
    return `
      <div class="field">
        <label>${label} hoy (m)</label>
        <input class="input mono" data-fo="${kHoy}" value="${d[kHoy]}" inputmode="numeric" />
      </div>
      <div class="field">
        <label>${label} acumulado (m)</label>
        <input class="input mono" data-fo="${kAcum}" value="${d[kAcum]}" inputmode="numeric" />
      </div>
    `;
  }

  /* ---------- PAT ---------- */
  function blockPAT(d, obra) {
    const estados = ["Liberada", "En proceso", "No iniciada", "Bloqueada"];
    return `
      <table class="tbl">
        <thead><tr><th>Locación</th><th>Ω</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          ${d.mediciones.map((m, i) => {
            const ohm = parseFloat(m.ohm);
            let cls = "";
            if (!isNaN(ohm)) cls = ohm > 2 ? "danger" : ohm > 1.5 ? "warn" : "ok";
            return `<tr data-pat-row="${i}" class="${cls === "danger" ? "danger" : cls === "warn" ? "warn" : ""}">
              <td>${esc(m.locacion)}</td>
              <td><input class="input mono" data-pat-field="ohm" value="${esc(m.ohm)}" inputmode="decimal" placeholder="0.8" style="max-width:90px;" /></td>
              <td><select class="input" data-pat-field="estado">${estados.map(e => `<option ${e === m.estado ? "selected":""}>${e}</option>`).join("")}</select></td>
              <td><input class="input fs-12" data-pat-field="obs" value="${esc(m.obs)}" placeholder="obs." /></td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
      <div class="field mt-3">
        <label>Mediciones puntuales adicionales</label>
        <div class="dynlist" id="patPuntuales"></div>
      </div>
      <div class="field mt-3">
        <label>Descripción de trabajos PAT del día</label>
        <textarea class="input" id="patObservacion" rows="4" placeholder="Describí qué se hizo, avances, interferencias, observaciones generales...">${esc(d.observacion || "")}</textarea>
      </div>
    `;
  }

  /* ---------- PC ---------- */
  function blockPC(d) {
    return `
      <div class="field">
        <label>Cupros ejecutadas hoy</label>
        <div class="dynlist" id="cuprosList"></div>
      </div>
      <div class="section-grid-2">
        <div class="field">
          <label>Mediciones Wenner (cant)</label>
          <input class="input mono" data-pc="wennerCount" value="${d.wennerCount}" inputmode="numeric" />
        </div>
        <div class="field">
          <label>Ubicaciones</label>
          <input class="input" data-pc="wennerUbic" value="${esc(d.wennerUbic)}" placeholder="PK 45+200, ..." />
        </div>
      </div>
      <div class="section-grid-2">
        <div class="field">
          <label>Juntas dieléctricas verificadas</label>
          <input class="input mono" data-pc="juntasCount" value="${d.juntasCount}" inputmode="numeric" />
        </div>
        <div class="field">
          <label>Estado de megado</label>
          <input class="input" data-pc="juntasEstado" value="${esc(d.juntasEstado)}" placeholder="OK / observaciones" />
        </div>
      </div>
    `;
  }

  /* ---------- Eléctrico (lista de tareas tipadas) ---------- */
  function blockTaskList(d, key) {
    return `<div class="field"><div class="dynlist" id="elecList"></div></div>`;
  }

  /* ---------- Instrumentación ---------- */
  function blockInstrum(d) {
    return `<div class="field"><div class="dynlist" id="instList"></div></div>`;
  }

  /* ---------- Civil / Mecánico ---------- */
  function blockTaskListGeneric(d, key) {
    return `<div class="field"><div class="dynlist" id="${key}List"></div></div>`;
  }

  /* ---------- Sección 4 Hand Over ---------- */
  function sectionHandover() {
    return `
      <div class="card">
        <div class="card-title"><span class="num">4</span> Hand Over</div>
        <div class="field">
          <label>Pendientes para mañana</label>
          <div class="dynlist" id="pendList"></div>
        </div>
        <div class="field">
          <label>No conformidades detectadas</label>
          <div class="dynlist" id="ncList"></div>
        </div>
        <div class="field">
          <label>Cambios de programa / interferencias</label>
          <textarea class="input" id="hoCambios" rows="4" placeholder="Describí cambios de programa, interferencias con otras cuadrillas, desvíos al plan...">${esc(parte.handover.cambiosPrograma)}</textarea>
        </div>
        <div class="field">
          <label>Comunicación con cliente / contratistas</label>
          <textarea class="input" id="hoCom" rows="4" placeholder="Reuniones, llamados, acuerdos o directivas recibidas del cliente o contratistas...">${esc(parte.handover.comunicacion)}</textarea>
        </div>
      </div>
    `;
  }

  /* ---------- Sección 5 Cierre ---------- */
  function sectionCierre() {
    const c = parte.cierre;
    return `
      <div class="card">
        <div class="card-title"><span class="num">5</span> Cierre</div>
        <div class="section-grid-2">
          <div class="field">
            <label>Personal en obra</label>
            <input class="input mono" id="cPersonal" value="${c.personalEnObra}" inputmode="numeric" />
          </div>
          <div class="field">
            <label>Firma del inspector</label>
            <input class="input" id="cFirma" value="${esc(c.firma)}" />
          </div>
        </div>
        <div class="field">
          <label>Empresas presentes</label>
          <div class="row-wrap" id="empresasWrap">
            ${Store.CONTRATISTAS_KNOWN.map(e => {
              const ck = c.empresas.includes(e);
              return `<label class="check ${ck ? "checked":""}" data-emp="${e}">
                <input type="checkbox" ${ck ? "checked":""}/> ${esc(e)}
              </label>`;
            }).join("")}
          </div>
        </div>
        <div class="field">
          <label>Fotos del día</label>
          <div class="photo-grid" id="photoGrid"></div>
          <div class="row-wrap mt-2">
            <button type="button" class="btn btn-sm" id="btnPhotoCam">📷 Cámara</button>
            <button type="button" class="btn btn-sm" id="btnPhotoGal">🖼 Galería</button>
          </div>
          <input type="file" id="photoInput" accept="image/*" multiple class="hidden" />
          <input type="file" id="photoInputCam" accept="image/*" capture="environment" multiple class="hidden" />
          <small class="hint">Las fotos se comprimen y guardan en el parte.</small>
        </div>
      </div>
    `;
  }

  /* ---------- Bind general ---------- */
  function bindAll(view, obra, cfg) {
    // Selector obra
    const selObra = view.querySelector("#selObra");
    if (selObra) selObra.onchange = () => {
      Store.setObraActiva(selObra.value);
      parte = null;
      render(view);
    };

    // Header
    view.querySelector("#fFecha").addEventListener("change", e => parte.fecha = e.target.value);
    bindSegmented(view.querySelector("#fTurno"), v => parte.turno = v);

    // Condiciones
    view.querySelector("#cClima").addEventListener("change", e => parte.condiciones.clima = e.target.value);
    bindSegmented(view.querySelector("#cAlerta"), v => parte.condiciones.alertaYpf = v);
    view.querySelector("#cTemp").addEventListener("input", e => parte.condiciones.temperatura = e.target.value);
    view.querySelector("#cVis").addEventListener("change", e => parte.condiciones.visibilidad = e.target.value);

    // HSE
    const hseToggle = view.querySelector("#hseToggle");
    hseToggle.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
      hseToggle.querySelectorAll("button").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      parte.hse.sinNovedad = b.dataset.v === "1";
      const wrap = view.querySelector("#hseDetalleWrap");
      wrap.classList.toggle("hidden", parte.hse.sinNovedad);
    }));
    const hDetalle = view.querySelector("#hDetalle");
    if (hDetalle) hDetalle.addEventListener("input", e => parte.hse.detalle = e.target.value);
    const hCrit = view.querySelector("#hCrit");
    if (hCrit) bindSegmented(hCrit, v => parte.hse.criticidad = v);
    drawCharlas(view);

    // Avances
    bindAvances(view, obra);

    // Handover
    drawPendientes(view);
    drawNoConformidades(view);
    view.querySelector("#hoCambios").addEventListener("input", e => parte.handover.cambiosPrograma = e.target.value);
    view.querySelector("#hoCom").addEventListener("input",     e => parte.handover.comunicacion = e.target.value);

    // Cierre
    view.querySelector("#cPersonal").addEventListener("input", e => parte.cierre.personalEnObra = parseInt(e.target.value || "0", 10));
    view.querySelector("#cFirma").addEventListener("input",    e => parte.cierre.firma = e.target.value);
    view.querySelectorAll("[data-emp]").forEach(lbl => {
      lbl.addEventListener("change", e => {
        const emp = lbl.dataset.emp;
        const ck = e.target.checked;
        parte.cierre.empresas = parte.cierre.empresas.filter(x => x !== emp);
        if (ck) parte.cierre.empresas.push(emp);
        lbl.classList.toggle("checked", ck);
      });
    });
    drawPhotos(view);

    // Submit
    view.querySelector("#btnDraft").onclick = () => {
      Store.saveDraft(parte);
      UI.toast("Borrador guardado ✓", "ok");
    };
    view.querySelector("#btnEnviar").onclick = () => onSubmit(view);

    // Auto-guardado cada 30 segundos
    const autoSaveTimer = setInterval(() => {
      if (parte) {
        Store.saveDraft(parte);
        const lbl = view.querySelector("#autoSaveLbl");
        if (lbl) {
          lbl.textContent = "Auto-guardado " + new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
          lbl.style.opacity = "1";
          setTimeout(() => { lbl.style.opacity = "0"; }, 2000);
        }
      }
    }, 30000);
    // Limpiar el timer cuando se navegue fuera del form
    view._autoSaveTimer = autoSaveTimer;
  }

  function bindSegmented(container, fn) {
    if (!container) return;
    container.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
      container.querySelectorAll("button").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      fn(b.dataset.v);
    }));
  }

  /* ---------- Charlas / pendientes / NCs (listas dinámicas) ---------- */
  function drawCharlas(view) {
    const list = view.querySelector("#charlasList");
    const arr = parte.hse.charlas;
    list.innerHTML = arr.map((c, i) => `
      <div class="row-item" data-i="${i}">
        <input class="input grow" value="${esc(c)}" placeholder="Charla 5'..." />
        <button class="btn-rm" type="button">✕</button>
      </div>`).join("") + `<button class="btn-add" type="button">＋ Agregar charla</button>`;
    list.querySelectorAll(".row-item").forEach(row => {
      const i = +row.dataset.i;
      row.querySelector("input").addEventListener("input", e => arr[i] = e.target.value);
      row.querySelector(".btn-rm").onclick = () => { arr.splice(i, 1); drawCharlas(view); };
    });
    list.querySelector(".btn-add").onclick = () => { arr.push(""); drawCharlas(view); };
  }

  function drawPendientes(view) {
    const list = view.querySelector("#pendList");
    const arr = parte.handover.pendientes;
    list.innerHTML = arr.map((p, i) => `
      <div class="row-item" data-i="${i}" style="flex-wrap:wrap;">
        <input class="input grow" data-f="desc" value="${esc(p.desc)}" placeholder="Descripción" />
        <input class="input fs-14" data-f="resp" value="${esc(p.responsable)}" placeholder="Responsable" style="max-width:140px;" />
        <select class="input fs-14" data-f="crit" style="max-width:110px;">
          ${Store.CRITICIDADES.map(c => `<option ${c === p.criticidad ? "selected":""}>${c}</option>`).join("")}
        </select>
        <button class="btn-rm" type="button">✕</button>
      </div>`).join("") + `<button class="btn-add" type="button">＋ Agregar pendiente</button>`;
    list.querySelectorAll(".row-item").forEach(row => {
      const i = +row.dataset.i;
      row.querySelectorAll("input,select").forEach(el => {
        const evt = el.tagName === "SELECT" ? "change" : "input";
        el.addEventListener(evt, e => {
          const f = el.dataset.f;
          if (f === "desc") arr[i].desc = e.target.value;
          if (f === "resp") arr[i].responsable = e.target.value;
          if (f === "crit") arr[i].criticidad = e.target.value;
        });
      });
      row.querySelector(".btn-rm").onclick = () => { arr.splice(i, 1); drawPendientes(view); };
    });
    list.querySelector(".btn-add").onclick = () => {
      arr.push({ desc: "", responsable: "", criticidad: "Medio" });
      drawPendientes(view);
    };
  }

  function drawNoConformidades(view) {
    const list = view.querySelector("#ncList");
    const arr = parte.handover.noConformidades;
    list.innerHTML = arr.map((n, i) => `
      <div class="row-item" data-i="${i}" style="flex-wrap:wrap;">
        <input class="input grow" data-f="desc" value="${esc(n.desc)}" placeholder="Descripción" />
        <input class="input fs-14" data-f="ubic" value="${esc(n.ubicacion)}" placeholder="Ubicación / PK" style="max-width:140px;" />
        <input class="input fs-14" data-f="acc" value="${esc(n.accion)}" placeholder="Acción correctiva" />
        <button class="btn-rm" type="button">✕</button>
      </div>`).join("") + `<button class="btn-add" type="button">＋ Agregar NC</button>`;
    list.querySelectorAll(".row-item").forEach(row => {
      const i = +row.dataset.i;
      row.querySelectorAll("input").forEach(el => {
        el.addEventListener("input", e => {
          const f = el.dataset.f;
          if (f === "desc") arr[i].desc = e.target.value;
          if (f === "ubic") arr[i].ubicacion = e.target.value;
          if (f === "acc")  arr[i].accion = e.target.value;
        });
      });
      row.querySelector(".btn-rm").onclick = () => { arr.splice(i, 1); drawNoConformidades(view); };
    });
    list.querySelector(".btn-add").onclick = () => {
      arr.push({ desc: "", ubicacion: "", accion: "" });
      drawNoConformidades(view);
    };
  }

  /* ---------- Bind avances específicos ---------- */
  function bindAvances(view, obra) {
    (obra.especialidades || []).forEach(key => {
      const data = parte.avances[key];
      const block = view.querySelector(`.specialty[data-key="${key}"]`);
      if (!block) return;

      if (key === "fo") {
        block.querySelectorAll("[data-fo]").forEach(el => {
          el.addEventListener("input", e => {
            const f = el.dataset.fo;
            const v = el.type === "checkbox" ? el.checked : el.value;
            if (typeof data[f] === "number" || /Hoy|Acum|pk|empalmes|bobinas/i.test(f)) {
              data[f] = parseFloat(v) || 0;
            } else {
              data[f] = v;
            }
          });
        });
        const t = block.querySelector("[data-fo-toggle='otdr']");
        if (t) t.addEventListener("change", (e) => {
          data.otdr = e.target.checked;
          // re-render bloque para mostrar/ocultar bobinas
          const html = avanceBlock("fo", obra);
          const tmp = document.createElement("div");
          tmp.innerHTML = html;
          block.replaceWith(tmp.firstElementChild);
          bindAvances(view, obra);
        });
        if (!data.tramos) data.tramos = [];
        drawFOTramosList(view);
      }

      if (key === "pat") {
        block.querySelectorAll("[data-pat-row]").forEach(row => {
          const i = +row.dataset.patRow;
          row.querySelectorAll("[data-pat-field]").forEach(el => {
            const evt = el.tagName === "SELECT" ? "change" : "input";
            el.addEventListener(evt, () => {
              const f = el.dataset.patField;
              data.mediciones[i][f] = el.value;
              if (f === "ohm") {
                const v = parseFloat(el.value);
                row.classList.remove("danger", "warn");
                if (!isNaN(v)) {
                  if (v > 2) row.classList.add("danger");
                  else if (v > 1.5) row.classList.add("warn");
                }
              }
            });
          });
        });
        drawPatPuntuales(view, key);
        const patObs = block.querySelector("#patObservacion");
        if (patObs) patObs.addEventListener("input", e => { data.observacion = e.target.value; });
      }

      if (key === "pc") {
        block.querySelectorAll("[data-pc]").forEach(el => {
          el.addEventListener("input", e => {
            const f = el.dataset.pc;
            const v = e.target.value;
            data[f] = (/Count$/.test(f)) ? (parseInt(v || "0", 10)) : v;
          });
        });
        drawCuprosList(view);
      }

      if (key === "elec") drawElecList(view);
      if (key === "inst") drawInstList(view);
      if (key === "civ" || key === "mec") drawTareasGenericas(view, key);
    });
  }

  function drawFOTramosList(view) {
    const data = parte.avances.fo;
    const list = view.querySelector("#foTramosList");
    if (!list) return;
    const actividades = ["Soplado tritubo", "Tendido fibra", "Soplado + Tendido"];
    const estados = ["OK", "Parcial", "Con observación", "Pendiente"];
    const obra = Store.getObraActiva();
    const nCams = (obra && obra.nCamarasFO) ? obra.nCamarasFO : 15;
    const cams = Array.from({ length: nCams }, (_, i) => i + 1);
    const camOpts = (val) =>
      `<option value="">—</option>` +
      cams.map(n => `<option value="${n}" ${val == n ? "selected":""}>${n}</option>`).join("") +
      `<option value="Receptora" ${val === "Receptora" ? "selected":""}>Receptora</option>`;

    list.innerHTML = (data.tramos || []).map((tr, i) => `
      <div class="row-item" data-i="${i}" style="flex-wrap:wrap;gap:6px;">
        <div style="display:flex;align-items:center;gap:4px;flex-wrap:nowrap;">
          <select class="input fs-14" data-f="camDesde" style="max-width:110px;" title="Cámara inicio">
            ${camOpts(tr.camDesde)}
          </select>
          <span style="font-size:18px;color:var(--fg-2);">→</span>
          <select class="input fs-14" data-f="camHasta" style="max-width:110px;" title="Cámara fin">
            ${camOpts(tr.camHasta)}
          </select>
        </div>
        <select class="input fs-14" data-f="actividad" style="max-width:180px;">
          ${actividades.map(a => `<option ${a === tr.actividad ? "selected":""}>${a}</option>`).join("")}
        </select>
        <div class="input-group" style="max-width:110px;">
          <input class="input mono" data-f="metros" value="${esc(tr.metros || "")}" inputmode="numeric" placeholder="—" />
          <span class="addon">m</span>
        </div>
        <select class="input fs-14" data-f="estado" style="max-width:130px;">
          ${estados.map(s => `<option ${s === tr.estado ? "selected":""}>${s}</option>`).join("")}
        </select>
        <input class="input grow" data-f="obs" value="${esc(tr.obs || "")}" placeholder="observación" />
        <button class="btn-rm" type="button">✕</button>
      </div>`).join("") + `<button class="btn-add" type="button">＋ Agregar tramo</button>`;
    list.querySelectorAll(".row-item").forEach(row => {
      const i = +row.dataset.i;
      row.querySelectorAll("input,select").forEach(el => {
        const evt = el.tagName === "SELECT" ? "change" : "input";
        el.addEventListener(evt, e => {
          data.tramos[i][el.dataset.f] = e.target.value;
        });
      });
      row.querySelector(".btn-rm").onclick = () => { data.tramos.splice(i, 1); drawFOTramosList(view); };
    });
    list.querySelector(".btn-add").onclick = () => {
      data.tramos.push({ camDesde: "", camHasta: "", actividad: "Soplado tritubo", estado: "OK", obs: "" });
      drawFOTramosList(view);
    };
  }

  function drawPatPuntuales(view) {
    const data = parte.avances.pat;
    const list = view.querySelector("#patPuntuales");
    if (!list) return;
    list.innerHTML = data.puntuales.map((p, i) => `
      <div class="row-item" data-i="${i}" style="flex-wrap:wrap;">
        <input class="input fs-14" data-f="ubic" value="${esc(p.ubicacion)}" placeholder="Ubicación" style="max-width:160px;" />
        <input class="input mono" data-f="ohm" value="${esc(p.ohm)}" inputmode="decimal" placeholder="Ω" style="max-width:90px;" />
        <input class="input grow" data-f="obs" value="${esc(p.obs)}" placeholder="obs." />
        <button class="btn-rm" type="button">✕</button>
      </div>`).join("") + `<button class="btn-add" type="button">＋ Medición puntual</button>`;
    list.querySelectorAll(".row-item").forEach(row => {
      const i = +row.dataset.i;
      row.querySelectorAll("input").forEach(el => {
        el.addEventListener("input", e => {
          const f = el.dataset.f;
          data.puntuales[i][f === "ubic" ? "ubicacion" : f] = e.target.value;
        });
      });
      row.querySelector(".btn-rm").onclick = () => { data.puntuales.splice(i, 1); drawPatPuntuales(view); };
    });
    list.querySelector(".btn-add").onclick = () => {
      data.puntuales.push({ ubicacion: "", ohm: "", obs: "" });
      drawPatPuntuales(view);
    };
  }

  function drawCuprosList(view) {
    const data = parte.avances.pc;
    const list = view.querySelector("#cuprosList");
    if (!list) return;
    list.innerHTML = data.cupros.map((c, i) => `
      <div class="row-item" data-i="${i}" style="flex-wrap:wrap;">
        <input class="input mono" data-f="pk" value="${esc(c.pk)}" placeholder="PK" style="max-width:120px;" inputmode="numeric" />
        <select class="input fs-14" data-f="martillo" style="max-width:130px;">
          <option value="">Martillo</option>
          <option ${c.martillo === "PASS" ? "selected":""}>PASS</option>
          <option ${c.martillo === "FAIL" ? "selected":""}>FAIL</option>
        </select>
        <div class="input-group" style="max-width:140px;">
          <input class="input mono" data-f="resistencia" value="${esc(c.resistencia)}" inputmode="decimal" placeholder="0.5" />
          <span class="addon">mΩ</span>
        </div>
        <button class="btn-rm" type="button">✕</button>
      </div>`).join("") + `<button class="btn-add" type="button">＋ Agregar cupro</button>`;
    list.querySelectorAll(".row-item").forEach(row => {
      const i = +row.dataset.i;
      row.querySelectorAll("input,select").forEach(el => {
        const evt = el.tagName === "SELECT" ? "change" : "input";
        el.addEventListener(evt, e => {
          data.cupros[i][el.dataset.f] = e.target.value;
        });
      });
      row.querySelector(".btn-rm").onclick = () => { data.cupros.splice(i, 1); drawCuprosList(view); };
    });
    list.querySelector(".btn-add").onclick = () => {
      data.cupros.push({ pk: "", martillo: "", resistencia: "" });
      drawCuprosList(view);
    };
  }

  function drawElecList(view) {
    const data = parte.avances.elec;
    const list = view.querySelector("#elecList");
    if (!list) return;
    const tipos = ["Conduit", "Bandeja", "Cableado", "Conexionado", "Megado"];
    list.innerHTML = data.tareas.map((t, i) => `
      <div class="row-item" data-i="${i}" style="flex-wrap:wrap;">
        <input class="input grow" data-f="desc" value="${esc(t.desc)}" placeholder="Descripción" />
        <select class="input fs-14" data-f="tipo" style="max-width:140px;">
          ${tipos.map(x => `<option ${x === t.tipo ? "selected":""}>${x}</option>`).join("")}
        </select>
        <div class="input-group" style="max-width:120px;">
          <input class="input mono" data-f="avance" value="${esc(t.avance)}" inputmode="numeric" placeholder="0" />
          <span class="addon">%</span>
        </div>
        <input class="input fs-14" data-f="obs" value="${esc(t.obs)}" placeholder="obs." />
        <button class="btn-rm" type="button">✕</button>
      </div>`).join("") + `<button class="btn-add" type="button">＋ Agregar tarea</button>`;
    list.querySelectorAll(".row-item").forEach(row => {
      const i = +row.dataset.i;
      row.querySelectorAll("input,select").forEach(el => {
        const evt = el.tagName === "SELECT" ? "change" : "input";
        el.addEventListener(evt, e => {
          data.tareas[i][el.dataset.f] = e.target.value;
        });
      });
      row.querySelector(".btn-rm").onclick = () => { data.tareas.splice(i, 1); drawElecList(view); };
    });
    list.querySelector(".btn-add").onclick = () => {
      data.tareas.push({ desc: "", tipo: "Conduit", avance: 0, obs: "" });
      drawElecList(view);
    };
  }

  function drawInstList(view) {
    const data = parte.avances.inst;
    const list = view.querySelector("#instList");
    if (!list) return;
    const estados = ["En obra", "Montado", "Conexionado", "Precom", "Liberado"];
    list.innerHTML = data.instrumentos.map((t, i) => `
      <div class="row-item" data-i="${i}" style="flex-wrap:wrap;">
        <input class="input mono fs-14" data-f="tag" value="${esc(t.tag)}" placeholder="PIT-604B" style="max-width:140px;" />
        <input class="input grow" data-f="desc" value="${esc(t.desc)}" placeholder="Descripción corta" />
        <select class="input fs-14" data-f="estado" style="max-width:140px;">
          ${estados.map(x => `<option ${x === t.estado ? "selected":""}>${x}</option>`).join("")}
        </select>
        <input class="input fs-14" data-f="obs" value="${esc(t.obs)}" placeholder="obs." />
        <button class="btn-rm" type="button">✕</button>
      </div>`).join("") + `<button class="btn-add" type="button">＋ Agregar instrumento</button>`;
    list.querySelectorAll(".row-item").forEach(row => {
      const i = +row.dataset.i;
      row.querySelectorAll("input,select").forEach(el => {
        const evt = el.tagName === "SELECT" ? "change" : "input";
        el.addEventListener(evt, e => {
          data.instrumentos[i][el.dataset.f] = e.target.value;
        });
      });
      row.querySelector(".btn-rm").onclick = () => { data.instrumentos.splice(i, 1); drawInstList(view); };
    });
    list.querySelector(".btn-add").onclick = () => {
      data.instrumentos.push({ tag: "", desc: "", estado: "En obra", obs: "" });
      drawInstList(view);
    };
  }

  function drawTareasGenericas(view, key) {
    const data = parte.avances[key];
    const list = view.querySelector(`#${key}List`);
    if (!list) return;
    list.innerHTML = data.tareas.map((t, i) => `
      <div class="row-item" data-i="${i}" style="flex-wrap:wrap;">
        <input class="input grow" data-f="desc" value="${esc(t.desc)}" placeholder="Descripción" />
        <div class="input-group" style="max-width:120px;">
          <input class="input mono" data-f="avance" value="${esc(t.avance)}" inputmode="numeric" placeholder="0" />
          <span class="addon">%</span>
        </div>
        <input class="input fs-14" data-f="obs" value="${esc(t.obs)}" placeholder="obs." />
        <button class="btn-rm" type="button">✕</button>
      </div>`).join("") + `<button class="btn-add" type="button">＋ Agregar tarea</button>`;
    list.querySelectorAll(".row-item").forEach(row => {
      const i = +row.dataset.i;
      row.querySelectorAll("input").forEach(el => el.addEventListener("input", e => {
        data.tareas[i][el.dataset.f] = e.target.value;
      }));
      row.querySelector(".btn-rm").onclick = () => { data.tareas.splice(i, 1); drawTareasGenericas(view, key); };
    });
    list.querySelector(".btn-add").onclick = () => {
      data.tareas.push({ desc: "", avance: 0, obs: "" });
      drawTareasGenericas(view, key);
    };
  }

  /* ---------- Fotos ---------- */
  function drawPhotos(view) {
    const grid = view.querySelector("#photoGrid");
    const inpGal = view.querySelector("#photoInput");
    const inpCam = view.querySelector("#photoInputCam");
    const btnCam = view.querySelector("#btnPhotoCam");
    const btnGal = view.querySelector("#btnPhotoGal");

    grid.innerHTML = parte.cierre.fotos.map((f, i) => `
      <div class="ph" style="background-image:url('${f.dataUrl}')" data-i="${i}">
        <button class="rm" type="button">✕</button>
      </div>
    `).join("");

    grid.querySelectorAll(".ph[data-i]").forEach(ph => {
      const i = +ph.dataset.i;
      ph.querySelector(".rm").onclick = (e) => {
        e.stopPropagation();
        parte.cierre.fotos.splice(i, 1);
        drawPhotos(view);
      };
    });

    async function handleFiles(files) {
      for (const file of files) {
        try {
          const dataUrl = await compressImage(file, 1280, 0.78);
          parte.cierre.fotos.push({ name: file.name, dataUrl, addedAt: new Date().toISOString() });
        } catch (e) { UI.toast("Error con la foto: " + e.message, "warn"); }
      }
      drawPhotos(view);
    }

    if (btnCam) btnCam.onclick = () => inpCam.click();
    if (btnGal) btnGal.onclick = () => inpGal.click();

    inpGal.onchange = async () => { await handleFiles(inpGal.files); inpGal.value = ""; };
    inpCam.onchange = async () => { await handleFiles(inpCam.files); inpCam.value = ""; };
  }

  function compressImage(file, maxSize, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement("canvas");
          let { width, height } = img;
          if (width > maxSize || height > maxSize) {
            const ratio = Math.min(maxSize / width, maxSize / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          c.width = width; c.height = height;
          const ctx = c.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          resolve(c.toDataURL("image/jpeg", quality));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /* ---------- Submit ---------- */
  async function onSubmit(view) {
    if (!parte.fecha) return UI.toast("Falta fecha", "warn");
    if (parte.fecha > UI.todayIso()) return UI.toast("La fecha no puede ser futura", "warn");
    if (!parte.hse.sinNovedad && !parte.hse.detalle.trim())
      return UI.toast("Si hay novedad HSE, cargá el detalle", "warn");

    // Validar metros acumulados >= hoy en FO
    const fo = parte.avances.fo;
    if (fo) {
      const pares = [["preTapadaHoy","preTapadaAcum"],["tendidoHoy","tendidoAcum"],
                     ["nivelacionHoy","nivelacionAcum"],["mediaTapadaHoy","mediaTapadaAcum"],
                     ["tapadaFinalHoy","tapadaFinalAcum"]];
      for (const [h, a] of pares) {
        if ((fo[a] || 0) < (fo[h] || 0))
          return UI.toast(`En FO: el acumulado debe ser ≥ que el de hoy (${h})`, "warn");
      }
      if (fo.pkInicioDia && fo.pkFinDia && fo.pkFinDia < fo.pkInicioDia)
        return UI.toast("FO: PK fin del día debe ser ≥ PK inicio del día", "warn");
    }

    parte.cierre.timestamp = new Date().toISOString();

    const btn = view.querySelector("#btnEnviar");
    btn.disabled = true; btn.textContent = "Enviando...";

    try {
      const res = await Sync.submitParte(parte);
      Store.clearDraft();
      if (res.queued) {
        UI.toast("📦 Guardado offline. Se enviará al volver la señal.", "warn", 3500);
      } else {
        UI.toast("✓ Enviado correctamente", "ok");
        UI.vibrate(50);
      }
      parte = null;
      setTimeout(() => UI.navigate("/home"), 600);
    } catch (e) {
      UI.toast("Error: " + e.message, "danger", 4000);
    } finally {
      btn.disabled = false;
      btn.textContent = "ENVIAR PARTE";
    }
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function loadParteForEdit(p) {
    if (!p) return;
    parte = JSON.parse(JSON.stringify(p));
  }

  global.GTL = global.GTL || {};
  global.GTL.Views = global.GTL.Views || {};
  global.GTL.Views.Form = { render, loadParteForEdit };
})(window);
