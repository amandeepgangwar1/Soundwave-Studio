(function () {
  const pages = [
    "index.html",
    "browse.html",
    "signup.html",
    "login.html",
    "home.html",
    "search.html",
    "artists.html",
    "library.html",
    "playlist.html",
    "player.html",
    "sections/playlist-management.html",
    "sections/history.html",
    "premium.html",
    "admin.html",
    "admin-login.html",
    "admin-signup.html",
    "shared-playlist.html"
  ];

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

  function createControl(label, target, disabled) {
    if (disabled) {
      const span = document.createElement("span");
      span.className = "nav-btn disabled";
      span.setAttribute("aria-disabled", "true");
      span.textContent = label;
      return span;
    }
    const link = document.createElement("a");
    link.className = "nav-btn";
    link.href = hrefFor(target);
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

    const index = pages.indexOf(currentPage());
    const currentIndex = index === -1 ? 0 : index;
    const previous = pages[currentIndex - 1];
    const next = pages[currentIndex + 1];

    const controls = document.createElement("div");
    controls.className = "page-nav global-page-nav";
    controls.appendChild(createControl("< Back", previous, !previous));
    controls.appendChild(createControl("Next >", next, !next));
    topbar.insertBefore(controls, topbar.firstChild);
  }

  init();
})();
