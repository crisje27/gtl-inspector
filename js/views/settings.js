/* ============================================================
   GTL Inspector — Settings + Histórico + Detalle de parte
   ============================================================ */
(function (global) {
  "use strict";

  const Store = global.GTL.Store;
  const Sync  = global.GTL.Sync;
  const UI    = global.GTL.UI;

  /* ============================================================
   *  CONFIGURACIÓN
   * ============================================================ */
  function render(view) {
    const cfg = Store.getConfig();
    view.innerHTML = `
      <h2>Configuración</h2>

      <!-- Inspector -->
      <div class="card">
        <div class="card-title"><span class="num">1</span> Inspector</div>
        <div class="field">
          <label>Nombre completo</label>
          <input class="input" id="i_nombre" value="${esc(cfg.inspector.nombre)}" />
        </div>
        <div class="field">
          <label>DNI / Legajo</label>
          <input class="input" id="i_dni" value="${esc(cfg.inspector.dni)}" inputmode="numeric" />
        </div>
        <div class="section-grid-2">
          <div class="field">
            <label>Empresa</label>
            <input class="input" id="i_empresa" value="${esc(cfg.inspector.empresa)}" />
          </div>
          <div class="field">
            <label>Cargo</label>
            <input class="input" id="i_cargo" value="${esc(cfg.inspector.cargo)}" />
          </div>
        </div>
        <button class="btn btn-primary" id="saveInspector">Guardar inspector</button>
      </div>

      <!-- Conexión -->
      <div class="card">
        <div class="card-title"><span class="num">2</span> Conexión backend</div>
        <div class="field">
          <label>URL del Apps Script</label>
          <input class="input mono fs-14" id="b_url" value="${esc(cfg.backend.webhookUrl)}" placeholder="https://script.google.com/macros/s/.../exec" />
        </div>
        <div class="row">
          <button class="btn" id="btnTest">Probar conexión</button>
          <span id="testStatus" class="chip ${cfg.backend.ok ? "ok":"muted"}">${cfg.backend.ok ? "✓ Conectado" : "Sin probar"}</span>
        </div>
        <div class="row mt-3">
          <button class="btn btn-primary" id="saveBackend">Guardar URL</button>
          <button class="btn btn-ghost" id="forceSync">Sincronizar ahora</button>
        </div>
      </div>

      <!-- Obras -->
      <div class="card">
        <div class="card-title"><span class="num">3</span> Obras (${cfg.obras.length})</div>
        <div id="obrasList"></div>
        <div class="row-wrap mt-3">
          <button class="btn btn-primary" id="newObra">＋ Nueva obra</button>
          <button class="btn" id="btnImportObras" ${!cfg.backend.webhookUrl ? "disabled title='Primero guardá la URL del backend'" : ""}>
            ⬇ Importar obras del servidor
          </button>
        </div>
        <div id="importObrasStatus" class="fs-14 mt-2 text-muted hidden"></div>
      </div>

      <!-- Preferencias -->
      <div class="card">
        <div class="card-title"><span class="num">4</span> Preferencias</div>
        <div class="row" style="justify-content:space-between;">
          <span>Modo oscuro</span>
          <label class="toggle">
            <input type="checkbox" id="prefDark" ${cfg.ui.darkMode ? "checked":""}/>
            <span class="track"></span>
          </label>
        </div>
        <div class="row mt-3" style="justify-content:space-between;">
          <span>Notificaciones push</span>
          <label class="toggle">
            <input type="checkbox" id="prefNotif" ${cfg.ui.notif ? "checked":""}/>
            <span class="track"></span>
          </label>
        </div>
      </div>

      <!-- Datos -->
      <div class="card">
        <div class="card-title"><span class="num">5</span> Datos y backup</div>
        <div class="row-wrap">
          <button class="btn" id="btnExport">⬇ Exportar backup</button>
          <button class="btn" id="btnImport">⬆ Importar backup</button>
          <button class="btn btn-ghost" id="btnClearCache">Limpiar caché PWA</button>
          <button class="btn btn-danger" id="btnReset">Borrar todos los datos</button>
        </div>
        <input type="file" id="fileImport" accept="application/json" class="hidden" />
      </div>

      <!-- Acerca -->
      <div class="card">
        <div class="card-title"><span class="num">6</span> Acerca de</div>
        <dl class="kv">
          <dt>Versión</dt><dd>1.0.0</dd>
          <dt>Empresa</dt><dd>GRUPO TERGO LAF (GTL)</dd>
          <dt>Cliente</dt><dd>YPF Upstream Neuquén</dd>
          <dt>Director</dt><dd>Luis Francica</dd>
        </dl>
      </div>
    `;

    // --- Inspector
    view.querySelector("#saveInspector").onclick = () => {
      const c = Store.getConfig();
      c.inspector.nombre  = view.querySelector("#i_nombre").value.trim();
      c.inspector.dni     = view.querySelector("#i_dni").value.trim();
      c.inspector.empresa = view.querySelector("#i_empresa").value.trim() || "GTL";
      c.inspector.cargo   = view.querySelector("#i_cargo").value.trim() || "Inspector E&I";
      Store.setConfig(c);
      UI.toast("Inspector actualizado", "ok");
    };

    // --- Backend
    view.querySelector("#btnTest").onclick = async () => {
      const url = view.querySelector("#b_url").value.trim();
      const badge = view.querySelector("#testStatus");
      badge.className = "chip"; badge.textContent = "Probando...";
      try {
        await Sync.testConnection(url);
        badge.className = "chip ok"; badge.textContent = "✓ Conectado";
      } catch (e) {
        badge.className = "chip danger"; badge.textContent = "✗ " + (e.message || "Error");
      }
    };
    view.querySelector("#saveBackend").onclick = () => {
      const c = Store.getConfig();
      c.backend.webhookUrl = view.querySelector("#b_url").value.trim();
      Store.setConfig(c);
      UI.toast("URL guardada", "ok");
      // Habilitar el botón de importar obras si ahora hay URL
      const btnIO = view.querySelector("#btnImportObras");
      if (btnIO && c.backend.webhookUrl) {
        btnIO.disabled = false;
        btnIO.removeAttribute("title");
      }
    };
    view.querySelector("#forceSync").onclick = () => Sync.drainQueue().then(r => {
      if (r.skipped) UI.toast("Sin conexión", "warn");
      else UI.toast(`✓ ${r.sent} enviados, ${r.failed} con error`, r.failed ? "warn" : "ok");
    });

    // --- Obras
    drawObras(view);
    view.querySelector("#newObra").onclick = () => UI.navigate("/setup-obra");

    // --- Importar obras del servidor
    const btnIO = view.querySelector("#btnImportObras");
    if (btnIO) btnIO.onclick = () => importObrasFromBackend(view);

    // --- Preferencias
    view.querySelector("#prefDark").onchange = (e) => {
      const c = Store.getConfig();
      c.ui.darkMode = e.target.checked;
      Store.setConfig(c);
      document.documentElement.classList.toggle("dark", c.ui.darkMode);
    };
    view.querySelector("#prefNotif").onchange = async (e) => {
      const c = Store.getConfig();
      if (e.target.checked) {
        try {
          if ("Notification" in window) {
            const p = await Notification.requestPermission();
            c.ui.notif = (p === "granted");
            if (!c.ui.notif) e.target.checked = false;
          }
        } catch (err) { e.target.checked = false; c.ui.notif = false; }
      } else {
        c.ui.notif = false;
      }
      Store.setConfig(c);
    };

    // --- Backup
    view.querySelector("#btnExport").onclick = () => {
      const blob = new Blob([Store.exportBackup()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `gtl-backup-${UI.todayIso()}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      UI.toast("Backup descargado", "ok");
    };
    const fileInput = view.querySelector("#fileImport");
    view.querySelector("#btnImport").onclick = () => fileInput.click();
    fileInput.onchange = async () => {
      const f = fileInput.files[0]; if (!f) return;
      const txt = await f.text();
      const ok = await UI.confirm("¿Importar este backup? Se reemplaza la configuración actual.", "Importar backup");
      if (!ok) return;
      try {
        await Store.importBackup(txt);
        UI.toast("Backup importado", "ok");
        setTimeout(() => location.reload(), 800);
      } catch (e) {
        UI.toast("Error: " + e.message, "danger");
      }
    };
    view.querySelector("#btnClearCache").onclick = async () => {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      UI.toast("Caché PWA limpiada", "ok");
    };
    view.querySelector("#btnReset").onclick = async () => {
      const ok = await UI.confirm("Esto borra TODA la configuración y datos locales (no toca Google Sheets). ¿Seguro?", "Borrar todo");
      if (!ok) return;
      Store.reset();
      try {
        const db = await Store.openDb();
        ["queue", "partes"].forEach(s => {
          const tx = db.transaction(s, "readwrite");
          tx.objectStore(s).clear();
        });
      } catch (e) {}
      UI.toast("Datos borrados. Recargando...", "warn");
      setTimeout(() => location.reload(), 800);
    };
  }

  async function importObrasFromBackend(view) {
    const btn = view.querySelector("#btnImportObras");
    const status = view.querySelector("#importObrasStatus");
    btn.disabled = true;
    btn.textContent = "Descargando...";
    status.className = "fs-14 mt-2 text-muted";
    status.textContent = "Conectando al servidor...";

    try {
      const remoteObras = await Sync.fetchObras();
      if (!remoteObras.length) {
        status.textContent = "El servidor no tiene obras registradas todavía.";
        btn.disabled = false;
        btn.textContent = "⬇ Importar obras del servidor";
        return;
      }

      const cfg = Store.getConfig();
      const existingIds = new Set((cfg.obras || []).map(o => o.id));
      let added = 0, updated = 0;

      remoteObras.forEach(ro => {
        // Normalizar campos opcionales que pueden llegar vacíos del backend
        const obra = {
          id:            ro.id || ("obra_" + Date.now() + Math.random().toString(36).slice(2)),
          nombre:        ro.nombre || "Sin nombre",
          cliente:       ro.cliente || "YPF",
          contratista:   ro.contratista || "",
          numero:        ro.numero || "",
          pkInicio:      Number(ro.pkInicio) || 0,
          pkFin:         Number(ro.pkFin) || 0,
          locaciones:    Array.isArray(ro.locaciones) ? ro.locaciones : [],
          especialidades: Array.isArray(ro.especialidades) ? ro.especialidades.filter(Boolean) : []
        };

        if (existingIds.has(obra.id)) {
          // Actualiza datos que el servidor pudo haber cambiado (nombre, PK, etc.)
          // pero no pisa especialidades si la local tiene más
          Store.updateObra(obra.id, {
            nombre:      obra.nombre,
            cliente:     obra.cliente,
            contratista: obra.contratista,
            numero:      obra.numero,
            pkInicio:    obra.pkInicio,
            pkFin:       obra.pkFin,
            locaciones:  obra.locaciones,
            // Fusionar especialidades: union de ambas listas
            especialidades: Array.from(new Set([
              ...(cfg.obras.find(o => o.id === obra.id)?.especialidades || []),
              ...obra.especialidades
            ]))
          });
          updated++;
        } else {
          Store.addObra(obra);
          added++;
        }
      });

      // Si no hay obra activa todavía, activar la primera importada
      const cfgFresh = Store.getConfig();
      if (!cfgFresh.obraActivaId && cfgFresh.obras.length) {
        Store.setObraActiva(cfgFresh.obras[0].id);
      }

      status.className = "fs-14 mt-2";
      status.style.color = "var(--ok)";
      if (added > 0 && updated > 0) {
        status.textContent = `✓ ${added} obras nuevas importadas, ${updated} actualizadas.`;
      } else if (added > 0) {
        status.textContent = `✓ ${added} obras nuevas importadas.`;
      } else {
        status.textContent = `✓ Todas las obras ya estaban al día (${updated} actualizadas).`;
      }

      UI.toast(added ? `✓ ${added} obras importadas` : "Obras ya actualizadas", "ok");
      drawObras(view);                     // refrescar lista
      // Re-habilitar botón con texto normal
      btn.disabled = false;
      btn.textContent = "⬇ Importar obras del servidor";

    } catch (err) {
      status.className = "fs-14 mt-2";
      status.style.color = "var(--danger)";
      status.textContent = "✗ " + (err.message || "Error de conexión");
      btn.disabled = false;
      btn.textContent = "⬇ Importar obras del servidor";
      UI.toast("Error al importar: " + (err.message || "sin conexión"), "danger");
    }
  }

  function drawObras(view) {
    const cfg = Store.getConfig();
    const list = view.querySelector("#obrasList");
    if (!cfg.obras.length) {
      list.innerHTML = `<div class="empty"><p>No hay obras cargadas.</p></div>`;
      return;
    }
    list.innerHTML = cfg.obras.map(o => {
      const activa = (o.id === cfg.obraActivaId);
      const total = (o.pkFin - o.pkInicio) / 1000;
      const espLbl = (o.especialidades || []).map(k => {
        const e = Store.ESPECIALIDADES.find(x => x.key === k); return e ? e.icon : "";
      }).join(" ");
      return `<div class="card" style="margin-bottom:10px;${activa ? "border-color:var(--ypf-blue);" : ""}" data-obra="${o.id}">
        <div class="row" style="justify-content:space-between;align-items:flex-start;">
          <div>
            <h4 style="margin:0;">${esc(o.nombre)} ${activa ? '<span class="badge">Activa</span>' : ""}</h4>
            <div class="text-muted fs-12">${esc(o.cliente)} · ${esc(o.contratista || "—")} · N° ${esc(o.numero || "—")}</div>
            <div class="mono fs-12 text-muted">${UI.formatPK(o.pkInicio)} → ${UI.formatPK(o.pkFin)} · ${total.toFixed(2)} km</div>
            <div class="fs-14 mt-2">${espLbl}</div>
          </div>
        </div>
        <div class="row-wrap mt-3">
          ${!activa ? `<button class="btn btn-sm" data-act="activar">Activar</button>` : ""}
          <button class="btn btn-sm" data-act="editar">✎ Editar</button>
          <button class="btn btn-sm btn-danger" data-act="eliminar">🗑 Eliminar</button>
        </div>
      </div>`;
    }).join("");

    list.querySelectorAll("[data-obra]").forEach(card => {
      const id = card.dataset.obra;
      const btnA = card.querySelector("[data-act='activar']");
      const btnE = card.querySelector("[data-act='editar']");
      const btnD = card.querySelector("[data-act='eliminar']");
      if (btnA) btnA.onclick = () => { Store.setObraActiva(id); UI.toast("Obra activada", "ok"); render(view); };
      if (btnE) btnE.onclick = () => editObra(id);
      if (btnD) btnD.onclick = async () => {
        const ok = await UI.confirm("¿Querés borrar esta obra? Los partes en Sheets quedan, pero la obra desaparece de la app.", "Eliminar obra");
        if (!ok) return;
        Store.removeObra(id);
        UI.toast("Obra eliminada", "ok");
        render(view);
      };
    });
  }

  function editObra(id) {
    const obra = Store.getConfig().obras.find(o => o.id === id);
    if (!obra) return;
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <div class="field">
        <label>Nombre</label>
        <input class="input" id="e_nombre" value="${esc(obra.nombre)}"/>
      </div>
      <div class="section-grid-2">
        <div class="field"><label>Cliente</label><input class="input" id="e_cliente" value="${esc(obra.cliente)}"/></div>
        <div class="field"><label>Contratista</label><input class="input" id="e_contratista" value="${esc(obra.contratista || "")}"/></div>
      </div>
      <div class="section-grid-2">
        <div class="field"><label>N° de obra</label><input class="input" id="e_numero" value="${esc(obra.numero || "")}"/></div>
      </div>
      <div class="section-grid-2">
        <div class="field"><label>PK inicio (m)</label><input class="input mono" id="e_pki" value="${obra.pkInicio}" inputmode="numeric"/></div>
        <div class="field"><label>PK fin (m)</label><input class="input mono" id="e_pkf" value="${obra.pkFin}" inputmode="numeric"/></div>
      </div>
      <div class="field">
        <label>Locaciones (separadas por coma)</label>
        <input class="input" id="e_loc" value="${esc((obra.locaciones || []).join(", "))}"/>
      </div>
      <div class="field">
        <label>Especialidades</label>
        <div class="row-wrap">
          ${Store.ESPECIALIDADES.map(e => {
            const ck = (obra.especialidades || []).includes(e.key);
            return `<label class="check ${ck ? "checked" : ""}" data-key="${e.key}">
              <input type="checkbox" ${ck ? "checked" : ""}/> ${e.icon} ${e.label}
            </label>`;
          }).join("")}
        </div>
      </div>
    `;
    UI.modal({
      title: "Editar obra",
      content: wrap,
      actions: [
        { label: "Cancelar", kind: "ghost" },
        { label: "Guardar", kind: "primary", onClick: (close) => {
          const patch = {
            nombre:      wrap.querySelector("#e_nombre").value.trim(),
            cliente:     wrap.querySelector("#e_cliente").value.trim(),
            contratista: wrap.querySelector("#e_contratista").value.trim(),
            numero:      wrap.querySelector("#e_numero").value.trim(),
            pkInicio:    parseInt(wrap.querySelector("#e_pki").value || "0", 10),
            pkFin:       parseInt(wrap.querySelector("#e_pkf").value || "0", 10),
            locaciones:  wrap.querySelector("#e_loc").value.split(",").map(s => s.trim()).filter(Boolean),
            especialidades: Array.from(wrap.querySelectorAll("[data-key]"))
              .filter(l => l.querySelector("input").checked).map(l => l.dataset.key)
          };
          if (!patch.nombre) return UI.toast("Falta nombre", "warn");
          if (!(patch.pkFin > patch.pkInicio)) return UI.toast("PK fin > inicio", "warn");
          Store.updateObra(id, patch);
          close();
          UI.toast("Obra actualizada", "ok");
          const view = document.getElementById("view");
          render(view);
        } }
      ]
    });
    wrap.querySelectorAll("[data-key]").forEach(lbl => {
      lbl.addEventListener("change", e => lbl.classList.toggle("checked", e.target.checked));
    });
  }

  /* ============================================================
   *  HISTÓRICO
   * ============================================================ */
  function renderHistory(view) {
    const obra = Store.getObraActiva();
    if (!obra) {
      view.innerHTML = `<div class="empty"><p>Configurá una obra primero.</p></div>`;
      return;
    }

    view.innerHTML = `
      <h2>Histórico</h2>
      <div id="histObraTabs"></div>
      <div class="dash-toolbar">
        <input class="input" type="date" id="dFrom" />
        <input class="input" type="date" id="dTo" />
        <button class="btn" id="btnLoad">Buscar</button>
      </div>
      <div class="row-wrap mb-3">
        <button class="btn btn-sm" id="btnAll">Todos</button>
        <button class="btn btn-sm" id="btnLocal">Sólo locales</button>
        <button class="btn btn-sm" id="btnPend">Sólo pendientes</button>
        <button class="btn btn-sm" id="btnCSV">⬇ CSV</button>
      </div>
      <div id="histList"></div>
    `;

    let mode = "all";
    UI.renderObraTabs(view.querySelector("#histObraTabs"), {
      activeId: obra.id,
      onSwitch: () => renderHistory(view)
    });
    view.querySelector("#btnLoad").onclick = load;
    view.querySelector("#btnAll").onclick   = () => { mode = "all";   load(); };
    view.querySelector("#btnLocal").onclick = () => { mode = "local"; load(); };
    view.querySelector("#btnPend").onclick  = () => { mode = "pend";  load(); };
    view.querySelector("#btnCSV").onclick   = () => exportCSV(view, mode);

    async function load() {
      const currentObra = Store.getObraActiva();
      const dFrom = view.querySelector("#dFrom").value;
      const dTo   = view.querySelector("#dTo").value;
      const target = view.querySelector("#histList");
      target.innerHTML = `<div class="sk sk-block mb-3"></div><div class="sk sk-block mb-3"></div>`;

      let partes = [];
      const obraId = currentObra ? currentObra.id : obra.id;

      try {
        if (mode === "local") {
          partes = await Store.listPartesLocal(obraId);
        } else {
          // Traer del backend + combinar con locales pendientes para no perder datos
          let remote = [];
          try {
            remote = await Sync.fetchPartes(obraId, dFrom, dTo);
          } catch (e) {
            UI.toast("Sin conexión backend — datos locales", "warn");
          }
          const local = await Store.listPartesLocal(obraId);
          // Los locales que no están en el backend (pendientes de sync)
          const remoteIds = new Set(remote.map(p => p.id));
          const pendingLocal = local.filter(p => p._local && !remoteIds.has(p.id));
          partes = remote.concat(pendingLocal);
          if (dFrom) partes = partes.filter(p => p.fecha >= dFrom);
          if (dTo)   partes = partes.filter(p => p.fecha <= dTo);
        }
      } catch (e) {
        partes = await Store.listPartesLocal(obraId);
        UI.toast("Error cargando datos", "warn");
      }

      if (mode === "pend") {
        const pend = await Store.listPending();
        const ids = new Set(pend.map(p => p.id));
        partes = partes.filter(p => ids.has(p.id));
      }

      // Deduplicar por id (puede haber duplicados en backend o al combinar fuentes)
      const seen = new Set();
      partes = partes.filter(p => {
        const key = p.id || (p.fecha + "_" + p.turno + "_" + (p.inspectorDni || p.inspectorNombre));
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      partes.sort((a, b) => a.fecha < b.fecha ? 1 : -1);

      if (!partes.length) {
        target.innerHTML = `<div class="empty"><div class="ic">📂</div><p>No hay partes para mostrar.</p></div>`;
        return;
      }

      target.innerHTML = partes.map(p => {
        const isLocal = !!p._local;
        return `
        <div class="history-item" data-id="${esc(p.id)}">
          <div class="date">
            ${UI.formatDate(p.fecha).split("/").slice(0,2).join("/")}
            <small>${esc(p.turno || "")}</small>
          </div>
          <div class="info">
            <b>${esc(p.inspectorNombre || "")} ${isLocal ? '<span class="chip warn fs-12">offline</span>' : ""}</b>
            <span>${esc(p.clima || (p.condiciones && p.condiciones.clima) || "")} · personal: ${p.personalEnObra || (p.cierre && p.cierre.personalEnObra) || 0}</span>
          </div>
          <div class="arrow">›</div>
        </div>`;
      }).join("");

      target.querySelectorAll(".history-item").forEach(it => {
        it.onclick = () => UI.navigate("/parte?id=" + encodeURIComponent(it.dataset.id));
      });

      // Cache local también
      try { window.__lastHist = partes; } catch (e) {}
    }

    function exportCSV() {
      const rows = window.__lastHist || [];
      if (!rows.length) return UI.toast("No hay partes para exportar", "warn");
      const heads = [
        "fecha","turno","inspector","dni","obra","clima","alertaYpf","temperatura",
        "hseSinNovedad","hseDetalle","hseCriticidad","personal","empresas",
        "fo_tendidoAcum","fo_pkFinDia","fo_empalmes","pat_resumen","pc_wennerCount","pc_juntasCount"
      ];
      const csv = [heads.join(",")];
      rows.forEach(p => {
        const fo = (p.avances && p.avances.fo) || {};
        const pc = (p.avances && p.avances.pc) || {};
        const pat = (p.avances && p.avances.pat && p.avances.pat.mediciones) || [];
        const ok = pat.filter(m => parseFloat(m.ohm) > 0 && parseFloat(m.ohm) <= 2).length;
        const danger = pat.filter(m => parseFloat(m.ohm) > 2).length;
        const row = [
          p.fecha, p.turno || "",
          q(p.inspectorNombre), q(p.inspectorDni),
          q(p.obraNombre), q(p.clima || (p.condiciones && p.condiciones.clima)),
          q(p.alertaYpf || (p.condiciones && p.condiciones.alertaYpf)),
          q(p.temperatura || (p.condiciones && p.condiciones.temperatura)),
          (p.hseSinNovedad === false || (p.hse && p.hse.sinNovedad === false)) ? "NO" : "SI",
          q(p.hseDetalle || (p.hse && p.hse.detalle)),
          q(p.hseCriticidad || (p.hse && p.hse.criticidad)),
          (p.personalEnObra || (p.cierre && p.cierre.personalEnObra) || 0),
          q((p.empresas || (p.cierre && (p.cierre.empresas || []).join(", ")))),
          (fo.tendidoAcum || p.fo_tendidoAcum || ""),
          (fo.pkFinDia || p.fo_pkFinDia || ""),
          (fo.empalmes || p.fo_empalmes || ""),
          q(`OK:${pat.length - danger} ALERTA:${danger}`),
          (pc.wennerCount || p.pc_wennerCount || ""),
          (pc.juntasCount || p.pc_juntasCount || "")
        ];
        csv.push(row.join(","));
      });
      const blob = new Blob([csv.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `gtl-historico-${UI.todayIso()}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      UI.toast("CSV descargado", "ok");
    }
    function q(s) { return `"${String(s == null ? "" : s).replace(/"/g, '""')}"`; }

    load();
  }

  /* ============================================================
   *  DETALLE de un parte
   * ============================================================ */
  async function renderParteDetail(view, query) {
    const id = query && query.id;
    if (!id) {
      view.innerHTML = `<div class="empty"><p>Sin id de parte.</p></div>`;
      return;
    }
    view.innerHTML = `<div class="sk sk-block mb-3"></div><div class="sk sk-block mb-3"></div>`;
    let parte = null;
    // 1) cache local primero
    try {
      parte = await Store.openDb().then(db => new Promise((res) => {
        const r = db.transaction("partes", "readonly").objectStore("partes").get(id);
        r.onsuccess = () => res(r.result || null);
        r.onerror = () => res(null);
      }));
    } catch (e) {}
    // 2) si no, intentamos remoto
    if (!parte) {
      try {
        const cfg = Store.getConfig();
        if (cfg.backend.webhookUrl) {
          const url = new URL(cfg.backend.webhookUrl);
          url.searchParams.set("action", "getParte");
          url.searchParams.set("id", id);
          const res = await fetch(url, { mode: "cors" });
          const data = await res.json();
          if (data.status === "ok") parte = data.parte;
        }
      } catch (e) {}
    }

    if (!parte) {
      view.innerHTML = `<div class="empty"><p>No se encontró el parte.</p></div>`;
      return;
    }

    // Merge nested + flat (parte puede venir de IDB anidado o del Sheet flat)
    const tryJsonField = (v, def) => {
      if (Array.isArray(v)) return v;
      if (typeof v === "string") { try { return JSON.parse(v); } catch (e) { return def; } }
      return v != null ? v : def;
    };
    const fo  = Object.assign({}, foFromFlat(parte) || {}, (parte.avances && parte.avances.fo) || {});
    if (!fo.tramos || !fo.tramos.length) fo.tramos = tryJsonField(parte.fo_tramos_json, fo.tramos || []);
    const pat = Object.assign({}, (parte.avances && parte.avances.pat) || {});
    if (!pat.mediciones || !pat.mediciones.length) pat.mediciones = parsePatFlat(parte);
    const pc  = Object.assign({}, (parte.avances && parte.avances.pc) || {});
    if (!pc.cupros || !pc.cupros.length) pc.cupros = parseCuprosFlat(parte);
    if (pc.wennerCount == null && parte.pc_wennerCount != null) pc.wennerCount = parte.pc_wennerCount;
    if (pc.wennerUbic == null  && parte.pc_wennerUbic != null)  pc.wennerUbic  = parte.pc_wennerUbic;
    if (pc.juntasCount == null && parte.pc_juntasCount != null) pc.juntasCount = parte.pc_juntasCount;
    if (pc.juntasEstado == null&& parte.pc_juntasEstado != null) pc.juntasEstado= parte.pc_juntasEstado;
    const elec = Object.assign({}, (parte.avances && parte.avances.elec) || {});
    if (!elec.tareas || !elec.tareas.length) elec.tareas = tryJsonField(parte.elec_tareas_json, []);
    const inst = Object.assign({}, (parte.avances && parte.avances.inst) || {});
    if (!inst.instrumentos || !inst.instrumentos.length) inst.instrumentos = tryJsonField(parte.inst_instrumentos_json, []);
    const civ = Object.assign({}, (parte.avances && parte.avances.civ) || {});
    if (!civ.tareas || !civ.tareas.length) civ.tareas = tryJsonField(parte.civ_tareas_json, []);
    const mec = Object.assign({}, (parte.avances && parte.avances.mec) || {});
    if (!mec.tareas || !mec.tareas.length) mec.tareas = tryJsonField(parte.mec_tareas_json, []);
    // Observación PAT (puede venir como flat o anidada)
    if (!pat.observacion && parte.pat_observacion) pat.observacion = parte.pat_observacion;

    // ¿Qué especialidades trae la obra? Esas son las que renderizamos sí o sí
    const obra = (Store.getConfig().obras || []).find(o => o.id === parte.obraId);
    const espObra = (obra && obra.especialidades) || Object.keys(parte.avances || {});
    const has = (k) => espObra.includes(k);
    const hasFOData = (fo.tendidoAcum || fo.tendidoHoy || (fo.tramos && fo.tramos.length) || fo.empalmes || fo.observacion);
    const hasPATData = (pat.mediciones && pat.mediciones.length) || pat.observacion;
    const hasPCData = (pc.cupros && pc.cupros.length) || pc.wennerCount || pc.juntasCount;
    const hasElecData = elec.tareas && elec.tareas.length;
    const hasInstData = inst.instrumentos && inst.instrumentos.length;
    const hasCivData  = civ.tareas && civ.tareas.length;
    const hasMecData  = mec.tareas && mec.tareas.length;

    view.innerHTML = `
      <div class="row mb-3" style="flex-wrap:wrap;gap:6px;">
        <button class="btn btn-ghost" id="back">← Volver</button>
        <div class="grow"></div>
        <button class="btn btn-primary" id="btnPrint">📄 PDF</button>
        <button class="btn" id="btnEdit">✏ Editar</button>
        <button class="btn btn-danger" id="btnDel">🗑 Eliminar</button>
      </div>

      <h2>Parte del ${UI.formatDate(parte.fecha)}</h2>
      <div class="text-muted mb-3">${esc(parte.turno || "")} · ${esc(parte.inspectorNombre || "")} · ${esc(parte.obraNombre || "")}</div>

      <div class="detail-block">
        <h4>Condiciones</h4>
        <dl class="kv">
          <dt>Clima</dt><dd>${esc(parte.clima || (parte.condiciones && parte.condiciones.clima))}</dd>
          <dt>Alerta YPF</dt><dd>${esc(parte.alertaYpf || (parte.condiciones && parte.condiciones.alertaYpf))}</dd>
          <dt>Temperatura</dt><dd>${esc(parte.temperatura || (parte.condiciones && parte.condiciones.temperatura))} °C</dd>
          <dt>Visibilidad</dt><dd>${esc(parte.visibilidad || (parte.condiciones && parte.condiciones.visibilidad))}</dd>
        </dl>
      </div>

      <div class="detail-block">
        <h4>HSE</h4>
        <dl class="kv">
          <dt>Sin novedad</dt><dd>${(parte.hseSinNovedad === false || (parte.hse && parte.hse.sinNovedad === false)) ? "NO" : "SÍ"}</dd>
          <dt>Detalle</dt><dd>${esc(parte.hseDetalle || (parte.hse && parte.hse.detalle) || "—")}</dd>
          <dt>Criticidad</dt><dd>${esc(parte.hseCriticidad || (parte.hse && parte.hse.criticidad) || "—")}</dd>
          <dt>Charlas</dt><dd>${(parsePendientesField(parte, "hseCharlas") || []).map(esc).join(", ") || "—"}</dd>
        </dl>
      </div>

      ${has("fo")  ? (hasFOData  ? renderFODetail(fo)  : emptySpecialty("🔆 Fibra Óptica", "Sin datos de FO en este parte (tendido / tramos / empalmes vacíos)")) : ""}
      ${has("pat") ? (hasPATData ? renderPATDetail(pat) : emptySpecialty("⏚ Mallas PAT", "Sin mediciones cargadas")) : ""}
      ${has("pc")  ? (hasPCData  ? renderPCDetail(pc)   : emptySpecialty("⚡ Protección Catódica", "Sin cupros / Wenner / juntas cargados")) : ""}
      ${has("elec")? (hasElecData? renderTareasDetail("🔌 Eléctrico", elec.tareas) : emptySpecialty("🔌 Eléctrico", "Sin tareas cargadas")) : ""}
      ${has("inst")? (hasInstData? renderTareasDetail("🎛 Instrumentación", inst.instrumentos, true) : emptySpecialty("🎛 Instrumentación", "Sin instrumentos cargados")) : ""}
      ${has("civ") ? (hasCivData ? renderTareasDetail("🏗 Civil", civ.tareas)        : emptySpecialty("🏗 Civil", "Sin tareas cargadas")) : ""}
      ${has("mec") ? (hasMecData ? renderTareasDetail("⚙ Mecánico", mec.tareas)     : emptySpecialty("⚙ Mecánico", "Sin tareas cargadas")) : ""}

      <div class="detail-block">
        <h4>Hand Over</h4>
        <h5>Pendientes</h5>
        ${listPend(parsePendientes(parte))}
        <h5 class="mt-3">No conformidades</h5>
        ${listNCs(parseNCs(parte))}
        <p class="mt-3"><b>Cambios de programa:</b> ${esc(parte.cambiosPrograma || (parte.handover && parte.handover.cambiosPrograma) || "—")}</p>
        <p><b>Comunicación:</b> ${esc(parte.comunicacion || (parte.handover && parte.handover.comunicacion) || "—")}</p>
      </div>

      <div class="detail-block">
        <h4>Cierre</h4>
        <dl class="kv">
          <dt>Personal</dt><dd>${parte.personalEnObra || (parte.cierre && parte.cierre.personalEnObra) || 0}</dd>
          <dt>Empresas</dt><dd>${esc(parte.empresas || (parte.cierre && (parte.cierre.empresas || []).join(", ")) || "—")}</dd>
          <dt>Firma</dt><dd>${esc(parte.firma || (parte.cierre && parte.cierre.firma) || "—")}</dd>
          <dt>Cierre</dt><dd>${UI.formatDateTime(parte.timestampCierre || (parte.cierre && parte.cierre.timestamp))}</dd>
        </dl>
        ${renderFotos(parte)}
      </div>
    `;

    view.querySelector("#back").onclick = () => history.length > 1 ? history.back() : UI.navigate("/history");
    view.querySelector("#btnPrint").onclick = () => UI.printParte(parte);
    view.querySelector("#btnEdit").onclick = () => {
      const Form = window.GTL && GTL.Views && GTL.Views.Form;
      if (!Form || !Form.loadParteForEdit) { UI.toast("No se pudo abrir el editor", "danger"); return; }
      // Normalizar el parte a la estructura que espera el formulario
      const normal = normalizeForEdit(parte);
      Form.loadParteForEdit(normal);
      UI.navigate("/form");
    };
    view.querySelector("#btnDel").onclick = async () => {
      const cfg = Store.getConfig();
      const hasBackend = !!(cfg.backend && cfg.backend.webhookUrl);
      const wasSynced = !parte._local;
      const msg = wasSynced && hasBackend
        ? "¿Borrar este parte? Se eliminará del dispositivo Y del Google Sheet."
        : wasSynced
        ? "Este parte está sincronizado pero no hay backend configurado para borrarlo del Sheet. Se borra solo del dispositivo."
        : "¿Borrar este parte del dispositivo?";
      const ok = await UI.confirm(msg, "Eliminar");
      if (!ok) return;
      // Si está sincronizado y hay backend, intentar borrar también del Sheet
      if (wasSynced && hasBackend) {
        try {
          await Sync.deleteParteRemoto(id, parte.obraId);
        } catch (e) {
          UI.toast("⚠ Error borrando del Sheet: " + e.message, "danger", 4000);
          return;  // no borrar local si falló el remoto
        }
      }
      await Store.deleteParte(id);
      UI.toast("Parte borrado", "ok");
      UI.navigate("/history");
    };
  }

  // Convierte un parte (que puede venir flat del Sheet o anidado de IDB) a la
  // estructura que el formulario espera (avances.fo / avances.pat / etc.)
  function normalizeForEdit(p) {
    const has = (k) => p.avances && p.avances[k];
    const out = {
      id: p.id,
      obraId: p.obraId,
      obraNombre: p.obraNombre,
      fecha: p.fecha,
      turno: p.turno,
      inspectorNombre: p.inspectorNombre,
      inspectorDni: p.inspectorDni,
      condiciones: p.condiciones || {
        clima: p.clima || "Despejado",
        alertaYpf: p.alertaYpf || "Normal",
        temperatura: p.temperatura || "",
        visibilidad: p.visibilidad || "Buena"
      },
      hse: p.hse || {
        sinNovedad: p.hseSinNovedad !== false,
        detalle: p.hseDetalle || "",
        criticidad: p.hseCriticidad || "Bajo",
        charlas: parsePendientesField(p, "hseCharlas") || []
      },
      avances: p.avances || {},
      handover: p.handover || {
        pendientes: parsePendientes(p),
        noConformidades: parseNCs(p),
        cambiosPrograma: p.cambiosPrograma || "",
        comunicacion: p.comunicacion || ""
      },
      cierre: p.cierre || {
        personalEnObra: p.personalEnObra || 0,
        empresas: typeof p.empresas === "string" ? p.empresas.split(",").map(s => s.trim()).filter(Boolean) : (p.empresas || []),
        fotos: [],
        firma: p.firma || p.inspectorNombre,
        timestamp: p.timestampCierre || null
      },
      _editing: true
    };
    // Helper: parsea un campo que puede venir como string JSON, array o null
    const parseField = (v, def) => {
      if (v == null) return def;
      if (Array.isArray(v)) return v;
      if (typeof v === "string") { try { return JSON.parse(v); } catch (e) { return def; } }
      return v;
    };
    // Reconstruir avances si vinieron flat
    if (!has("fo") && (p.fo_tendidoAcum != null || p.fo_tramos_json)) {
      out.avances.fo = foFromFlat(p);
      out.avances.fo.tramos = parseField(p.fo_tramos_json, []);
    }
    if (!has("pat") && p.pat_mediciones_json) {
      out.avances.pat = {
        mediciones: parseField(p.pat_mediciones_json, []),
        puntuales:  parseField(p.pat_puntuales_json, []),
        observacion: p.pat_observacion || ""
      };
    }
    if (!has("pc") && p.pc_cupros_json) {
      out.avances.pc = {
        cupros: parseField(p.pc_cupros_json, []),
        wennerCount: p.pc_wennerCount || 0,
        wennerUbic: p.pc_wennerUbic || "",
        juntasCount: p.pc_juntasCount || 0,
        juntasEstado: p.pc_juntasEstado || ""
      };
    }
    if (!has("elec") && p.elec_tareas_json) {
      out.avances.elec = { tareas: parseField(p.elec_tareas_json, []) };
    }
    if (!has("inst") && p.inst_instrumentos_json) {
      out.avances.inst = { instrumentos: parseField(p.inst_instrumentos_json, []) };
    }
    if (!has("civ") && p.civ_tareas_json) {
      out.avances.civ = { tareas: parseField(p.civ_tareas_json, []) };
    }
    if (!has("mec") && p.mec_tareas_json) {
      out.avances.mec = { tareas: parseField(p.mec_tareas_json, []) };
    }
    return out;
  }

  function emptySpecialty(titulo, mensaje) {
    return `<div class="detail-block">
      <h4>${titulo}</h4>
      <p style="color:var(--fg-2);font-style:italic;margin:6px 0;">${esc(mensaje)}</p>
    </div>`;
  }

  function renderTareasDetail(titulo, tareas, isInst) {
    if (!tareas || !tareas.length) return "";
    return `<div class="detail-block">
      <h4>${titulo}</h4>
      <table class="tbl">
        <thead><tr>
          ${isInst ? "<th>TAG</th>" : ""}
          <th>Descripción</th>
          <th>${isInst ? "Estado" : "Tipo"}</th>
          ${!isInst ? "<th>Avance</th>" : ""}
          <th>Obs</th>
        </tr></thead>
        <tbody>
          ${tareas.map(t => `<tr>
            ${isInst ? `<td class="mono">${esc(t.tag || "")}</td>` : ""}
            <td>${esc(t.desc || "")}</td>
            <td>${esc(t.tipo || t.estado || "")}</td>
            ${!isInst ? `<td>${t.avance != null ? esc(t.avance) + "%" : "—"}</td>` : ""}
            <td>${esc(t.obs || "—")}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
  }

  function renderFODetail(fo) {
    const r = (k) => fo[k] != null && fo[k] !== "" ? fo[k] : 0;
    const tramosHtml = (fo.tramos && fo.tramos.length) ? `
      <dt>Tramos cámara</dt>
      <dd>
        <table class="tbl" style="margin:4px 0;">
          <thead><tr><th>Desde</th><th>Hasta</th><th>Actividad</th><th>Metros</th><th>Estado</th></tr></thead>
          <tbody>
            ${fo.tramos.map(t => {
              const cls = t.estado === "OK" ? "ok" : t.estado === "Parcial" ? "warn" : "";
              return `<tr class="${cls}">
                <td>Cám ${esc(t.camDesde)}</td>
                <td>${t.camHasta === "Receptora" ? "<b>Receptora</b>" : "Cám " + esc(t.camHasta)}</td>
                <td>${esc(t.actividad)}</td>
                <td>${t.metros ? esc(t.metros) + " m" : "—"}</td>
                <td>${esc(t.estado)}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </dd>` : "";
    return `<div class="detail-block">
      <h4>🔆 Fibra Óptica</h4>
      <dl class="kv">
        <dt>Tendido hoy</dt><dd>${r("tendidoHoy")} m</dd>
        <dt>Tendido acum.</dt><dd>${r("tendidoAcum")} m</dd>
        <dt>PK del día</dt><dd class="mono">${UI.formatPK(r("pkInicioDia"))} → ${UI.formatPK(r("pkFinDia"))}</dd>
        <dt>Pre-tapada</dt><dd>${r("preTapadaHoy")} m / ${r("preTapadaAcum")} m</dd>
        <dt>Nivelación</dt><dd>${r("nivelacionHoy")} m / ${r("nivelacionAcum")} m</dd>
        <dt>Media tapada</dt><dd>${r("mediaTapadaHoy")} m / ${r("mediaTapadaAcum")} m</dd>
        <dt>Tapada final</dt><dd>${r("tapadaFinalHoy")} m / ${r("tapadaFinalAcum")} m</dd>
        <dt>OTDR</dt><dd>${fo.otdr ? `Sí · ${r("bobinas")} bobinas` : "—"}</dd>
        <dt>Empalmes</dt><dd>${r("empalmes")}</dd>
        ${tramosHtml}
        <dt>Observación</dt><dd>${esc(fo.observacion || "—")}</dd>
      </dl>
    </div>`;
  }
  function renderPATDetail(pat) {
    const obs = pat.observacion || "";
    return `<div class="detail-block">
      <h4>⏚ Mallas PAT</h4>
      ${(pat.mediciones && pat.mediciones.length) ? `<table class="tbl">
        <thead><tr><th>Locación</th><th>Ω</th><th>Estado</th><th>Obs</th></tr></thead>
        <tbody>${(pat.mediciones || []).map(m => {
          const v = parseFloat(m.ohm);
          const cls = isNaN(v) ? "" : v > 2 ? "danger" : v > 1.5 ? "warn" : "ok";
          return `<tr>
            <td><b>${esc(m.locacion)}</b></td>
            <td><span class="pat-cell ${cls}">${isNaN(v) ? "—" : v.toFixed(2) + " Ω"}</span></td>
            <td>${esc(m.estado || "")}</td>
            <td>${esc(m.obs || "")}</td>
          </tr>`;
        }).join("")}</tbody>
      </table>` : ""}
      ${obs ? `<p class="mt-3"><b>Descripción de trabajos:</b><br>${esc(obs).replace(/\n/g, "<br>")}</p>` : ""}
    </div>`;
  }
  function renderPCDetail(pc) {
    return `<div class="detail-block">
      <h4>⚡ Protección Catódica</h4>
      <table class="tbl">
        <thead><tr><th>PK</th><th>Martillo</th><th>Resist.</th></tr></thead>
        <tbody>${(pc.cupros || []).map(c => `<tr>
          <td class="mono">${UI.formatPK(parseFloat(c.pk))}</td>
          <td>${(c.martillo + "").toUpperCase() === "FAIL" ? `<span class="badge danger">FAIL</span>` : `<span class="badge ok">PASS</span>`}</td>
          <td class="mono">${esc(c.resistencia || "")} mΩ</td>
        </tr>`).join("")}</tbody>
      </table>
    </div>`;
  }

  function renderFotos(parte) {
    const fotos = (parte.cierre && parte.cierre.fotos) || [];
    if (!fotos.length) return "";
    return `<div class="photo-grid">${fotos.map(f => `<div class="ph" style="background-image:url('${f.dataUrl}')"></div>`).join("")}</div>`;
  }

  function listPend(arr) {
    if (!arr || !arr.length) return `<p class="text-muted">—</p>`;
    return `<table class="tbl"><thead><tr><th>Descripción</th><th>Resp.</th><th>Crit.</th></tr></thead>
      <tbody>${arr.map(x => `<tr>
        <td>${esc(x.desc || "")}</td><td>${esc(x.responsable || "")}</td>
        <td><span class="badge ${/Cr[ií]tico/.test(x.criticidad) ? "danger" : /Alto/.test(x.criticidad) ? "warn" : "muted"}">${esc(x.criticidad || "")}</span></td>
      </tr>`).join("")}</tbody></table>`;
  }
  function listNCs(arr) {
    if (!arr || !arr.length) return `<p class="text-muted">—</p>`;
    return `<table class="tbl"><thead><tr><th>Descripción</th><th>Ubicación</th><th>Acción</th></tr></thead>
      <tbody>${arr.map(x => `<tr>
        <td>${esc(x.desc || "")}</td><td>${esc(x.ubicacion || "")}</td><td>${esc(x.accion || "")}</td>
      </tr>`).join("")}</tbody></table>`;
  }

  function foFromFlat(p) {
    const keys = ["preTapadaHoy","preTapadaAcum","tendidoHoy","tendidoAcum","pkInicioDia","pkFinDia","nivelacionHoy","nivelacionAcum","mediaTapadaHoy","mediaTapadaAcum","tapadaFinalHoy","tapadaFinalAcum","otdr","bobinas","empalmes","observacion"];
    const out = {}; let any = false;
    keys.forEach(k => { const v = p["fo_" + k]; if (v != null && v !== "") { out[k] = v; any = true; } });
    return any ? out : null;
  }
  function parsePatFlat(p) {
    if (typeof p.pat_mediciones_json === "string") {
      try { return JSON.parse(p.pat_mediciones_json); } catch (e) { return []; }
    }
    return Array.isArray(p.pat_mediciones_json) ? p.pat_mediciones_json : [];
  }
  function parseCuprosFlat(p) {
    if (typeof p.pc_cupros_json === "string") {
      try { return JSON.parse(p.pc_cupros_json); } catch (e) { return []; }
    }
    return Array.isArray(p.pc_cupros_json) ? p.pc_cupros_json : [];
  }
  function parsePendientes(p) {
    if (p.handover && Array.isArray(p.handover.pendientes)) return p.handover.pendientes;
    if (Array.isArray(p.pendientes)) return p.pendientes;
    if (typeof p.pendientes === "string") { try { return JSON.parse(p.pendientes); } catch (e) {} }
    return [];
  }
  function parseNCs(p) {
    if (p.handover && Array.isArray(p.handover.noConformidades)) return p.handover.noConformidades;
    if (Array.isArray(p.noConformidades)) return p.noConformidades;
    if (typeof p.noConformidades === "string") { try { return JSON.parse(p.noConformidades); } catch (e) {} }
    return [];
  }
  function parsePendientesField(p, field) {
    if (Array.isArray(p[field])) return p[field];
    if (typeof p[field] === "string") { try { return JSON.parse(p[field]); } catch (e) {} }
    return [];
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  global.GTL = global.GTL || {};
  global.GTL.Views = global.GTL.Views || {};
  global.GTL.Views.Settings = { render, renderHistory, renderParteDetail };
})(window);
