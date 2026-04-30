async function requireAuth() {
  const res = await fetch("/api/me", { credentials: "include" });
  if (!res.ok) {
    window.location.href = "/login.html";
    return null;
  }
  return res.json();
}

function getJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch (err) {
    return fallback;
  }
}

function setJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

async function logout() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  if (window.showAuthOverlay) {
    await window.showAuthOverlay("Logging out...");
  }
  window.location.href = "/login.html";
}

function renderHistory() {
  const historyList = document.getElementById("historyList");
  const recentList = document.getElementById("recentList");
  if (!historyList || !recentList) return;
  const stored = getJSON("sw_history", []);

  historyList.innerHTML = stored
    .slice(0, 20)
    .map(
      (item) =>
        `<div class="list-item" data-key="${item.key}"><span>${item.title}</span><span class="muted">${item.artist}</span></div>`
    )
    .join("") || '<div class="list-item"><span>No history yet.</span></div>';

  recentList.innerHTML = stored
    .slice(0, 8)
    .map(
      (item) =>
        `<div class="list-item" data-key="${item.key}"><span>${item.title}</span><span class="muted">${item.artist}</span></div>`
    )
    .join("") || '<div class="list-item"><span>No recent plays.</span></div>';
}

function renderPlaylists() {
  const playlistSelect = document.getElementById("playlistSelect");
  const playlistList = document.getElementById("playlistList");
  if (!playlistSelect || !playlistList) return;
  const playlists = getJSON("sw_playlists", []);

  playlistSelect.innerHTML = playlists
    .map((list) => `<option value="${list.id}">${list.name}</option>`)
    .join("") || '<option value="">No playlists</option>';

  playlistList.innerHTML = playlists
    .map((list) => {
      const firstKey = list.songs[0] || "";
      return `<div class="list-item" data-key="${firstKey}"><span>${list.name}</span><span class="muted">${list.songs.length} songs</span></div>`;
    })
    .join("") || '<div class="list-item"><span>Create your first playlist.</span></div>';
}

function setupPlaylistActions() {
  const newPlaylistName = document.getElementById("newPlaylistName");
  const createPlaylistBtn = document.getElementById("createPlaylistBtn");
  const addToPlaylistBtn = document.getElementById("addToPlaylistBtn");
  const playlistSelect = document.getElementById("playlistSelect");
  if (!newPlaylistName || !createPlaylistBtn || !addToPlaylistBtn || !playlistSelect) return;

  createPlaylistBtn.addEventListener("click", () => {
    const name = newPlaylistName.value.trim();
    if (!name) return;
    const updated = getJSON("sw_playlists", []);
    const newList = { id: Date.now(), name, songs: [] };
    updated.push(newList);
    setJSON("sw_playlists", updated);
    newPlaylistName.value = "";
    renderPlaylists();
  });

  addToPlaylistBtn.addEventListener("click", () => {
    const listId = Number(playlistSelect.value);
    if (!listId) return;
    const updated = getJSON("sw_playlists", []);
    const list = updated.find((item) => item.id === listId);
    if (!list) return;
    const lastPlayed = getJSON("sw_history", [])[0];
    if (!lastPlayed) return;
    const key = lastPlayed.key;
    if (!list.songs.includes(key)) {
      list.songs.push(key);
    }
    setJSON("sw_playlists", updated);
    renderPlaylists();
  });
}

function parseKey(key) {
  if (!key) return null;
  const parts = key.split(":");
  if (parts.length < 2) return null;
  const playlistId = parts[0];
  const filename = parts.slice(1).join(":");
  return { playlistId, filename };
}

function openPlayerForKey(key) {
  const parsed = parseKey(key);
  if (!parsed) return;
  const url = `/player.html?playlist=${encodeURIComponent(parsed.playlistId)}&file=${encodeURIComponent(parsed.filename)}`;
  window.location.href = url;
}

function setupHistoryClicks() {
  const historyList = document.getElementById("historyList");
  const recentList = document.getElementById("recentList");
  if (historyList) {
    historyList.addEventListener("click", (event) => {
      const item = event.target.closest(".list-item");
      if (!item) return;
      openPlayerForKey(item.dataset.key);
    });
  }
  if (recentList) {
    recentList.addEventListener("click", (event) => {
      const item = event.target.closest(".list-item");
      if (!item) return;
      openPlayerForKey(item.dataset.key);
    });
  }
}

function setupPlaylistClicks() {
  const playlistList = document.getElementById("playlistList");
  if (!playlistList) return;
  playlistList.addEventListener("click", (event) => {
    const item = event.target.closest(".list-item");
    if (!item) return;
    openPlayerForKey(item.dataset.key);
  });
}

async function init() {
  const user = await requireAuth();
  if (!user) return;

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.onclick = logout;

  const section = document.body.dataset.section;
  if (section === "history") {
    renderHistory();
    setupHistoryClicks();
    return;
  }

  if (section === "playlist") {
    renderPlaylists();
    setupPlaylistActions();
    setupPlaylistClicks();
    return;
  }
}

init();
