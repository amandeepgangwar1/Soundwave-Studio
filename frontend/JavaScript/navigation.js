(function () {
  const routes = {
    "index.html": { next: "browse.html" },
    "browse.html": { previous: "index.html", next: "login.html" },
    "login.html": { previous: "browse.html", next: "signup.html" },
    "signup.html": { previous: "login.html" },
    "admin-login.html": { previous: "index.html", next: "admin-signup.html" },
    "admin-signup.html": { previous: "admin-login.html" },
    "shared-playlist.html": { previous: "browse.html", next: "login.html" },
    "home.html": { previous: "browse.html", next: "search.html" },
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
    let path = window.location.pathname.replace(/\\/g, "/");
    path = decodeURIComponent(path.substring(path.lastIndexOf("/") + 1)) || "index.html";
    if (window.location.pathname.includes("/sections/")) {
      return `sections/${path}`;
    }
    return path;
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
