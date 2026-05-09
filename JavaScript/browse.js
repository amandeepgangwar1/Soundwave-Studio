function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function init() {
  const grid = document.getElementById("guestPlaylistGrid");
  const res = await fetch("/api/playlists");
  if (!res.ok) {
    grid.innerHTML = `<div class="muted">Playlists are unavailable.</div>`;
    return;
  }
  const playlists = await res.json();
  grid.innerHTML = playlists.map((playlist) => `
    <div class="card">
      <img src="${escapeHtml(playlist.coverUrl)}" alt="${escapeHtml(playlist.title)}">
      <div class="card-title">${escapeHtml(playlist.title)}</div>
      <div class="card-desc">${escapeHtml(playlist.description)}</div>
      <a class="button ghost" href="signup.html">Sign up to play</a>
    </div>
  `).join("") || `<div class="muted">No playlists yet.</div>`;
}

init();
