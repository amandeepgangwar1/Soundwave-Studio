let userPlaylists = [];

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

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
    .map((item) => `
      <div class="list-item" data-key="${escapeHtml(item.key)}" data-playlist="${item.playlistId || ""}" data-song="${item.songId || ""}" data-file="${escapeHtml(item.filename || "")}">
        <span>${escapeHtml(item.title)}</span>
        <span class="muted">${escapeHtml(item.artist)}</span>
      </div>
    `)
    .join("") || '<div class="list-item"><span>No history yet.</span></div>';

  recentList.innerHTML = stored
    .slice(0, 8)
    .map((item) => `
      <div class="list-item" data-key="${escapeHtml(item.key)}" data-playlist="${item.playlistId || ""}" data-song="${item.songId || ""}" data-file="${escapeHtml(item.filename || "")}">
        <span>${escapeHtml(item.title)}</span>
        <span class="muted">${escapeHtml(item.artist)}</span>
      </div>
    `)
    .join("") || '<div class="list-item"><span>No recent plays.</span></div>';
}

async function loadUserPlaylists() {
  const res = await fetch("/api/user-playlists", { credentials: "include" });
  if (!res.ok) return [];
  userPlaylists = await res.json();
  return userPlaylists;
}

function setPlaylistMessage(message, isError = false) {
  const el = document.getElementById("playlistMessage");
  if (!el) return;
  el.textContent = message;
  el.className = isError ? "error" : "helper";
}

function renderPlaylists() {
  const playlistSelect = document.getElementById("playlistSelect");
  const playlistList = document.getElementById("playlistList");
  if (!playlistSelect || !playlistList) return;

  playlistSelect.innerHTML = userPlaylists
    .map((list) => `<option value="${list.id}">${escapeHtml(list.name)}</option>`)
    .join("") || '<option value="">No playlists</option>';

  playlistList.innerHTML = userPlaylists
    .map((list) => `
      <div class="list-item" data-id="${list.id}">
        <span>${escapeHtml(list.name)} <span class="muted">- ${list.songs.length} songs</span></span>
        <div class="actions-end">
          ${list.shareUrl ? `<a class="button ghost" href="${escapeHtml(list.shareUrl)}">Open Share</a>` : ""}
          <button class="button ghost" data-action="load">Load</button>
        </div>
      </div>
      ${(list.songs || []).slice(0, 4).map((song) => `
        <div class="list-item child-item">
          <span>${escapeHtml(song.title)} <span class="muted">- ${escapeHtml(song.artistName)}</span></span>
          <button class="button ghost" data-action="remove-song" data-playlist-id="${list.id}" data-song-id="${song.id}">Remove</button>
        </div>
      `).join("")}
    `)
    .join("") || '<div class="list-item"><span>Create your first playlist.</span></div>';
}

function getSelectedPlaylistId() {
  const select = document.getElementById("playlistSelect");
  return Number(select?.value);
}

function getLastPlayedSong() {
  return getJSON("sw_history", [])[0] || null;
}

