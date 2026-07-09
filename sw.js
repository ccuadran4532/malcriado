// Service worker mínimo: permite instalar la app. Como la emisión exige
// internet, NO guardamos datos offline; solo cacheamos la interfaz.
const CACHE = "malcriado-v24";
const ARCHIVOS = ["./", "./index.html", "./styles.css", "./app.js", "./config.js",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/favicon.png", "./img/botella.png", "./manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  // Las llamadas al cerebro (script.google.com): siempre a la red.
  if (e.request.url.includes("script.google")) return;
  // Red primero: siempre carga la última versión de la app; el caché es solo respaldo sin internet.
  e.respondWith(
    fetch(e.request).then((resp) => {
      const copia = resp.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copia)).catch(() => {});
      return resp;
    }).catch(() => caches.match(e.request))
  );
});
