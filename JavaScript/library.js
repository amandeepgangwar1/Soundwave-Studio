async function requireAuth() {
  const res = await fetch("/api/me", { credentials: "include" });
  if (!res.ok) {
    window.location.href = "/login.html";
    return null;
  }
  return res.json();
}

async function loadLibrary() {
  const res = await fetch("/api/library", { credentials: "include" });
  if (!res.ok) return null;
  return res.json();
}

async function loadUserPlaylists() {
  const res = await fetch("/api/user-playlists", { credentials: "include" });
  if (!res.ok) return [];
  return res.json();
}

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

function renderPlaylists(playlists) {
  const grid = document.getElementById("savedPlaylists");
  grid.innerHTML = "";

  if (playlists.length === 0) {
    grid.innerHTML = `<div class="muted">No saved playlists yet.</div>`;
    return;
  }

  playlists.forEach((playlist) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <img src="${escapeHtml(playlist.coverUrl)}" alt="${escapeHtml(playlist.title)}">
      <div class="card-title">${escapeHtml(playlist.title)}</div>
      <div class="card-desc">${escapeHtml(playlist.description)}</div>
      <button class="button ghost" data-action="remove">Remove</button>
    `;

    card.querySelector('[data-action="remove"]').addEventListener("click", async (event) => {
      event.stopPropagation();
      const res = await fetch(`/api/library/playlists/${playlist.id}/toggle`, {
        method: "POST",
        credentials: "include"
      });
      if (res.ok) init();
    });

    card.addEventListener("click", () => {
      window.location.href = `/playlist.html?id=${playlist.id}`;
    });

    grid.appendChild(card);
  });
}

function renderSongs(songs) {
  const list = document.getElementById("likedSongs");
  list.innerHTML = "";

  if (songs.length === 0) {
    list.innerHTML = `<div class="muted">No liked songs yet.</div>`;
    return;
  }

  songs.forEach((song) => {
    const item = document.createElement("div");
    item.className = "list-item";
    item.innerHTML = `
      <span>${escapeHtml(song.title || song.filename)} <span class="muted">- ${escapeHtml(song.artistName || song.playlistTitle)}</span></span>
      <div class="actions-end">
        <button class="button ghost" data-action="play">Play</button>
        <button class="button ghost" data-action="remove">Unlike</button>
      </div>
    `;

    item.querySelector('[data-action="play"]').addEventListener("click", (event) => {
      event.stopPropagation();
      window.location.href = `/player.html?playlist=${song.playlistId}&song=${song.id}`;
    });

    item.querySelector('[data-action="remove"]').addEventListener("click", async (event) => {
      event.stopPropagation();
      const res = await fetch(`/api/library/songs/${song.id}/toggle`, {
        method: "POST",
        credentials: "include"
      });
      if (res.ok) init();
    });

    item.addEventListener("click", () => {
      window.location.href = `/player.html?playlist=${song.playlistId}&song=${song.id}`;
    });

    list.appendChild(item);
  });
}

function renderFollowedArtists(artists) {
  const list = document.getElementById("followedArtists");
  if (!list) return;
  if (!artists || artists.length === 0) {
    list.innerHTML = `<div class="muted">No followed artists yet.</div>`;
    return;
  }
  list.innerHTML = artists.map((artist) => `
    <div class="list-item">
      <span>${escapeHtml(artist.name)}</span>
      <a class="button ghost" href="artists.html?artist=${artist.id}">Open</a>
    </div>
  `).join("");
}

function renderUserPlaylists(playlists) {
  const list = document.getElementById("userPlaylists");
  if (!list) return;
  if (!playlists.length) {
    list.innerHTML = `<div class="muted">No custom playlists yet.</div>`;
    return;
  }
  list.innerHTML = playlists.map((playlist) => `
    <div class="list-item">
      <span>${escapeHtml(playlist.name)} <span class="muted">- ${playlist.songs.length} songs</span></span>
      <a class="button ghost" href="sections/playlist-management.html">Manage</a>
    </div>
  `).join("");
}

function renderDownloadedSongs() {
  const list = document.getElementById("downloadedSongs");
  if (!list) return;
  const downloads = getJSON("sw_downloads", []);
  if (!downloads.length) {
    list.innerHTML = `<div class="muted">No downloaded songs yet.</div>`;
    return;
  }
  list.innerHTML = downloads.map((song) => `
    <div class="list-item">
      <span>${escapeHtml(song.title)} <span class="muted">- ${escapeHtml(song.artistName)}</span></span>
      <a class="button ghost" href="${escapeHtml(song.fileUrl)}" download>Download Again</a>
    </div>
  `).join("");
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

  document.getElementById("logoutBtn").onclick = logout;
  const [data, userPlaylists] = await Promise.all([
    loadLibrary(),
    loadUserPlaylists()
  ]);
  if (!data) return;
  renderPlaylists(data.playlists);
  renderSongs(data.songs);
  renderFollowedArtists(data.followedArtists);
  renderUserPlaylists(userPlaylists);
  renderDownloadedSongs();
}

init();