async function setupPlaylistActions() {
  const newPlaylistName = document.getElementById("newPlaylistName");
  const newPlaylistDesc = document.getElementById("newPlaylistDesc");
  const createPlaylistBtn = document.getElementById("createPlaylistBtn");
  const addToPlaylistBtn = document.getElementById("addToPlaylistBtn");
  const renamePlaylistBtn = document.getElementById("renamePlaylistBtn");
  const sharePlaylistBtn = document.getElementById("sharePlaylistBtn");
  const deletePlaylistBtn = document.getElementById("deletePlaylistBtn");
  const editPlaylistName = document.getElementById("editPlaylistName");
  const playlistList = document.getElementById("playlistList");
  if (!newPlaylistName || !createPlaylistBtn || !addToPlaylistBtn) return;

  createPlaylistBtn.addEventListener("click", async () => {
    const name = newPlaylistName.value.trim();
    const description = newPlaylistDesc ? newPlaylistDesc.value.trim() : "";
    if (!name) return;
    const res = await fetch("/api/user-playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name, description })
    });
    if (!res.ok) {
      setPlaylistMessage("Could not create playlist.", true);
      return;
    }
    newPlaylistName.value = "";
    if (newPlaylistDesc) newPlaylistDesc.value = "";
    setPlaylistMessage("Playlist created.");
    await loadUserPlaylists();
    renderPlaylists();
  });

  addToPlaylistBtn.addEventListener("click", async () => {
    const listId = getSelectedPlaylistId();
    const lastPlayed = getLastPlayedSong();
    if (!listId || !lastPlayed?.songId) {
      setPlaylistMessage("Play a song before adding it.", true);
      return;
    }
    const res = await fetch(`/api/user-playlists/${listId}/songs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ songId: lastPlayed.songId })
    });
    if (!res.ok) {
      setPlaylistMessage("Could not add song.", true);
      return;
    }
    setPlaylistMessage("Song added.");
    await loadUserPlaylists();
    renderPlaylists();
  });

  renamePlaylistBtn?.addEventListener("click", async () => {
    const listId = getSelectedPlaylistId();
    const current = userPlaylists.find((playlist) => playlist.id === listId);
    const name = editPlaylistName?.value.trim();
    if (!listId || !name || !current) return;
    const res = await fetch(`/api/user-playlists/${listId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name, description: current.description || "" })
    });
    if (!res.ok) {
      setPlaylistMessage("Could not rename playlist.", true);
      return;
    }
    if (editPlaylistName) editPlaylistName.value = "";
    setPlaylistMessage("Playlist renamed.");
    await loadUserPlaylists();
    renderPlaylists();
  });

  sharePlaylistBtn?.addEventListener("click", async () => {
    const listId = getSelectedPlaylistId();
    if (!listId) return;
    const res = await fetch(`/api/user-playlists/${listId}/share`, {
      method: "POST",
      credentials: "include"
    });
    if (!res.ok) {
      setPlaylistMessage("Could not share playlist.", true);
      return;
    }
    const data = await res.json();
    const fullUrl = `${window.location.origin}${data.shareUrl}`;
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(fullUrl);
      setPlaylistMessage("Share link copied.");
    } else {
      setPlaylistMessage(fullUrl);
    }
    await loadUserPlaylists();
    renderPlaylists();
  });

  deletePlaylistBtn?.addEventListener("click", async () => {
    const listId = getSelectedPlaylistId();
    if (!listId || !confirm("Delete this playlist?")) return;
    const res = await fetch(`/api/user-playlists/${listId}`, {
      method: "DELETE",
      credentials: "include"
    });
    if (!res.ok) {
      setPlaylistMessage("Could not delete playlist.", true);
      return;
    }
    setPlaylistMessage("Playlist deleted.");
    await loadUserPlaylists();
    renderPlaylists();
  });

  playlistList?.addEventListener("click", async (event) => {
    const removeButton = event.target.closest("button[data-action='remove-song']");
    if (removeButton) {
      const playlistId = Number(removeButton.dataset.playlistId);
      const songId = Number(removeButton.dataset.songId);
      await fetch(`/api/user-playlists/${playlistId}/songs/${songId}`, {
        method: "DELETE",
        credentials: "include"
      });
      await loadUserPlaylists();
      renderPlaylists();
      return;
    }

    const loadButton = event.target.closest("button[data-action='load']");
    if (!loadButton) return;
    const item = loadButton.closest("[data-id]");
    const playlist = userPlaylists.find((entry) => entry.id === Number(item.dataset.id));
    const song = playlist?.songs?.[0];
    if (song) {
      window.location.href = `/player.html?playlist=${song.playlistId}&song=${song.id}`;
    }
  });
}

function openPlayerForItem(item) {
  const playlistId = item.dataset.playlist;
  const songId = item.dataset.song;
  const filename = item.dataset.file;
  if (playlistId && songId) {
    window.location.href = `/player.html?playlist=${encodeURIComponent(playlistId)}&song=${encodeURIComponent(songId)}`;
    return;
  }
  if (playlistId && filename) {
    window.location.href = `/player.html?playlist=${encodeURIComponent(playlistId)}&file=${encodeURIComponent(filename)}`;
  }
}

function setupHistoryClicks() {
  document.querySelectorAll("#historyList, #recentList").forEach((list) => {
    list.addEventListener("click", (event) => {
      const item = event.target.closest(".list-item");
      if (item) openPlayerForItem(item);
    });
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
    await loadUserPlaylists();
    renderPlaylists();
    await setupPlaylistActions();
  }
}

init();
