function getPlaylistId() {
  const params = new URLSearchParams(window.location.search);
  const id = Number(params.get("id"));
  return Number.isInteger(id) ? id : null;
}

async function requireAuth() {
  const res = await fetch("/api/me", { credentials: "include" });
  if (!res.ok) {
    window.location.href = "/login.html";
    return null;
  }
  return res.json();
}

async function loadPlaylist(id) {
  const res = await fetch(`/api/playlists/${id}`, { credentials: "include" });
  if (!res.ok) return null;
  return res.json();
}

function renderPlaylist(playlist) {
  document.getElementById("playlistTitle").textContent = playlist.title;
  document.getElementById("playlistDesc").textContent = playlist.description;

  const list = document.getElementById("playlistSongs");
  const searchInput = document.getElementById("songSearch");
  const query = searchInput ? searchInput.value.trim().toLowerCase() : "";
  list.innerHTML = "";

  playlist.songs
    .filter((song) => `${song.title || song.filename} ${song.artistName || ""} ${song.albumTitle || ""}`.toLowerCase().includes(query))
    .forEach((song) => {
    const item = document.createElement("div");
    item.className = "list-item";
    item.innerHTML = `
      <span>${song.title || song.filename} <span class="muted">- ${song.artistName || playlist.title}</span></span>
      <div class="actions-end">
        <button class="button ghost" data-action="like">Like</button>
        <button class="button ghost" data-action="play">Play</button>
      </div>
    `;

    item.querySelector('[data-action="like"]').addEventListener("click", async (event) => {
      event.stopPropagation();
      const res = await fetch(`/api/library/songs/${song.id}/toggle`, {
        method: "POST",
        credentials: "include"
      });
      if (res.ok) event.currentTarget.textContent = "Liked";
    });

    item.querySelector('[data-action="play"]').addEventListener("click", (event) => {
      event.stopPropagation();
      const url = `/player.html?playlist=${playlist.id}&song=${song.id}`;
      window.location.href = url;
    });

    item.addEventListener("click", () => {
      const url = `/player.html?playlist=${playlist.id}&song=${song.id}`;
      window.location.href = url;
    });

    list.appendChild(item);
  });
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

  const playlistId = getPlaylistId();
  if (!playlistId) return;
  const playlist = await loadPlaylist(playlistId);
  if (!playlist) return;
  renderPlaylist(playlist);

  const searchInput = document.getElementById("songSearch");
  if (searchInput) {
    searchInput.addEventListener("input", () => renderPlaylist(playlist));
  }
}

init();
