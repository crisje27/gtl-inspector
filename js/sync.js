/* ============================================================
   GTL Inspector — Sync
   Envío al webhook Apps Script y drenaje de cola IndexedDB
   ============================================================ */
(function (global) {
  "use strict";

  const Store = global.GTL.Store;
  let inFlight = false;
  const listeners = new Set();

  function emit(evt) { listeners.forEach(fn => { try { fn(evt); } catch (e) {} }); }
  function onSync(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  function isOnline() { return navigator.onLine; }

  function buildUrl(base, params) {
    const url = new URL(base);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    return url.toString();
  }

  /* ---------- Envío individual ---------- */
  async function postParte(parte) {
    const cfg = Store.getConfig();
    if (!cfg.backend.webhookUrl) throw new Error("Webhook no configurado");

    const body = JSON.stringify({ action: "addParte", parte });
    // Apps Script no soporta CORS preflight con JSON; usamos text/plain
    const res = await fetch(cfg.backend.webhookUrl, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json().catch(() => ({}));
    if (data.status !== "ok") throw new Error(data.error || "Respuesta inesperada");
    return data;
  }

  /* ---------- Drenar cola ---------- */
  async function drainQueue() {
    if (inFlight) return { skipped: true };
    if (!isOnline()) {
      emit({ type: "offline" });
      return { skipped: true, offline: true };
    }
    inFlight = true;
    let sent = 0, failed = 0;
    try {
      const pending = await Store.listPending();
      emit({ type: "drain-start", count: pending.length });
      for (const item of pending) {
        try {
          const data = await postParte(item.payload);
          await Store.markSent(item.id, data.remoteId || data.id || null);
          sent++;
          emit({ type: "item-sent", id: item.id });
        } catch (err) {
          await Store.markError(item.id, err.message || String(err));
          failed++;
          emit({ type: "item-error", id: item.id, error: err.message });
        }
      }
    } finally {
      inFlight = false;
    }
    emit({ type: "drain-end", sent, failed });
    return { sent, failed };
  }

  /* ---------- Probar conexión ---------- */
  async function testConnection(url) {
    const target = url || (Store.getConfig().backend.webhookUrl);
    if (!target) throw new Error("URL vacía");
    const res = await fetch(buildUrl(target, { action: "ping" }), { method: "GET", mode: "cors" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (data.status !== "ok") throw new Error("Respuesta inválida");
    return data;
  }

  /* ---------- Leer dashboard ---------- */
  async function fetchPartes(obraId, dateFrom, dateTo) {
    const cfg = Store.getConfig();
    if (!cfg.backend.webhookUrl) throw new Error("Webhook no configurado");
    const url = buildUrl(cfg.backend.webhookUrl, {
      action: "listPartes",
      obraId: obraId || "",
      dateFrom: dateFrom || "",
      dateTo: dateTo || ""
    });
    const res = await fetch(url, { method: "GET", mode: "cors" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (data.status !== "ok") throw new Error(data.error || "Error backend");
    return data.partes || [];
  }

  /* ---------- Importar lista de obras ---------- */
  async function fetchObras() {
    const cfg = Store.getConfig();
    if (!cfg.backend.webhookUrl) throw new Error("Webhook no configurado");
    const url = buildUrl(cfg.backend.webhookUrl, { action: "listObras" });
    const res = await fetch(url, { method: "GET", mode: "cors" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (data.status !== "ok") throw new Error(data.error || "Error backend");
    return data.obras || [];
  }

  async function deleteParteRemoto(id, obraId) {
    const cfg = Store.getConfig();
    if (!cfg.backend.webhookUrl) throw new Error("Webhook no configurado");
    const res = await fetch(cfg.backend.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ action: "deleteParte", id: id, obraId: obraId })
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (data.status !== "ok") throw new Error(data.error || "Error backend");
    return true;
  }

  /* ---------- Registrar Background Sync ---------- */
  async function registerBackgroundSync() {
    if (!("serviceWorker" in navigator) || !("SyncManager" in window)) return false;
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.sync.register("gtl-sync");
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------- Enviar (con cola si offline o falla) ---------- */
  async function submitParte(parte) {
    // Siempre encolamos primero (garantiza durabilidad)
    const queued = await Store.enqueueParte(parte);
    if (!isOnline()) {
      registerBackgroundSync();
      emit({ type: "queued", id: queued.id });
      return { queued: true, id: queued.id };
    }
    // Intentamos drenar inmediatamente
    const result = await drainQueue();
    return { queued: result.failed > 0, id: queued.id, sent: result.sent, failed: result.failed };
  }

  /* ---------- Listeners de conexión ---------- */
  function bindNetworkEvents() {
    window.addEventListener("online",  () => { emit({ type: "online" }); drainQueue(); });
    window.addEventListener("offline", () => { emit({ type: "offline" }); });

    // Mensajes desde el SW pidiendo sincronizar
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", (ev) => {
        if (ev.data && ev.data.type === "sync-now") drainQueue();
      });
    }
  }

  global.GTL = global.GTL || {};
  global.GTL.Sync = {
    submitParte, drainQueue, testConnection, fetchPartes, fetchObras, deleteParteRemoto,
    onSync, isOnline, registerBackgroundSync, bindNetworkEvents
  };
})(window);
