// Service worker: makes the app installable and usable offline.
// Network first (so a new deploy shows up on the next load), falling back to the cached copy when offline.
// Fonts never change, so they're served from the cache once fetched.
const CACHE = "monkeyscore-v1";
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(["./", "./index.html"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The page sends the files it loaded before this worker took over, so they're available offline too.
self.addEventListener("message", (event) => {
  const urls = event.data?.cache;
  if (Array.isArray(urls)) event.waitUntil(caches.open(CACHE).then((cache) => Promise.all(urls.map((u) => cache.add(u).catch(() => {})))));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (FONT_HOSTS.includes(url.hostname)) return event.respondWith(cacheFirst(request));
  if (url.origin !== self.location.origin) return;
  event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    // (the query string carries shared settings: the page itself is the same)
    const cached = (await cache.match(request, { ignoreSearch: request.mode === "navigate" })) ?? (request.mode === "navigate" && (await cache.match("./")));
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") cache.put(request, response.clone());
  return response;
}
