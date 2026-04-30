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
      <img src="${playlist.coverUrl}" alt="${playlist.title}">
      <div class="card-title">${playlist.title}</div>
      <div class="card-desc">${playlist.description}</div>
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
      <span>${song.filename} <span class="muted">• ${song.playlistTitle}</span></span>
      <div class="actions-end">
        <button class="button ghost" data-action="play">Play</button>
        <button class="button ghost" data-action="remove">Unlike</button>
      </div>
    `;

    item.querySelector('[data-action="play"]').addEventListener("click", (event) => {
      event.stopPropagation();
      const url = `/player.html?playlist=${song.playlistId}&song=${song.id}`;
      window.location.href = url;
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
      const url = `/player.html?playlist=${song.playlistId}&song=${song.id}`;
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
  const data = await loadLibrary();
  if (!data) return;
  renderPlaylists(data.playlists);
  renderSongs(data.songs);
}

init();
