(function () {
  const routes = {
    "index.html": { next: "browse.html" },
    "browse.html": { previous: "index.html", next: "login.html" },
    "login.html": { previous: "browse.html", next: "signup.html" },
    "signup.html": { previous: "login.html" },
    "admin-login.html": { previous: "index.html", next: "admin-signup.html" },
    "admin-signup.html": { previous: "admin-login.html" },
    "shared-playlist.html": { previous: "browse.html", next: "login.html" },
    "home.html": { previous: "browse.html", next: "player.html" },
    "search.html": { previous: "home.html", next: "artists.html" },
    "artists.html": { previous: "search.html", next: "library.html" },
    "library.html": { previous: "artists.html", next: "playlist.html" },
    "playlist.html": { previous: "library.html", next: "player.html" },
    "player.html": { previous: "playlist.html", next: "sections/playlist-management.html" },
    "sections/playlist-management.html": { previous: "player.html", next: "sections/history.html" },
    "sections/history.html": { previous: "sections/playlist-management.html", next: "premium.html" },
    "premium.html": { previous: "sections/history.html", next: "admin.html" },
    "admin.html": { previous: "premium.html" },
    "sections/categories.html": { previous: "home.html", next: "player.html" },
    "sections/recently-played.html": { previous: "home.html", next: "player.html" },
    "sections/recommended.html": { previous: "home.html", next: "player.html" },
    "sections/song-library.html": { previous: "home.html", next: "player.html" }
  };

  function currentPage() {
    const path = decodeURIComponent(window.location.pathname.replace(/\\/g, "/"));
    const frontendIndex = path.lastIndexOf("/frontend/");
    const relativePath = frontendIndex >= 0
      ? path.slice(frontendIndex + "/frontend/".length)
      : path.slice(path.lastIndexOf("/") + 1);

    if (frontendIndex < 0 && path.includes("/sections/")) {
      return `sections/${relativePath}`;
    }

    return relativePath || "index.html";
  }

  function hrefFor(page) {
    const inSection = window.location.pathname.includes("/sections/");
    if (!inSection) return page;
    return page.startsWith("sections/") ? page.replace("sections/", "") : `../${page}`;
  }

  function retainPlaylistContext(page, target, direction) {
    const params = new URLSearchParams(window.location.search);

    if (page === "playlist.html" && direction === "next") {
      const playlistId = params.get("id");
      return playlistId ? `${target}?playlist=${encodeURIComponent(playlistId)}` : target;
    }

    if (page === "player.html" && direction === "previous") {
      const playlistId = params.get("playlist");
      return playlistId ? `${target}?id=${encodeURIComponent(playlistId)}` : target;
    }

    return target;
  }

  function loadThemeSystem() {
    if (window.SoundwaveThemeSystem || document.querySelector('script[data-soundwave-theme="true"]')) {
      return;
    }

    const script = document.createElement("script");
    script.src = hrefFor("JavaScript/color-theme-controller.js");
    script.defer = true;
    script.dataset.soundwaveTheme = "true";
    document.head.appendChild(script);
  }

  function ensureThemeToggle(topbar) {
    if (document.getElementById("themeToggle")) return;

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.id = "themeToggle";
    toggle.className = "button ghost theme-toggle-control";
    toggle.setAttribute("aria-label", "Switch color theme");

    const updateLabel = (mode) => {
      const isLight = mode === "light";
      toggle.textContent = isLight ? "Dark mode" : "Light mode";
      toggle.setAttribute("aria-pressed", String(isLight));
    };

    updateLabel(document.body?.dataset.themeMode || localStorage.getItem("sw_theme") || "dark");
    window.addEventListener("soundwave:theme-change", (event) => {
      updateLabel(event.detail?.theme?.mode || "dark");
    });
    toggle.addEventListener("click", () => {
      const currentMode = document.body?.dataset.themeMode || localStorage.getItem("sw_theme") || "dark";
      const nextMode = currentMode === "light" ? "dark" : "light";
      if (window.SoundwaveThemeSystem?.setMode) {
        window.SoundwaveThemeSystem.setMode(nextMode);
      } else {
        localStorage.setItem("sw_theme", nextMode);
        document.documentElement.dataset.themeMode = nextMode === "light" ? "light" : "";
        document.body.dataset.themeMode = nextMode;
      }
      updateLabel(nextMode);
    });

    const actions = topbar.querySelector(".actions-end") || topbar;
    actions.appendChild(toggle);
  }

  function createControl(label, target, disabled, ariaLabel) {
    if (disabled) {
      const span = document.createElement("span");
      span.className = "nav-btn disabled";
      span.setAttribute("aria-disabled", "true");
      span.setAttribute("aria-label", ariaLabel);
      span.textContent = label;
      return span;
    }
    const link = document.createElement("a");
    link.className = "nav-btn";
    link.href = hrefFor(target);
    link.setAttribute("aria-label", ariaLabel);
    link.textContent = label;
    return link;
  }

  function removeOldControls(topbar) {
    topbar.querySelectorAll(".nav-btn").forEach((control) => control.remove());
    topbar.querySelectorAll(".page-nav").forEach((group) => {
      if (!group.textContent.trim() && group.children.length === 0) {
        group.remove();
      }
    });
  }

  function init() {
    const topbar = document.querySelector(".topbar");
    if (!topbar || topbar.querySelector(".global-page-nav")) return;

    removeOldControls(topbar);
    ensureThemeToggle(topbar);

    const page = currentPage();
    const route = routes[page] || {};
    const previous = route.previous
      ? retainPlaylistContext(page, route.previous, "previous")
      : null;
    const next = route.next
      ? retainPlaylistContext(page, route.next, "next")
      : null;

    const controls = document.createElement("div");
    controls.className = "page-nav global-page-nav";
    controls.appendChild(createControl("< Back", previous, !previous, "Previous page"));
    controls.appendChild(createControl("Next >", next, !next, "Next page"));
    topbar.insertBefore(controls, topbar.firstChild);
  }

  loadThemeSystem();
  init();
})();
