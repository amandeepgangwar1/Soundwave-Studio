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
    item.innerHTML = `
      <span>${song.filename}</span>
      <div class="actions-end">
        <input type="file" accept="audio/*" data-action="audio" hidden>
        <input type="file" accept="image/*" data-action="cover" hidden>
        <button class="button ghost" data-action="replace-audio">Replace Audio</button>
        <button class="button ghost" data-action="replace">Replace Cover</button>
        <button class="button ghost" data-action="delete">Delete</button>
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

    list.appendChild(item);
  });
}

let cachedPlaylists = [];

async function refreshAdminData() {
  cachedPlaylists = await loadPlaylists();
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
  wireDropzones(createForm);
  wireDropzones(songForm);
  wireDropzones(editForm);

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      document.querySelectorAll(".admin-tab").forEach((section) => {
        section.classList.toggle("hidden", section.dataset.tab !== tab);
      });
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

  document
    .getElementById("managePlaylistSelect")
    .addEventListener("change", refreshSongs);
}

init();
