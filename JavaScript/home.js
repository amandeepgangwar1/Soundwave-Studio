let currentPlaylistId = null;
let playlists = [];
let savedPlaylistIds = new Set();
let likedSongIds = new Set();

const planLabels = {
  free: "Free Plan",
  premium: "Premium",
  "premium-monthly": "Premium Monthly",
  "premium-yearly": "Premium Yearly",
  student: "Student Premium"
};

function getJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch (err) {
    return fallback;
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function requireAuth() {
  const res = await fetch("/api/me", { credentials: "include" });
  if (!res.ok) {
    window.location.href = "/login.html";
    return null;
  }
  return res.json();
}

async function loadLibraryState() {
  const res = await fetch("/api/library", { credentials: "include" });
  if (!res.ok) return;
  const data = await res.json();
  savedPlaylistIds = new Set(data.playlists.map((p) => p.id));
  likedSongIds = new Set(data.songs.map((s) => s.id));
}

async function fetchPlaylists() {
  const res = await fetch("/api/playlists", { credentials: "include" });
  if (!res.ok) return [];
  playlists = await res.json();
  return playlists;
}

function renderPlaylists() {
  const grid = document.getElementById("playlistGrid");
  const searchInput = document.getElementById("playlistSearch");
  const query = searchInput ? searchInput.value.trim().toLowerCase() : "";
  grid.innerHTML = "";

  playlists
    .filter((playlist) => playlist.title.toLowerCase().includes(query))
    .forEach((playlist) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <img src="${playlist.coverUrl}" alt="${playlist.title}">
      <div class="card-title">${playlist.title}</div>
      <div class="card-desc">${playlist.description}</div>
      <button class="button ghost" data-action="save">
        ${savedPlaylistIds.has(playlist.id) ? "Saved" : "Save to Library"}
      </button>
    `;

    card.querySelector('[data-action="save"]').addEventListener("click", async (event) => {
      event.stopPropagation();
      const res = await fetch(`/api/library/playlists/${playlist.id}/toggle`, {
        method: "POST",
        credentials: "include"
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.saved) savedPlaylistIds.add(playlist.id);
      else savedPlaylistIds.delete(playlist.id);
      renderPlaylists();
    });

    card.addEventListener("click", () => {
      window.location.href = `/playlist.html?id=${playlist.id}`;
    });

    grid.appendChild(card);
  });
}

function renderRecent() {
  const list = document.getElementById("recentList");
  if (!list) return;
  const history = getJSON("sw_history", []);
  list.innerHTML = history
    .slice(0, 5)
    .map((item) => `
      <div class="list-item" data-key="${escapeHtml(item.key)}">
        <span>${escapeHtml(item.title)}</span>
        <span class="muted">${escapeHtml(item.artist)}</span>
      </div>
    `)
    .join("") || '<div class="list-item"><span>No recent plays yet.</span></div>';
}

async function renderRecommendations() {
  const list = document.getElementById("recommendList");
  if (!list) return;
  const res = await fetch("/api/recommendations", { credentials: "include" });
  if (!res.ok) {
    list.innerHTML = '<div class="list-item"><span>No recommendations yet.</span></div>';
    return;
  }
  const data = await res.json();
  const songs = data.songs || [];
  list.innerHTML = songs
    .slice(0, 5)
    .map((song) => `
      <div class="list-item">
        <span>${escapeHtml(song.title)} <span class="muted">- ${escapeHtml(song.artistName)}</span></span>
        <a class="button ghost" href="player.html?playlist=${song.playlistId}&song=${song.id}">Play</a>
      </div>
    `)
    .join("") || '<div class="list-item"><span>Like songs and follow artists to improve picks.</span></div>';
}

async function renderDiscoveryRows() {
  const trending = document.getElementById("trendingSongs");
  const releases = document.getElementById("newReleases");
  if (!trending || !releases) return;
  const res = await fetch("/api/search?limit=8", { credentials: "include" });
  if (!res.ok) return;
  const data = await res.json();
  const songs = data.songs || [];
  trending.innerHTML = songs
    .slice(0, 4)
    .map((song) => `
      <div class="list-item">
        <span>${escapeHtml(song.title)}</span>
        <a class="button ghost" href="player.html?playlist=${song.playlistId}&song=${song.id}">Play</a>
      </div>
    `)
    .join("") || '<div class="list-item"><span>No songs yet.</span></div>';
  releases.innerHTML = songs
    .slice(-4)
    .reverse()
    .map((song) => `
      <div class="list-item">
        <span>${escapeHtml(song.albumTitle || song.playlistTitle)}</span>
        <span class="muted">${escapeHtml(song.artistName)}</span>
      </div>
    `)
    .join("") || '<div class="list-item"><span>No releases yet.</span></div>';
}


async function logout() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  if (window.showAuthOverlay) {
    await window.showAuthOverlay("Logging out...");
  }
  window.location.href = "/login.html";
}

async function init() {
  const user = await requireAuth();
  if (!user) return;
  document.getElementById("userName").textContent = user.name;

  const profileName = document.getElementById("profileName");
  const profileEmail = document.getElementById("profileEmail");
  const profileAvatar = document.getElementById("profileAvatar");
  const contact = user.email && user.email.endsWith("@phone.soundwave.local")
    ? user.phone
    : user.email;
  if (profileName) profileName.textContent = user.name || "Soundwave Listener";
  if (profileEmail) profileEmail.textContent = contact || "";
  if (profileAvatar) {
    const initials = (user.name || "SW")
      .split(" ")
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
    profileAvatar.textContent = initials || "SW";
  }
  const profilePlan = document.getElementById("profilePlan");
  if (profilePlan) {
    profilePlan.textContent = planLabels[user.subscriptionType || "free"] || "Free Plan";
  }

  const themeToggle = document.getElementById("themeToggle");
  const themeHint = document.getElementById("themeHint");
  const storedTheme = localStorage.getItem("sw_theme") || "dark";
  if (storedTheme === "light") {
    document.body.classList.add("theme-light");
    if (themeToggle) themeToggle.textContent = "Switch to Dark";
    if (themeHint) themeHint.textContent = "Light mode enabled";
  }
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      document.body.classList.toggle("theme-light");
      const isLight = document.body.classList.contains("theme-light");
      localStorage.setItem("sw_theme", isLight ? "light" : "dark");
      themeToggle.textContent = isLight ? "Switch to Dark" : "Switch to Light";
      if (themeHint) themeHint.textContent = isLight ? "Light mode enabled" : "Dark mode enabled";
    });
  }

  document.getElementById("logoutBtn").addEventListener("click", logout);
  await loadLibraryState();
  await fetchPlaylists();
  renderPlaylists();
  renderRecent();
  await renderRecommendations();
  await renderDiscoveryRows();

  const searchInput = document.getElementById("playlistSearch");
  if (searchInput) {
    searchInput.addEventListener("input", renderPlaylists);
  }
}

init();
