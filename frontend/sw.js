/**
 * Service Worker - Soundwave Studio
 * Handles offline caching with proper 206 partial content handling
 */

const CACHE_NAME = "soundwave-v2.5";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const IS_LOCAL_DEV = LOCAL_HOSTS.has(self.location.hostname);
const CACHE_URLS = [
  "/",
  "/index.html",
  "/player.html",
  "/home.html",
  "/search.html",
  "/library.html",
  "/admin.html",
  "/immersive-theater.html",
  "/Cascading Style Sheets/app.css",
  "/Cascading Style Sheets/style.css",
  "/Cascading Style Sheets/utility.css",
  "/Cascading Style Sheets/immersive-theater.css",
  "/JavaScript/navigation.js",
  "/JavaScript/transition.js",
  "/JavaScript/player.js",
  "/JavaScript/auth.js",
  "/JavaScript/waveform-visualizer.js",
  "/JavaScript/color-theme-controller.js",
  "/JavaScript/player-integration.js",
  "/JavaScript/immersive-theater.js",
  "/img/soundwave.svg",
  "/img/favicon.svg",
];

// Install Service Worker and cache assets
self.addEventListener("install", (event) => {
  if (IS_LOCAL_DEV) {
    event.waitUntil(self.skipWaiting());
    return;
  }

  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log("Caching application assets");

      try {
        await cache.addAll(CACHE_URLS);
      } catch (err) {
        console.warn("Some assets failed to cache:", err);
      }

      return self.skipWaiting();
    })
  );
});

// Clean up old caches
self.addEventListener("activate", (event) => {
  if (IS_LOCAL_DEV) {
    event.waitUntil(
      caches.keys().then(async (cacheNames) => {
        await Promise.all(
          cacheNames
            .filter((cacheName) => cacheName.startsWith("soundwave-"))
            .map((cacheName) => caches.delete(cacheName))
        );
        await self.registration.unregister();
        const clients = await self.clients.matchAll({
          includeUncontrolled: true,
          type: "window",
        });
        await Promise.all(clients.map((client) => client.navigate(client.url)));
      })
    );
    return;
  }

  event.waitUntil(
    caches.keys().then(async (cacheNames) => {
      await Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log("Deleting old cache:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );

      return self.clients.claim();
    })
  );
});

function isRangeRequest(request) {
  return request.headers.has("range");
}

function canCacheResponse(request, response) {
  return (
    request.method === "GET" &&
    !isRangeRequest(request) &&
    response &&
    response.status === 200
  );
}

async function putInCache(request, response, label = "response") {
  if (!canCacheResponse(request, response)) {
    return;
  }

  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  } catch (e) {
    console.debug(`Could not cache ${label}:`, e);
  }
}

// Fetch event - use cache, fallback to network
self.addEventListener("fetch", (event) => {
  if (IS_LOCAL_DEV) {
    return;
  }

  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") {
    return;
  }

  // Skip external origins
  if (url.origin !== self.location.origin) {
    return;
  }

  // Range responses are 206 Partial Content and cannot be stored in Cache API.
  if (isRangeRequest(request)) {
    event.respondWith(fetch(request));
    return;
  }

  // Audio should stay network-only so browsers can negotiate byte ranges.
  if (url.pathname.includes("/songs/")) {
    event.respondWith(fetchAudio(request));
    return;
  }

  // For everything else, use cache-first with network fallback
  event.respondWith(cacheFirst(request));
});

/**
 * Network-only strategy for audio files.
 * Browsers use byte-range requests for media, and Cache API cannot store 206s.
 */
async function fetchAudio(request) {
  try {
    return await fetch(request);
  } catch (error) {
    console.debug("Network request failed for audio:", error);

    // Return offline response
    return new Response(
      new Blob(
        ["Audio file unavailable (offline or network error)"],
        { type: "text/plain" }
      ),
      {
        status: 503,
        statusText: "Service Unavailable",
        headers: new Headers({
          "Content-Type": "text/plain",
        }),
      }
    );
  }
}

/**
 * Cache-first strategy for static assets
 */
async function cacheFirst(request) {
  try {
    // Try cache first
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Fall back to network
    const response = await fetch(request);

    await putInCache(request, response);
    return response;
  } catch (error) {
    console.debug("Cache-first failed for:", request.url, error);

    // Return offline page or error response
    return new Response(
      new Blob(
        [
          `<html>
        <head>
          <title>Offline</title>
          <style>
            body { font-family: sans-serif; padding: 20px; background: #0b0f14; color: #fff; }
            h1 { color: #3ddc84; }
          </style>
        </head>
        <body>
          <h1>Offline</h1>
          <p>You're currently offline. Please check your connection and try again.</p>
          <p><a href="/">Go to home page</a></p>
        </body>
      </html>`,
        ],
        { type: "text/html" }
      ),
      {
        status: 503,
        statusText: "Service Unavailable",
        headers: new Headers({
          "Content-Type": "text/html",
        }),
      }
    );
  }
}

// Handle messages from clients
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data && event.data.type === "CLEAR_CACHE") {
    caches.keys().then((cacheNames) => Promise.all(
      cacheNames
        .filter((cacheName) => cacheName.startsWith("soundwave-"))
        .map((cacheName) => caches.delete(cacheName))
    )).then(() => {
      console.log("Cache cleared");
    });
  }

  if (event.data && event.data.type === "CHECK_UPDATES") {
    // Notify client about update availability
    event.ports[0].postMessage({
      type: "UPDATE_AVAILABLE",
      message: "A new version of Soundwave Studio is available",
    });
  }
});
