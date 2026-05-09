async function requireSignedInUser() {
  const res = await fetch("/api/admin/check", { credentials: "include" });
  if (res.status === 401) {
    window.location.href = "/admin-login.html";
    return false;
  }
  if (!res.ok) return false;
  return true;
}

async function logout() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  if (window.showAuthOverlay) {
    await window.showAuthOverlay("Logging out...");
  }
  window.location.href = "/login.html";
}

function setMessage(el, message, isError = false) {
  el.textContent = message;
  el.className = isError ? "error" : "helper";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showProgress(progressEl, percent) {
  if (!progressEl) return;
  progressEl.style.display = "block";
  const bar = progressEl.querySelector(".progress-bar");
  if (bar) bar.style.width = `${percent}%`;
  if (percent >= 100) {
    setTimeout(() => {
      progressEl.style.display = "none";
      if (bar) bar.style.width = "0%";
    }, 400);
  }
}

function uploadWithProgress(url, method, formData, progressEl) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.withCredentials = true;
    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.round((event.loaded / event.total) * 100);
      showProgress(progressEl, percent);
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch (err) {
          resolve({});
        }
      } else {
        let payload = {};
        try {
          payload = JSON.parse(xhr.responseText);
        } catch (err) {
          payload = {};
        }
        reject(payload);
      }
    });
    xhr.addEventListener("error", () => reject({ error: "Network error" }));
    xhr.send(formData);
  });
}

function updateDropzoneLabel(zone, files) {
  if (!zone) return;
  if (!files || files.length === 0) {
    const original = zone.getAttribute("data-placeholder") || zone.textContent;
    zone.textContent = original;
    return;
  }
  if (files.length === 1) {
    zone.textContent = files[0].name;
    return;
  }
  zone.textContent = `${files.length} files selected`;
}

function setInputFiles(input, files) {
  const dt = new DataTransfer();
  files.forEach((file) => dt.items.add(file));
  input.files = dt.files;
}

function wireDropzones(form) {
  const zones = form.querySelectorAll(".dropzone");
  zones.forEach((zone) => {
    if (zone.dataset.bound === "true") return;
    const name = zone.dataset.input;
    const input = form.querySelector(`input[type="file"][name="${name}"]`);
    if (!input) return;

    zone.setAttribute("data-placeholder", zone.textContent);
    zone.dataset.bound = "true";

    input.addEventListener("change", () => updateDropzoneLabel(zone, input.files));

    ["dragenter", "dragover"].forEach((evt) => {
      zone.addEventListener(evt, (event) => {
        event.preventDefault();
        zone.classList.add("dragover");
      });
    });
    ["dragleave", "drop"].forEach((evt) => {
      zone.addEventListener(evt, () => zone.classList.remove("dragover"));
    });

    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      const dropped = Array.from(event.dataTransfer.files || []);
      if (dropped.length === 0) return;
      const accept = input.accept;
      let filtered = dropped;
      if (accept && !accept.includes(",")) {
        if (accept.endsWith("/*")) {
          const prefix = accept.replace("/*", "");
          filtered = dropped.filter((file) => file.type.startsWith(prefix));
        }
      }
      setInputFiles(input, filtered);
      updateDropzoneLabel(zone, input.files);
    });
  });
}

function resetDropzones(form) {
  const zones = form.querySelectorAll(".dropzone");
  zones.forEach((zone) => updateDropzoneLabel(zone, []));
  form.querySelectorAll('input[type="file"]').forEach((input) => {
    input.value = "";
  });
}

async function loadPlaylists() {
  const res = await fetch("/api/admin/playlists", { credentials: "include" });
  if (!res.ok) return [];
  return res.json();
}

async function loadSongs(playlistId) {
  const res = await fetch(`/api/admin/playlists/${playlistId}/songs`, {
    credentials: "include"
  });
  if (!res.ok) return [];
  return res.json();
}

