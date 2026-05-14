let artists = [];
let selectedArtistId = null;
let showAllArtists = false;
const artistPreviewLimit = 6;
const featuredArtistNames = [
  "A. R. Rahman",
  "Arijit Singh",
  "Armaan Malik",
  "Atif Aslam",
  "Badshah",
  "Neha Kakkar",
  "Shreya Ghoshal",
  "Sonu Nigam",
  "Sunidhi Chauhan"
];

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

function sortArtistsForDisplay(items) {
  const featuredOrder = new Map(featuredArtistNames.map((name, index) => [name.toLowerCase(), index]));
  return [...items].sort((a, b) => {
    const aName = String(a.name || "");
    const bName = String(b.name || "");
    const aRank = featuredOrder.has(aName.toLowerCase())
      ? featuredOrder.get(aName.toLowerCase())
      : Number.MAX_SAFE_INTEGER;
    const bRank = featuredOrder.has(bName.toLowerCase())
      ? featuredOrder.get(bName.toLowerCase())
      : Number.MAX_SAFE_INTEGER;
    if (aRank !== bRank) return aRank - bRank;
    return aName.localeCompare(bName);
  });
}

async function loadArtists() {
  const res = await fetch("/api/artists", { credentials: "include" });
  if (!res.ok) return [];
  const rows = await res.json();
  artists = sortArtistsForDisplay(rows.filter((artist) => (artist.songCount || 0) > 0));
  return artists;
}

function renderArtists() {
  const grid = document.getElementById("artistGrid");
  const input = document.getElementById("artistSearch");
  if (!grid) return;
  const query = input ? input.value.trim().toLowerCase() : "";
  const filtered = artists.filter((artist) =>
    `${artist.name} ${artist.bio}`.toLowerCase().includes(query)
  );

  if (!filtered.length) {
    grid.innerHTML = `<div class="muted">No artists found.</div>`;
    return;
  }

  const visibleArtists = showAllArtists ? filtered : filtered.slice(0, artistPreviewLimit);

  grid.innerHTML = visibleArtists.map((artist) => `
    <div class="card ${artist.id === selectedArtistId ? "selected-card" : ""}" data-artist-id="${artist.id}">
      <img src="${escapeHtml(artist.imageUrl || "img/music.svg")}" alt="${escapeHtml(artist.name)}">
      <div class="card-title">${escapeHtml(artist.name)}</div>
      <div class="card-desc">${artist.songCount || 0} songs</div>
      <button class="button ghost" data-action="follow">${artist.followed ? "Following" : "Follow"}</button>
    </div>
  `).join("") + (
    !showAllArtists && filtered.length > artistPreviewLimit
      ? `<button class="button ghost artist-see-more" type="button" data-action="see-more-artists">See More...</button>`
      : ""
  );
}

async function toggleFollow(artistId) {
  const res = await fetch(`/api/artists/${artistId}/follow/toggle`, {
    method: "POST",
    credentials: "include"
  });
  if (!res.ok) return;
  const data = await res.json();
  const artist = artists.find((item) => item.id === artistId);
  if (artist) artist.followed = data.followed;
  renderArtists();
  if (selectedArtistId === artistId) await renderArtistDetail(artistId);
}

async function renderArtistDetail(artistId) {
  selectedArtistId = artistId;
  renderArtists();
  const detail = document.getElementById("artistDetail");
  const res = await fetch(`/api/artists/${artistId}`, { credentials: "include" });
  if (!res.ok) {
    detail.innerHTML = `<div class="section-title">Artist Details</div><p class="muted">Artist not found.</p>`;
    return;
  }
  const data = await res.json();
  const artist = data.artist;

  detail.innerHTML = `
    <img class="detail-image" src="${escapeHtml(artist.imageUrl || "img/music.svg")}" alt="${escapeHtml(artist.name)}">
    <div class="section-title">${escapeHtml(artist.name)}</div>
    <p class="muted">${escapeHtml(artist.bio || "Artist")}</p>
    <button class="button ghost full" id="detailFollowBtn">${artist.followed ? "Following" : "Follow Artist"}</button>
    <div class="section-title">Albums</div>
    <div class="mini-list">
      ${(data.albums || []).map((album) => `<div>${escapeHtml(album.title)}</div>`).join("") || "<div>No albums yet.</div>"}
    </div>
    <div class="section-title">Songs</div>
    <div class="list">
      ${(data.songs || []).map((song) => `
        <div class="list-item">
          <span>${escapeHtml(song.title)} <span class="muted">- ${escapeHtml(song.albumTitle || song.playlistTitle)}</span></span>
          <a class="button ghost" href="player.html?playlist=${song.playlistId}&song=${song.id}">Play</a>
        </div>
      `).join("") || `<div class="list-item"><span>No songs yet.</span></div>`}
    </div>
  `;

  document.getElementById("detailFollowBtn").addEventListener("click", () => toggleFollow(artistId));
}

async function init() {
  const user = await requireAuth();
  if (!user) return;

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.onclick = logout;

  await loadArtists();
  const params = new URLSearchParams(window.location.search);
  const requestedArtist = Number(params.get("artist"));
  if (Number.isInteger(requestedArtist) && requestedArtist > 0) {
    const requestedIndex = artists.findIndex((artist) => artist.id === requestedArtist);
    if (requestedIndex >= artistPreviewLimit) showAllArtists = true;
    await renderArtistDetail(requestedArtist);
  } else if (artists.length) {
    await renderArtistDetail(artists[0].id);
  } else {
    renderArtists();
  }

  const input = document.getElementById("artistSearch");
  if (input) {
    input.addEventListener("input", () => {
      showAllArtists = false;
      renderArtists();
    });
  }

  document.getElementById("artistGrid").addEventListener("click", async (event) => {
    if (event.target.closest("[data-action='see-more-artists']")) {
      showAllArtists = true;
      renderArtists();
      return;
    }

    const card = event.target.closest("[data-artist-id]");
    if (!card) return;
    const artistId = Number(card.dataset.artistId);
    if (event.target.closest("button[data-action='follow']")) {
      await toggleFollow(artistId);
      return;
    }
    await renderArtistDetail(artistId);
  });
}

init();
