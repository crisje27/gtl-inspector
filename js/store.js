/* ============================================================
   GTL Inspector — Store
   localStorage para configuración + IndexedDB para data y cola
   ============================================================ */
(function (global) {
  "use strict";

  const LS_KEY = "gtl_config_v1";
  const LS_DRAFT = "gtl_form_draft_v1";
  const DB_NAME = "gtl_inspector";
  const DB_VER  = 1;

  /* ---------- LocalStorage: configuración global ---------- */
  function getConfig() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return defaultConfig();
      const cfg = JSON.parse(raw);
      // Merge con defaults para tolerar versiones nuevas
      return Object.assign(defaultConfig(), cfg);
    } catch (e) {
      console.warn("config corrupto, reset", e);
      return defaultConfig();
    }
  }

  function setConfig(cfg) {
    localStorage.setItem(LS_KEY, JSON.stringify(cfg));
    return cfg;
  }

  function defaultConfig() {
    return {
      version: 1,
      onboarded: false,
      inspector: {
        nombre: "",
        dni: "",
        empresa: "GTL",
        cargo: "Inspector E&I"
      },
      backend: {
        webhookUrl: "",
        lastTest: null,
        ok: false
      },
      obras: [],
      obraActivaId: null,
      ui: {
        darkMode: false,
        notif: false
      }
    };
  }

  function genId(prefix) {
    return (prefix || "id") + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function nowIso() { return new Date().toISOString(); }

  /* ---------- Obras ---------- */
  function addObra(obra) {
    const cfg = getConfig();
    obra.id = obra.id || genId("obra");
    obra.creadaEn = obra.creadaEn || nowIso();
    cfg.obras.push(obra);
    if (!cfg.obraActivaId) cfg.obraActivaId = obra.id;
    setConfig(cfg);
    return obra;
  }

  function updateObra(id, patch) {
    const cfg = getConfig();
    const idx = cfg.obras.findIndex(o => o.id === id);
    if (idx < 0) return null;
    cfg.obras[idx] = Object.assign({}, cfg.obras[idx], patch);
    setConfig(cfg);
    return cfg.obras[idx];
  }

  function removeObra(id) {
    const cfg = getConfig();
    cfg.obras = cfg.obras.filter(o => o.id !== id);
    if (cfg.obraActivaId === id) {
      cfg.obraActivaId = cfg.obras.length ? cfg.obras[0].id : null;
    }
    setConfig(cfg);
  }

  function getObraActiva() {
    const cfg = getConfig();
    return cfg.obras.find(o => o.id === cfg.obraActivaId) || null;
  }

  function setObraActiva(id) {
    const cfg = getConfig();
    cfg.obraActivaId = id;
    setConfig(cfg);
  }

  /* ---------- Drafts del formulario ---------- */
  function saveDraft(data) {
    localStorage.setItem(LS_DRAFT, JSON.stringify({ data, at: nowIso() }));
  }
  function getDraft() {
    try { return JSON.parse(localStorage.getItem(LS_DRAFT) || "null"); }
    catch { return null; }
  }
  function clearDraft() { localStorage.removeItem(LS_DRAFT); }

  /* ---------- IndexedDB (cola + cache de partes) ---------- */
  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = (ev) => {
        const db = ev.target.result;
        if (!db.objectStoreNames.contains("queue")) {
          const s = db.createObjectStore("queue", { keyPath: "id" });
          s.createIndex("status", "status");
          s.createIndex("createdAt", "createdAt");
        }
        if (!db.objectStoreNames.contains("partes")) {
          const s = db.createObjectStore("partes", { keyPath: "id" });
          s.createIndex("obraId", "obraId");
          s.createIndex("fecha", "fecha");
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        // Si otro tab/proceso pide upgrade, cerramos para no bloquearlo
        db.onversionchange = () => { try { db.close(); } catch (e) {} dbPromise = null; };
        // Si se cierra por inactividad / error, reseteamos el promise
        db.onclose = () => { dbPromise = null; };
        resolve(db);
      };
      req.onerror = () => { dbPromise = null; reject(req.error); };
      req.onblocked = () => { dbPromise = null; reject(new Error("DB blocked")); };
    });
    return dbPromise;
  }

  // Ejecuta una operación dentro de una transacción, con UN reintento si la conexión está cerrándose.
  function runTx(storeName, mode, op) {
    const attempt = () => openDb().then(db => new Promise((res, rej) => {
      let txObj;
      try {
        txObj = db.transaction(storeName, mode);
      } catch (e) {
        // Conexión muerta → reset y burbujear para que el wrapper reintente
        dbPromise = null;
        return rej(e);
      }
      const store = txObj.objectStore(storeName);
      let result;
      try {
        result = op(store);
      } catch (e) { return rej(e); }
      txObj.oncomplete = () => res(result instanceof Promise ? result : (result && result.__r != null ? result.__r : result));
      txObj.onerror   = () => rej(txObj.error);
      txObj.onabort   = () => rej(txObj.error || new Error("transaction aborted"));
    }));
    return attempt().catch(err => {
      const msg = String((err && err.message) || err);
      if (/closing|InvalidStateError|database connection is closing/i.test(msg)) {
        dbPromise = null;
        return attempt();
      }
      throw err;
    });
  }

  // Wrapper por compatibilidad — usado por código existente
  function tx(storeName, mode) {
    return openDb().then(db => db.transaction(storeName, mode).objectStore(storeName));
  }

  function idbAdd(storeName, value) {
    return runTx(storeName, "readwrite", (s) => {
      const r = s.add(value);
      const out = { __r: value };
      r.onerror = () => { throw r.error; };
      return out;
    });
  }
  function idbPut(storeName, value) {
    return runTx(storeName, "readwrite", (s) => {
      const r = s.put(value);
      const out = { __r: value };
      r.onerror = () => { throw r.error; };
      return out;
    });
  }
  function idbGet(storeName, key) {
    return runTx(storeName, "readonly", (s) => {
      const out = { __r: null };
      const r = s.get(key);
      r.onsuccess = () => { out.__r = r.result || null; };
      r.onerror = () => { throw r.error; };
      return out;
    });
  }
  function idbDel(storeName, key) {
    return runTx(storeName, "readwrite", (s) => {
      const r = s.delete(key);
      const out = { __r: undefined };
      r.onerror = () => { throw r.error; };
      return out;
    });
  }
  function idbAll(storeName, indexName, query) {
    return runTx(storeName, "readonly", (s) => {
      const out = { __r: [] };
      const src = indexName ? s.index(indexName) : s;
      const r = src.getAll(query || null);
      r.onsuccess = () => { out.__r = r.result || []; };
      r.onerror = () => { throw r.error; };
      return out;
    });
  }
  /* ---------- API queue ---------- */
  async function enqueueParte(parte) {
    if (!parte.id) parte.id = genId("parte");
    const item = {
      id: parte.id,
      payload: parte,
      status: "pending",
      attempts: 0,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    await idbPut("queue", item);
    // También cacheamos como parte (lo veremos en histórico aunque no sincronice)
    await idbPut("partes", Object.assign({}, parte, { id: item.id, _local: true }));
    return item;
  }

  async function listPending() {
    const all = await idbAll("queue", "status", "pending");
    return all || [];
  }

  async function markSent(id, remoteId) {
    const item = await idbGet("queue", id);
    if (!item) return;
    item.status = "sent";
    item.remoteId = remoteId;
    item.updatedAt = nowIso();
    await idbPut("queue", item);
    const parte = await idbGet("partes", id);
    if (parte) {
      parte._local = false;
      parte.remoteId = remoteId;
      await idbPut("partes", parte);
    }
  }

  async function markError(id, errMsg) {
    const item = await idbGet("queue", id);
    if (!item) return;
    item.attempts = (item.attempts || 0) + 1;
    item.lastError = errMsg;
    item.updatedAt = nowIso();
    await idbPut("queue", item);
  }

  async function listPartesLocal(obraId) {
    if (!obraId) return [];
    return await idbAll("partes", "obraId", obraId);
  }

  async function deleteParte(id) {
    await idbDel("partes", id);
    await idbDel("queue", id);
  }

  /* ---------- Backup/Export ---------- */
  function exportBackup() {
    const cfg = getConfig();
    return JSON.stringify({ generatedAt: nowIso(), config: cfg }, null, 2);
  }

  async function importBackup(json) {
    const data = typeof json === "string" ? JSON.parse(json) : json;
    if (!data || !data.config) throw new Error("Backup inválido");
    setConfig(data.config);
    return true;
  }

  function reset() {
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(LS_DRAFT);
  }

  /* ---------- Catálogos por defecto ---------- */
  const ESPECIALIDADES = [
    { key: "fo",   label: "Fibra Óptica",    icon: "🔆" },
    { key: "pat",  label: "Mallas PAT",      icon: "⏚" },
    { key: "pc",   label: "Protección Catódica", icon: "⚡" },
    { key: "elec", label: "Eléctrico",       icon: "🔌" },
    { key: "inst", label: "Instrumentación", icon: "📟" },
    { key: "civ",  label: "Civil",           icon: "⛏" },
    { key: "mec",  label: "Mecánico",        icon: "🔧" }
  ];

  const CONTRATISTAS_KNOWN = ["MILICIC", "Kinkuro", "Techint", "SACDE", "GTL", "YPF", "Otra"];
  const CRITICIDADES = ["Bajo", "Medio", "Alto", "Crítico"];
  const ALERTAS_YPF  = ["Normal", "Amarilla", "Roja", "Negra"];
  const CLIMAS = ["Despejado", "Nublado", "Lluvia leve", "Lluvia fuerte", "Nieve", "Viento fuerte"];

  global.GTL = global.GTL || {};
  global.GTL.Store = {
    getConfig, setConfig, defaultConfig, genId, nowIso,
    addObra, updateObra, removeObra, getObraActiva, setObraActiva,
    saveDraft, getDraft, clearDraft,
    enqueueParte, listPending, markSent, markError,
    listPartesLocal, deleteParte,
    exportBackup, importBackup, reset,
    ESPECIALIDADES, CONTRATISTAS_KNOWN, CRITICIDADES, ALERTAS_YPF, CLIMAS,
    openDb
  };
})(window);