async function loadUsers() {
  const res = await fetch("/api/admin/users", { credentials: "include" });
  if (!res.ok) return [];
  return res.json();
}

async function loadArtists() {
  const res = await fetch("/api/admin/artists", { credentials: "include" });
  if (!res.ok) return [];
  return res.json();
}

async function loadAlbums() {
  const res = await fetch("/api/admin/albums", { credentials: "include" });
  if (!res.ok) return [];
  return res.json();
}

async function loadReports() {
  const res = await fetch("/api/admin/reports", { credentials: "include" });
  if (!res.ok) return null;
  return res.json();
}

function renderPlaylistAdminList(playlists) {
  const list = document.getElementById("playlistAdminList");
  list.innerHTML = "";
  if (!playlists.length) {
    list.innerHTML = `<div class="muted">No playlists yet.</div>`;
    return;
  }

  playlists.forEach((playlist) => {
    const item = document.createElement("div");
    item.className = "list-item";
    item.innerHTML = `
      <span>${playlist.title} <span class="muted">• ${playlist.folder}</span></span>
      <div class="actions-end">
        <button class="button ghost" data-action="edit">Edit</button>
        <button class="button ghost" data-action="delete">Delete</button>
      </div>
    `;

    item.querySelector('[data-action="edit"]').addEventListener("click", async () => {
      const res = await fetch(`/api/playlists/${playlist.id}`, {
        credentials: "include"
      });
      if (!res.ok) return;
      const data = await res.json();
      document.getElementById("editPlaylistId").value = playlist.id;
      document.getElementById("editPlaylistTitle").value = data.title || "";
      document.getElementById("editPlaylistDesc").value = data.description || "";
      const msg = document.getElementById("editPlaylistMsg");
      setMessage(msg, `Editing ${data.title || playlist.title}`);
    });

    item.querySelector('[data-action="delete"]').addEventListener("click", async () => {
      if (!confirm(`Delete playlist "${playlist.title}" and all its songs?`)) return;
      const res = await fetch(`/api/admin/playlists/${playlist.id}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (!res.ok) return;
      await refreshAdminData();
    });

    list.appendChild(item);
  });
}

function renderPlaylistSelect(select, playlists) {
  select.innerHTML = "";
  if (!playlists.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No playlists";
    select.appendChild(option);
    return;
  }
  playlists.forEach((playlist) => {
    const option = document.createElement("option");
    option.value = playlist.id;
    option.textContent = `${playlist.title} (${playlist.folder})`;
    select.appendChild(option);
  });
}

function renderSongAdminList(songs) {
  const list = document.getElementById("songAdminList");
  list.innerHTML = "";
  if (!songs.length) {
    list.innerHTML = `<div class="muted">No songs in this playlist.</div>`;
    return;
  }

  songs.forEach((song) => {
    const item = document.createElement("div");
    item.className = "list-item";
    const artistOptions = cachedArtists
      .map((artist) => `<option value="${artist.id}" ${artist.id === song.artistId ? "selected" : ""}>${escapeHtml(artist.name)}</option>`)
      .join("");
    const albumOptions = cachedAlbums
      .map((album) => `<option value="${album.id}" ${album.id === song.albumId ? "selected" : ""}>${escapeHtml(album.title)}</option>`)
      .join("");
    item.innerHTML = `
      <span>${escapeHtml(song.title || song.filename)} <span class="muted">- ${escapeHtml(song.artistName || song.filename)}</span></span>
      <div class="actions-end">
        <input type="file" accept="audio/*" data-action="audio" hidden>
        <input type="file" accept="image/*" data-action="cover" hidden>
        <button class="button ghost" data-action="replace-audio">Replace Audio</button>
        <button class="button ghost" data-action="replace">Replace Cover</button>
        <button class="button ghost" data-action="delete">Delete</button>
      </div>
      <div class="admin-song-edit">
        <input type="text" data-field="title" value="${escapeHtml(song.title || "")}" placeholder="Song title">
        <input type="text" data-field="genre" value="${escapeHtml(song.genre || "Music")}" placeholder="Genre">
        <select data-field="artistId">${artistOptions}</select>
        <select data-field="albumId">${albumOptions}</select>
        <button class="button ghost" data-action="save-meta">Save Details</button>
      </div>
    `;

    const progress = document.createElement("div");
    progress.className = "progress";
    progress.innerHTML = `<div class="progress-bar" style="width:0%"></div>`;
    item.appendChild(progress);

    const audioInput = item.querySelector('[data-action="audio"]');
    const coverInput = item.querySelector('[data-action="cover"]');
    const replaceAudioBtn = item.querySelector('[data-action="replace-audio"]');
    const replaceBtn = item.querySelector('[data-action="replace"]');
    replaceAudioBtn.addEventListener("click", () => audioInput.click());
    replaceBtn.addEventListener("click", () => coverInput.click());
    audioInput.addEventListener("change", async () => {
      if (!audioInput.files.length) return;
      const formData = new FormData();
      formData.append("audio", audioInput.files[0]);
      try {
        await uploadWithProgress(`/api/admin/songs/${song.id}`, "PATCH", formData, progress);
        await refreshSongs();
      } catch (err) {
        // ignore
      }
    });
    coverInput.addEventListener("change", async () => {
      if (!coverInput.files.length) return;
      const formData = new FormData();
      formData.append("cover", coverInput.files[0]);
      try {
        await uploadWithProgress(`/api/admin/songs/${song.id}`, "PATCH", formData, progress);
        await refreshSongs();
      } catch (err) {
        // ignore
      }
    });

    item.querySelector('[data-action="delete"]').addEventListener("click", async () => {
      if (!confirm(`Delete song "${song.filename}"?`)) return;
      const res = await fetch(`/api/admin/songs/${song.id}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (!res.ok) return;
      await refreshSongs();
    });

    item.querySelector('[data-action="save-meta"]').addEventListener("click", async () => {
      const formData = new FormData();
      item.querySelectorAll("[data-field]").forEach((field) => {
        formData.append(field.dataset.field, field.value);
      });
      try {
        await uploadWithProgress(`/api/admin/songs/${song.id}`, "PATCH", formData, progress);
        await refreshSongs();
      } catch (err) {
        // ignore
      }
    });

    list.appendChild(item);
  });
}

function renderUserAdminList(users) {
  const list = document.getElementById("userAdminList");
  if (!list) return;
  if (!users.length) {
    list.innerHTML = `<div class="muted">No users yet.</div>`;
    return;
  }

  list.innerHTML = "";
  users.forEach((user) => {
    const item = document.createElement("div");
    item.className = "list-item";
    item.innerHTML = `
      <span>${escapeHtml(user.name)} <span class="muted">- ${escapeHtml(user.email)}</span></span>
      <div class="actions-end">
        <select data-field="subscriptionType">
          <option value="free" ${user.subscriptionType === "free" ? "selected" : ""}>Free</option>
          <option value="premium-monthly" ${user.subscriptionType === "premium-monthly" ? "selected" : ""}>Premium Monthly</option>
          <option value="premium-yearly" ${user.subscriptionType === "premium-yearly" ? "selected" : ""}>Premium Yearly</option>
          <option value="student" ${user.subscriptionType === "student" ? "selected" : ""}>Student</option>
        </select>
        <label class="inline-check">
          <input type="checkbox" data-field="isAdmin" ${user.isAdmin ? "checked" : ""}>
          Admin
        </label>
        <button class="button ghost" data-action="save">Save</button>
        <button class="button ghost" data-action="delete">Delete</button>
      </div>
    `;

    item.querySelector('[data-action="save"]').addEventListener("click", async () => {
      const payload = {
        subscriptionType: item.querySelector('[data-field="subscriptionType"]').value,
        isAdmin: item.querySelector('[data-field="isAdmin"]').checked
      };
      await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });
      await refreshUsers();
    });

    item.querySelector('[data-action="delete"]').addEventListener("click", async () => {
      if (!confirm(`Delete user "${user.email}"?`)) return;
      await fetch(`/api/admin/users/${user.id}`, {
        method: "DELETE",
        credentials: "include"
      });
      await refreshUsers();
    });

    list.appendChild(item);
  });
}

