/**
 * Mamãe, me ajuda! — Service Worker
 *
 * Strategy:
 *   - App shell (HTML, CSS, critical JS): cache-first with stale-while-revalidate
 *   - Static assets (icons, fonts): cache-first
 *   - API routes: network-first (sensitive routes: network-only, never cached)
 *   - Offline fallback: /offline page for navigation requests
 *
 * Update: increment CACHE_VERSION on each deploy to bust stale caches.
 */

const CACHE_VERSION = "v1";
const SHELL_CACHE = `shell-${CACHE_VERSION}`;
const ASSET_CACHE = `assets-${CACHE_VERSION}`;
const API_CACHE = `api-${CACHE_VERSION}`;

// Routes that must NEVER be cached
const NEVER_CACHE = [
  /^\/api\/chat($|\?)/,
  /^\/api\/tts($|\?)/,
  /^\/api\/auth\//,
  /^\/api\/conversations\//,
  /^\/api\/_sentry\//,
  /^\/api\/consent($|\?)/,
];

// App shell files to pre-cache
const SHELL_URLS = ["/", "/offline"];

// ─── Install ──────────────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate ─────────────────────────────────────────────────────────────────

self.addEventListener("activate", (event) => {
  const validCaches = new Set([SHELL_CACHE, ASSET_CACHE, API_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !validCaches.has(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── Fetch ────────────────────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Never cache sensitive API routes
  if (NEVER_CACHE.some((re) => re.test(url.pathname))) {
    event.respondWith(fetch(request));
    return;
  }

  // API routes: network-first
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // Static assets (_next/static): cache-first
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  // Icons, screenshots, manifest: cache-first
  if (
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/screenshots/") ||
    url.pathname === "/manifest.json"
  ) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  // Navigation requests (HTML pages): network-first with offline fallback
  if (request.mode === "navigate") {
    event.respondWith(navigationWithFallback(request));
    return;
  }
});

// ─── Strategies ───────────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: "Sem conexão." }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function navigationWithFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    const offlinePage = await caches.match("/offline");
    if (offlinePage) return offlinePage;
    return new Response("Sem conexão", { status: 503 });
  }
}
