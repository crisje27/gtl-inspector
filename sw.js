/* ============================================================
   GTL Inspector — Service Worker
   Estrategia: Cache-First para assets, Network-First para datos
   Background Sync para envíos pendientes
   ============================================================ */

const VERSION = "v2.5.0";
const CACHE_STATIC = `gtl-static-${VERSION}`;
const CACHE_RUNTIME = `gtl-runtime-${VERSION}`;

const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/tokens.css",
  "./css/base.css",
  "./css/components.css",
  "./css/views.css",
  "./js/app.js",
  "./js/store.js",
  "./js/sync.js",
  "./js/lib/chart-helpers.js",
  "./js/views/setup.js",
  "./js/views/form.js",
  "./js/views/dashboard.js",
  "./js/views/settings.js",
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js",
  "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(async (cache) => {
      // Cacheamos uno por uno para tolerar fallos sueltos (CDNs)
      await Promise.all(
        PRECACHE.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => null)
        )
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => ![CACHE_STATIC, CACHE_RUNTIME].includes(k))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

function isAppsScriptUrl(url) {
  return /script\.google(usercontent)?\.com/.test(url);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  // Datos del backend (Apps Script): network-first con fallback cache
  if (isAppsScriptUrl(url.href)) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Otros: cache-first
  event.respondWith(cacheFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.status === 200) {
      const cache = await caches.open(CACHE_RUNTIME);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (err) {
    return cached || new Response("Offline", { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.status === 200) {
      const cache = await caches.open(CACHE_RUNTIME);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ status: "offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" }
    });
  }
}

/* -------- Background Sync --------
   Cuando hay conectividad de nuevo, el cliente dispara
   registration.sync.register('gtl-sync'). El SW intenta drenar
   la cola IndexedDB enviando un mensaje a la app.
*/
self.addEventListener("sync", (event) => {
  if (event.tag === "gtl-sync") {
    event.waitUntil(notifyClientsToSync());
  }
});

async function notifyClientsToSync() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({ type: "sync-now" });
  }
  if (clients.length === 0) {
    // Si no hay clients activos, abrimos uno
    try { await self.clients.openWindow("./"); } catch (e) {}
  }
}

self.addEventListener("message", (event) => {
  if (!event.data) return;
  if (event.data.type === "skip-waiting") self.skipWaiting();
});

/* -------- Push (futuro) -------- */
self.addEventListener("push", (event) => {
  let data = { title: "GTL Inspector", body: "Notificación" };
  try { data = event.data ? event.data.json() : data; } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "icons/icon-192.png",
      badge: "icons/icon-96.png",
      tag: data.tag || "gtl"
    })
  );
});