function renderArtistAdminList(artists) {
  const list = document.getElementById("artistAdminList");
  if (!list) return;
  if (!artists.length) {
    list.innerHTML = `<div class="muted">No artists yet.</div>`;
    return;
  }

  list.innerHTML = artists.map((artist) => `
    <div class="list-item" data-id="${artist.id}">
      <span>${escapeHtml(artist.name)} <span class="muted">- ${artist.songCount || 0} songs</span></span>
      <div class="actions-end">
        <button class="button ghost" data-action="edit">Edit</button>
        <button class="button ghost" data-action="delete">Delete</button>
      </div>
    </div>
  `).join("");

  list.querySelectorAll("[data-action='edit']").forEach((button) => {
    button.addEventListener("click", () => {
      const id = Number(button.closest("[data-id]").dataset.id);
      const artist = cachedArtists.find((item) => item.id === id);
      if (!artist) return;
      document.getElementById("artistId").value = artist.id;
      document.getElementById("artistName").value = artist.name;
      document.getElementById("artistBio").value = artist.bio || "";
      document.getElementById("artistImageUrl").value = artist.imageUrl || "";
      setMessage(document.getElementById("artistMsg"), `Editing ${artist.name}`);
    });
  });

  list.querySelectorAll("[data-action='delete']").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = Number(button.closest("[data-id]").dataset.id);
      if (!confirm("Delete this artist?")) return;
      const res = await fetch(`/api/admin/artists/${id}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessage(document.getElementById("artistMsg"), data.error || "Could not delete artist.", true);
        return;
      }
      await refreshArtists();
    });
  });
}

function renderReports(report) {
  const stats = document.getElementById("reportStats");
  const topSongs = document.getElementById("topSongsReport");
  if (!stats || !topSongs || !report) return;
  const totals = report.totals || {};
  const rows = [
    ["Users", totals.users],
    ["Premium", totals.premiumUsers],
    ["Songs", totals.songs],
    ["Artists", totals.artists],
    ["Albums", totals.albums],
    ["Payments", totals.payments],
    ["Revenue", `Rs ${totals.revenue || 0}`],
    ["Follows", totals.follows]
  ];
  stats.innerHTML = rows.map(([label, value]) => `
    <div class="stat-card">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value || 0}</div>
    </div>
  `).join("");

  topSongs.innerHTML = (report.topSongs || []).map((song) => `
    <div class="list-item">
      <span>${escapeHtml(song.title)}</span>
      <span class="muted">${song.likes} likes</span>
    </div>
  `).join("") || `<div class="list-item"><span>No song likes yet.</span></div>`;
}

let cachedPlaylists = [];
let cachedArtists = [];
let cachedAlbums = [];

async function refreshAdminData() {
  [cachedPlaylists, cachedArtists, cachedAlbums] = await Promise.all([
    loadPlaylists(),
    loadArtists(),
    loadAlbums()
  ]);
  renderPlaylistAdminList(cachedPlaylists);
  renderPlaylistSelect(document.getElementById("playlistSelect"), cachedPlaylists);
  renderPlaylistSelect(
    document.getElementById("managePlaylistSelect"),
    cachedPlaylists
  );
  await refreshSongs();
}

async function refreshSongs() {
  const manageSelect = document.getElementById("managePlaylistSelect");
  const playlistId = Number(manageSelect.value);
  if (!playlistId) {
    renderSongAdminList([]);
    return;
  }
  const songs = await loadSongs(playlistId);
  renderSongAdminList(songs);
}

async function refreshUsers() {
  const users = await loadUsers();
  renderUserAdminList(users);
}

async function refreshArtists() {
  cachedArtists = await loadArtists();
  renderArtistAdminList(cachedArtists);
}

async function refreshReports() {
  const report = await loadReports();
  renderReports(report);
}

async function init() {
  document.getElementById("logoutBtn").onclick = logout;
  const statusEl = document.getElementById("adminStatus");

  const ok = await requireSignedInUser();
  if (!ok) {
    statusEl.textContent = "Sign in to manage playlists and songs.";
    statusEl.className = "error";
    return;
  }

  statusEl.textContent = "Signed in.";
  statusEl.className = "muted";

  const createForm = document.getElementById("createPlaylistForm");
  const songForm = document.getElementById("addSongForm");
  const editForm = document.getElementById("editPlaylistForm");
  const artistForm = document.getElementById("artistForm");
  wireDropzones(createForm);
  wireDropzones(songForm);
  wireDropzones(editForm);

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      document.querySelectorAll(".admin-tab").forEach((section) => {
        section.classList.toggle("hidden", section.dataset.tab !== tab);
      });
      if (tab === "users") await refreshUsers();
      if (tab === "artists") await refreshArtists();
      if (tab === "reports") await refreshReports();
    });
  });

  await refreshAdminData();

  const createMsg = document.getElementById("createPlaylistMsg");
  const createProgress = document.getElementById("createPlaylistProgress");
  createForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage(createMsg, "");
    try {
      const formData = new FormData(createForm);
      await uploadWithProgress("/api/admin/playlists", "POST", formData, createProgress);
      setMessage(createMsg, "Created Successfully");
      createForm.reset();
      resetDropzones(createForm);
      await refreshAdminData();
    } catch (err) {
      setMessage(createMsg, err.error || "Failed to create playlist.", true);
    }
  });

  const songMsg = document.getElementById("addSongMsg");
  const songProgress = document.getElementById("addSongProgress");
  songForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage(songMsg, "");
    try {
      const formData = new FormData(songForm);
      const data = await uploadWithProgress("/api/admin/songs", "POST", formData, songProgress);
      const count = data?.created || 0;
      if (count > 0) {
        setMessage(songMsg, "Uploaded Successfully");
      } else {
        setMessage(songMsg, "");
      }
      songForm.reset();
      resetDropzones(songForm);
      await refreshSongs();
    } catch (err) {
      setMessage(songMsg, err.error || "Failed to upload songs.", true);
    }
  });

  const editMsg = document.getElementById("editPlaylistMsg");
  const editProgress = document.getElementById("editPlaylistProgress");
  editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const playlistId = document.getElementById("editPlaylistId").value;
    if (!playlistId) {
      setMessage(editMsg, "Select a playlist to edit.", true);
      return;
    }
    setMessage(editMsg, "Saving changes...");
    try {
      const formData = new FormData(editForm);
      await uploadWithProgress(
        `/api/admin/playlists/${playlistId}`,
        "PATCH",
        formData,
        editProgress
      );
      setMessage(editMsg, "Playlist updated.");
      editForm.reset();
      resetDropzones(editForm);
      await refreshAdminData();
    } catch (err) {
      setMessage(editMsg, err.error || "Failed to update playlist.", true);
    }
  });

  const artistMsg = document.getElementById("artistMsg");
  artistForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const artistId = document.getElementById("artistId").value;
    const payload = Object.fromEntries(new FormData(artistForm).entries());
    const url = artistId ? `/api/admin/artists/${artistId}` : "/api/admin/artists";
    const method = artistId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage(artistMsg, data.error || "Failed to save artist.", true);
      return;
    }
    setMessage(artistMsg, "Artist saved.");
    artistForm.reset();
    document.getElementById("artistId").value = "";
    await refreshArtists();
    await refreshAdminData();
  });

  document
    .getElementById("managePlaylistSelect")
    .addEventListener("change", refreshSongs);
}

init();
