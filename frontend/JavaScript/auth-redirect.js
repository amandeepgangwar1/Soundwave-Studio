(function () {
  function getCurrentDestination() {
    const path = window.location.pathname.replace(/\\/g, "/");
    const frontendIndex = path.lastIndexOf("/frontend/");
    const relativePath = frontendIndex >= 0
      ? path.slice(frontendIndex + "/frontend/".length)
      : path;
    const destination = `${relativePath}${window.location.search}${window.location.hash}`;
    return destination.startsWith("/") ? destination : `/${destination}`;
  }

  function getLoginUrl() {
    const params = new URLSearchParams({ next: getCurrentDestination() });
    return `/login.html?${params.toString()}`;
  }

  function getSafeNext(defaultPath = "/home.html") {
    const next = new URLSearchParams(window.location.search).get("next");
    if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
      return defaultPath;
    }
    return next;
  }

  window.SoundwaveAuthRedirect = {
    getLoginUrl,
    getSafeNext
  };
})();
