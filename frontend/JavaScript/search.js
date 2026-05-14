let activeTab = "songs";
let lastResults = { songs: [], artists: [], albums: [], playlists: [], podcasts: [] };

async function requireAuth() {
  const res = await fetch("/api/me", { credentials: "include" });
  if (!res.ok) {
    window.location.href = "/login.html";
    return null;
  }
  return res.json();
}

async function logout() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  if (window.showAuthOverlay) {
    await window.showAuthOverlay("Logging out...");
  }
  window.location.href = "/login.html";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setEmpty(el, text) {
  if (el) {
    el.innerHTML = `<div class="list-item"><span>${escapeHtml(text)}</span></div>`;
  }
}

function playSong(song) {
  window.location.href = `/player.html?playlist=${song.playlistId}&song=${song.id}`;
}

async function toggleFollow(artistId) {
  const res = await fetch(`/api/artists/${artistId}/follow/toggle`, {
    method: "POST",
    credentials: "include"
  });
  if (!res.ok) return;
  await runSearch();
}

async function toggleLike(songId) {
  await fetch(`/api/library/songs/${songId}/toggle`, {
    method: "POST",
    credentials: "include"
  });
}

function renderSongs(songs) {
  const list = document.getElementById("songResults");
  if (!list) return;
  if (!songs.length) {
    setEmpty(list, "No songs found.");
    return;
  }

  list.innerHTML = songs.map((song) => `
    <div class="list-item" data-song-id="${song.id}" data-playlist-id="${song.playlistId}">
      <span>
        ${escapeHtml(song.title)}
        <span class="muted">- ${escapeHtml(song.artistName)} - ${escapeHtml(song.albumTitle || song.playlistTitle)}</span>
      </span>
      <div class="actions-end">
        <button class="button ghost" data-action="like">Like</button>
        <button class="button ghost" data-action="play">Play</button>
      </div>
    </div>
  `).join("");
}

function renderArtists(artists) {
  const grid = document.getElementById("artistResults");
  if (!grid) return;
  if (!artists.length) {
    grid.innerHTML = `<div class="muted">No artists found.</div>`;
    return;
  }

  grid.innerHTML = artists.map((artist) => `
    <div class="card" data-artist-id="${artist.id}">
      <img src="${escapeHtml(artist.imageUrl || "img/music.svg")}" alt="${escapeHtml(artist.name)}">
      <div class="card-title">${escapeHtml(artist.name)}</div>
      <div class="card-desc">${escapeHtml(artist.bio || "Artist")}</div>
      <div class="actions">
        <a class="button ghost" href="artists.html?artist=${artist.id}">Open</a>
        <button class="button ghost" data-action="follow">${artist.followed ? "Following" : "Follow"}</button>
      </div>
    </div>
  `).join("");
}

function renderAlbums(albums) {
  const grid = document.getElementById("albumResults");
  if (!grid) return;
  if (!albums.length) {
    grid.innerHTML = `<div class="muted">No albums found.</div>`;
    return;
  }

  grid.innerHTML = albums.map((album) => `
    <div class="card">
      <img src="${escapeHtml(album.coverImage || "img/music.svg")}" alt="${escapeHtml(album.title)}">
      <div class="card-title">${escapeHtml(album.title)}</div>
      <div class="card-desc">${escapeHtml(album.artistName)}</div>
    </div>
  `).join("");
}

function renderPlaylists(playlists) {
  const grid = document.getElementById("playlistResults");
  if (!grid) return;
  if (!playlists.length) {
    grid.innerHTML = `<div class="muted">No playlists found.</div>`;
    return;
  }

  grid.innerHTML = playlists.map((playlist) => `
    <div class="card" data-playlist-id="${playlist.id}">
      <img src="${escapeHtml(playlist.coverUrl)}" alt="${escapeHtml(playlist.title)}">
      <div class="card-title">${escapeHtml(playlist.title)}</div>
      <div class="card-desc">${escapeHtml(playlist.description)}</div>
      <a class="button ghost" href="playlist.html?id=${playlist.id}">Open Playlist</a>
    </div>
  `).join("");
}

function renderPodcasts(podcasts) {
  const grid = document.getElementById("podcastResults");
  if (!grid) return;
  if (!podcasts.length) {
    grid.innerHTML = `<div class="muted">No podcasts found.</div>`;
    return;
  }

  grid.innerHTML = podcasts.map((podcast) => `
    <div class="card card-compact">
      <div class="card-title">${escapeHtml(podcast.title)}</div>
      <div class="card-desc">${escapeHtml(podcast.description)}</div>
    </div>
  `).join("");
}

function renderAll() {
  renderSongs(lastResults.songs || []);
  renderArtists(lastResults.artists || []);
  renderAlbums(lastResults.albums || []);
  renderPlaylists(lastResults.playlists || []);
  renderPodcasts(lastResults.podcasts || []);
}

async function runSearch() {
  const input = document.getElementById("globalSearchInput");
  const query = input ? input.value.trim() : "";
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
    credentials: "include"
  });
  if (!res.ok) return;
  lastResults = await res.json();
  renderAll();
}

function setActiveTab(tab) {
  activeTab = tab;
  document.querySelectorAll("#searchTabs .pill-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === activeTab);
  });
  document.querySelectorAll(".result-section").forEach((section) => {
    section.classList.toggle("hidden", section.dataset.result !== activeTab);
  });
}

function debounce(fn, delay = 250) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function setupVoiceSearch() {
  const voiceBtn = document.getElementById("voiceSearchBtn");
  const input = document.getElementById("globalSearchInput");
  if (!voiceBtn || !input) return;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceBtn.disabled = true;
    voiceBtn.textContent = "Voice NA";
    return;
  }
  const recognizer = new SpeechRecognition();
  recognizer.lang = "en-US";
  recognizer.interimResults = false;
  recognizer.maxAlternatives = 1;
  voiceBtn.addEventListener("click", () => recognizer.start());
  recognizer.addEventListener("result", (event) => {
    input.value = event.results[0][0].transcript;
    runSearch();
  });
}

async function init() {
  const user = await requireAuth();
  if (!user) return;

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.onclick = logout;

  const input = document.getElementById("globalSearchInput");
  if (input) input.addEventListener("input", debounce(runSearch));

  document.getElementById("searchTabs").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-tab]");
    if (!button) return;
    setActiveTab(button.dataset.tab);
  });

  document.getElementById("songResults").addEventListener("click", async (event) => {
    const item = event.target.closest(".list-item");
    const button = event.target.closest("button");
    if (!item || !button) return;
    const song = lastResults.songs.find((entry) => entry.id === Number(item.dataset.songId));
    if (!song) return;
    if (button.dataset.action === "play") playSong(song);
    if (button.dataset.action === "like") {
      await toggleLike(song.id);
      button.textContent = "Liked";
    }
  });

  document.getElementById("artistResults").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action='follow']");
    const card = event.target.closest("[data-artist-id]");
    if (!button || !card) return;
    await toggleFollow(Number(card.dataset.artistId));
  });

  setupVoiceSearch();
  setActiveTab("songs");
  await runSearch();
}

init();
