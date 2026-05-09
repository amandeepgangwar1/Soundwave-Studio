function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  const title = document.getElementById("sharedTitle");
  const desc = document.getElementById("sharedDesc");
  const list = document.getElementById("sharedSongs");

  if (!token) {
    title.textContent = "Shared playlist not found";
    desc.textContent = "";
    list.innerHTML = `<div class="list-item"><span>Missing share token.</span></div>`;
    return;
  }

  const res = await fetch(`/api/shared-playlists/${encodeURIComponent(token)}`);
  if (!res.ok) {
    title.textContent = "Shared playlist not found";
    desc.textContent = "";
    list.innerHTML = `<div class="list-item"><span>This share link is unavailable.</span></div>`;
    return;
  }

  const data = await res.json();
  title.textContent = data.name;
  desc.textContent = data.description || `${data.songs.length} songs`;
  list.innerHTML = (data.songs || []).map((song) => `
    <div class="list-item">
      <span>${escapeHtml(song.title)} <span class="muted">- ${escapeHtml(song.artistName)}</span></span>
      <span class="muted">${escapeHtml(song.playlistTitle)}</span>
    </div>
  `).join("") || `<div class="list-item"><span>No songs in this shared playlist.</span></div>`;
}

init();
