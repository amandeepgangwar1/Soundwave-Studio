/**
 * Service Worker Registration Helper
 * Registers and manages the service worker lifecycle
 */

if ("serviceWorker" in navigator) {
  const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
  const isLocalDev = LOCAL_HOSTS.has(window.location.hostname);
  const localResetKey = "soundwave_sw_local_reset_v3";

  async function clearSoundwaveCaches() {
    if (!("caches" in window)) return;

    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((cacheName) => cacheName.startsWith("soundwave-"))
        .map((cacheName) => caches.delete(cacheName))
    );
  }

  async function unregisterServiceWorkers() {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }

  function activateWaitingWorker(worker) {
    if (!worker || !navigator.serviceWorker.controller) {
      return;
    }

    worker.postMessage({ type: "SKIP_WAITING" });
  }

  window.addEventListener("load", () => {
    if (isLocalDev) {
      const hadController = Boolean(navigator.serviceWorker.controller);

      Promise.all([unregisterServiceWorkers(), clearSoundwaveCaches()])
        .then(() => {
          if (hadController && sessionStorage.getItem(localResetKey) !== "done") {
            sessionStorage.setItem(localResetKey, "done");
            window.location.reload();
          }
        })
        .catch((error) => {
          console.warn("Service Worker cleanup failed:", error);
        });
      return;
    }

    const hadController = Boolean(navigator.serviceWorker.controller);

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((registration) => {
        console.log("Service Worker registered successfully:", registration);
        activateWaitingWorker(registration.waiting);
        registration.update().catch((error) => {
          console.debug("Service Worker update check failed:", error);
        });

        // Listen for updates
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          console.log("Service Worker update found");

          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              // New service worker is ready, prompt user
              console.log("New Service Worker ready to activate");
              activateWaitingWorker(newWorker);

              // Optional: Show update notification
              if (window.showUpdateNotification) {
                window.showUpdateNotification();
              }
            }
          });
        });

        // Handle controller change (when new SW takes over)
        let refreshing = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (hadController && !refreshing) {
            refreshing = true;
            window.location.reload();
          }
        });
      })
      .catch((error) => {
        console.warn("Service Worker registration failed:", error);
      });
  });

  // Provide utility function to skip waiting and activate new SW
  window.updateServiceWorker = () => {
    navigator.serviceWorker.controller.postMessage({
      type: "SKIP_WAITING",
    });
  };

  // Provide utility function to clear cache
  window.clearCache = () => {
    navigator.serviceWorker.controller.postMessage({
      type: "CLEAR_CACHE",
    });
  };
} else {
  console.info("Service Workers are not supported in this browser");
}
