const CACHE_NAME = "football-score-v1.3.1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./cloud-config.js",
  "./cloud-sync.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

const WRONG_SUPABASE_REF = "tseniigzftrxvqaspnnp";
const CORRECT_SUPABASE_REF = "tseniigzftrxvqasprnp";

async function correctedCloudConfig(request) {
  const response = await fetch(request, { cache: "no-store" });
  if (!response.ok) return response;
  const text = (await response.text()).replaceAll(WRONG_SUPABASE_REF, CORRECT_SUPABASE_REF);
  return new Response(text, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const files = APP_SHELL.filter((item) => item !== "./cloud-config.js");
    await cache.addAll(files);
    const request = new Request("./cloud-config.js");
    const response = await correctedCloudConfig(request);
    await cache.put(request, response.clone());
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.hostname.endsWith(".supabase.co")) return;

  if (requestUrl.pathname.endsWith("/cloud-config.js")) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await correctedCloudConfig(event.request);
        await cache.put(event.request, response.clone());
        return response;
      } catch {
        return (await cache.match(event.request)) || new Response("", { status: 503 });
      }
    })());
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(async () => (await caches.match(event.request)) || caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
    const cached = await cache.match(event.request);
    const network = fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type !== "opaque") cache.put(event.request, response.clone());
        return response;
      })
      .catch(() => cached || new Response("غير متصل بالإنترنت", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }));
    return cached || network;
  }));
});
