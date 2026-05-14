function getParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    playlistId: Number(params.get("playlist")),
    songId: Number(params.get("song")),
    file: params.get("file") || params.get("songFile")
  };
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

function formatTime(seconds) {
  if (isNaN(seconds)) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
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

function parseSongMeta(filename) {
  const clean = filename.replace(/\.[^/.]+$/, "");
  const parts = clean.split(" - ").map((part) => part.trim()).filter(Boolean);
  const artist = parts.length > 1 ? parts[0] : "Unknown Artist";
  const title = parts.length > 1 ? parts[1] : clean;
  const album = parts.length > 2 ? parts[2] : "Single";
  return { title, artist, album };
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

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.onclick = logout;
  const profileName = document.getElementById("profileName");
  const profileEmail = document.getElementById("profileEmail");
  const avatar = document.getElementById("profileAvatar");
  setText(profileName, user.name || "Soundwave Listener");
  setText(profileEmail, user.email || "");
  if (avatar) {
    const initials = (user.name || "SW")
      .split(" ")
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
    avatar.textContent = initials || "SW";
  }

  const themeToggle = document.getElementById("themeToggle");
  const themeHint = document.getElementById("themeHint");
  const storedTheme = localStorage.getItem("sw_theme") || "dark";
  if (storedTheme === "light" && themeToggle && themeHint) {
    document.body.classList.add("theme-light");
    setText(themeToggle, "Switch to Dark");
    setText(themeHint, "Light mode enabled");
  }
  if (themeToggle && themeHint) {
    themeToggle.addEventListener("click", () => {
      document.body.classList.toggle("theme-light");
      const isLight = document.body.classList.contains("theme-light");
      localStorage.setItem("sw_theme", isLight ? "light" : "dark");
      setText(themeToggle, isLight ? "Switch to Dark" : "Switch to Light");
      setText(themeHint, isLight ? "Light mode enabled" : "Dark mode enabled");
    });
  }

  const { playlistId, songId, file } = getParams();
  let playlist = null;
  if (playlistId) {
    playlist = await loadPlaylist(playlistId);
  }

    const songs = playlist?.songs || [];
  let index = songs.findIndex((s) => s.id === songId);
  const songParam = Number.isNaN(songId) ? (new URLSearchParams(window.location.search).get("song") || "") : "";
  const fileName = file || songParam;
  if (index === -1 && fileName) {
    const decoded = decodeURIComponent(fileName);
    index = songs.findIndex((s) => s.filename === decoded);
  }
  if (index === -1) index = 0;

  const audio = new Audio();
  const title = document.getElementById("trackTitle");
  const meta = document.getElementById("trackMeta");
  const time = document.getElementById("trackTime");
  const playIcon = document.getElementById("playIcon");
  const album = document.getElementById("albumArt");
  const volumeIcon = document.getElementById("volumeIcon");
  const volumeRange = document.getElementById("volumeRange");
  const seekRange = document.getElementById("seekRange");
  const nextTrackEl = document.getElementById("nextTrack");
  const upNextTrackEl = document.getElementById("upNextTrack");
  const queueList = document.getElementById("queueList");
  const libraryList = document.getElementById("libraryList");
  const recommendList = document.getElementById("recommendList");
  const categoryGrid = document.getElementById("categoryGrid");
  const historyList = document.getElementById("historyList");
  const recentList = document.getElementById("recentList");
  const playCounter = document.getElementById("playCounter");
  const likeBtn = document.getElementById("likeBtn");
  const shuffleBtn = document.getElementById("shuffleBtn");
  const repeatBtn = document.getElementById("repeatBtn");
  const stopBtn = document.getElementById("stopBtn");
  const searchInput = document.getElementById("searchInput");
  const voiceBtn = document.getElementById("voiceBtn");
  const shareBtn = document.getElementById("shareBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const playlistSelect = document.getElementById("playlistSelect");
  const newPlaylistName = document.getElementById("newPlaylistName");
  const createPlaylistBtn = document.getElementById("createPlaylistBtn");
  const addToPlaylistBtn = document.getElementById("addToPlaylistBtn");
  const playlistList = document.getElementById("playlistList");
  const statPlays = document.getElementById("statPlays");
  const statLikes = document.getElementById("statLikes");
  const statCategory = document.getElementById("statCategory");
  const bassRange = document.getElementById("bassRange");
  const trebleRange = document.getElementById("trebleRange");
  const locationText = document.getElementById("locationText");
  const localTrending = document.getElementById("localTrending");
  const offlineToggle = document.getElementById("offlineToggle");
  const liveBtn = document.getElementById("liveBtn");

  const defaultCover = "img/music.svg";
  album.src = defaultCover;

  const likes = getJSON("sw_likes", {});
  const playCounts = getJSON("sw_play_counts", {});
  const history = getJSON("sw_history", []);
  const savedPlaylists = getJSON("sw_playlists", []);
  const isPremium = user.subscriptionType && user.subscriptionType !== "free";
  let serverLikedSongIds = new Set();

  try {
    const libraryRes = await fetch("/api/library", { credentials: "include" });
    if (libraryRes.ok) {
      const library = await libraryRes.json();
      serverLikedSongIds = new Set((library.songs || []).map((song) => song.id));
    }
  } catch (err) {
    serverLikedSongIds = new Set();
  }

  let isShuffle = false;
  let repeatMode = "all";
  let playStack = [];

  let audioContext = null;
  let bassFilter = null;
  let trebleFilter = null;

  function on(el, eventName, handler) {
    if (!el) return;
    el.addEventListener(eventName, handler);
  }

  function setText(el, value) {
    if (!el) return;
    el.textContent = value;
  }

  function setupAudioGraph() {
    if (!window.AudioContext) return;
    audioContext = new AudioContext();
    const source = audioContext.createMediaElementSource(audio);
    bassFilter = audioContext.createBiquadFilter();
    bassFilter.type = "lowshelf";
    bassFilter.frequency.value = 200;
    trebleFilter = audioContext.createBiquadFilter();
    trebleFilter.type = "highshelf";
    trebleFilter.frequency.value = 3000;
    source.connect(bassFilter);
    bassFilter.connect(trebleFilter);
    trebleFilter.connect(audioContext.destination);
  }

  function ensureAudioContext() {
    if (!audioContext && window.AudioContext) {
      setupAudioGraph();
    }
    if (audioContext && audioContext.state === "suspended") {
      audioContext.resume();
    }
  }

  function updateUpNext() {
    if (!songs.length) return;
    const nextIndex = getNextIndex(index, false);
    const upNextIndex = getNextIndex(nextIndex, false);
    nextTrackEl.textContent = songs[nextIndex]?.title || songs[nextIndex]?.filename || "-";
    upNextTrackEl.textContent = songs[upNextIndex]?.title || songs[upNextIndex]?.filename || "-";
    if (nextTrackEl?.parentElement) {
      nextTrackEl.parentElement.dataset.index = String(nextIndex);
    }
    if (upNextTrackEl?.parentElement) {
      upNextTrackEl.parentElement.dataset.index = String(upNextIndex);
    }
  }

  function getSongKey(song) {
    return `${playlistId || "local"}:${song.filename}`;
  }

  function updateLikeState(song) {
    if (!song) return;
    const key = getSongKey(song);
    const isLiked = serverLikedSongIds.has(song.id) || Boolean(likes[key]);
    likeBtn.textContent = isLiked ? "Favorited" : "Favorite";
    likeBtn.classList.toggle("active", isLiked);
  }

  function updateStats() {
    const totalPlays = Object.values(playCounts).reduce((sum, val) => sum + Number(val || 0), 0);
    const totalLikes = Math.max(Object.keys(likes).length, serverLikedSongIds.size);
    statPlays.textContent = totalPlays;
    statLikes.textContent = totalLikes;
  }

  function setTrackMeta(song) {
    if (!song) return;
    const fallback = parseSongMeta(song.filename);
    const metaInfo = {
      title: song.title || fallback.title,
      artist: song.artistName || fallback.artist,
      album: song.albumTitle || song.playlistTitle || fallback.album
    };
    title.textContent = metaInfo.title;
    meta.textContent = `${metaInfo.artist} - ${metaInfo.album}`;
  }

  function pushHistory(song) {
    const fallback = parseSongMeta(song.filename);
    const metaInfo = {
      title: song.title || fallback.title,
      artist: song.artistName || fallback.artist
    };
    const entry = {
      key: getSongKey(song),
      songId: song.id,
      playlistId: playlistId,
      title: metaInfo.title,
      artist: metaInfo.artist,
      filename: song.filename,
      fileUrl: song.fileUrl || audio.src,
      playedAt: new Date().toISOString()
    };
    const updated = [entry, ...history.filter((item) => item.key !== entry.key)].slice(0, 30);
    setJSON("sw_history", updated);
  }

  function renderHistory() {
    if (!historyList || !recentList) return;
    const stored = getJSON("sw_history", []);
    historyList.innerHTML = stored
      .slice(0, 10)
      .map((item) => `<div class="list-item"><span>${item.title}</span><span class="muted">${item.artist}</span></div>`)
      .join("") || '<div class="list-item"><span>No history yet.</span></div>';

    recentList.innerHTML = stored
      .slice(0, 5)
      .map((item) => `<div class="list-item"><span>${item.title}</span><span class="muted">${item.artist}</span></div>`)
      .join("") || '<div class="list-item"><span>No recent plays.</span></div>';
  }

  function renderLibrary(filterText = "") {
    if (!libraryList) return;
    const needle = filterText.trim().toLowerCase();
    const filtered = songs.filter((song) => {
      const metaInfo = parseSongMeta(song.filename);
      const haystack = `${metaInfo.title} ${metaInfo.artist} ${metaInfo.album}`.toLowerCase();
      return haystack.includes(needle);
    });

    if (!songs.length) {
      libraryList.innerHTML = '<div class="list-item"><span>Select a playlist to load songs.</span></div>';
      return;
    }

    libraryList.innerHTML = filtered
      .map((song, idx) => {
        const fallback = parseSongMeta(song.filename);
        const metaInfo = {
          title: song.title || fallback.title,
          artist: song.artistName || fallback.artist,
          album: song.albumTitle || fallback.album
        };
        const key = getSongKey(song);
        const liked = serverLikedSongIds.has(song.id) || Boolean(likes[key]);
        return `
          <div class="list-item">
            <span>${metaInfo.title}</span>
            <span class="muted">${metaInfo.artist}</span>
            <button class="pill-btn ${liked ? "active" : ""}" data-action="like" data-index="${idx}">${liked ? "Liked" : "Like"}</button>
            <button class="pill-btn" data-action="play" data-index="${idx}">Play</button>
          </div>
        `;
      })
      .join("") || '<div class="list-item"><span>No matches.</span></div>';
  }

  function renderCategories() {
    if (!categoryGrid) return;
    if (!songs.length) {
      categoryGrid.innerHTML = '<div class="mini-card"><div class="mini-title">Trending</div><div class="mini-list">No songs available.</div></div>';
      return;
    }
    const topHits = songs.slice(0, 3).map((song) => song.title || parseSongMeta(song.filename).title);
    const latest = songs.slice(-3).map((song) => song.title || parseSongMeta(song.filename).title);
    const trending = songs.slice(1, 4).map((song) => song.title || parseSongMeta(song.filename).title);

    categoryGrid.innerHTML = `
      <div class="mini-card">
        <div class="mini-title">Trending</div>
        <div class="mini-list">${trending.map((name) => `<div>${name}</div>`).join("")}</div>
      </div>
      <div class="mini-card">
        <div class="mini-title">Latest</div>
        <div class="mini-list">${latest.map((name) => `<div>${name}</div>`).join("")}</div>
      </div>
      <div class="mini-card">
        <div class="mini-title">Top Hits</div>
        <div class="mini-list">${topHits.map((name) => `<div>${name}</div>`).join("")}</div>
      </div>
    `;
  }

  function renderRecommendations() {
    if (!recommendList) return;
    if (!songs.length) {
      recommendList.innerHTML = "";
      return;
    }
    const likedKeys = new Set(Object.keys(likes));
    const sorted = [...songs]
      .filter((song, idx) => idx !== index)
      .sort((a, b) => {
        const likedA = likedKeys.has(getSongKey(a)) ? 1 : 0;
        const likedB = likedKeys.has(getSongKey(b)) ? 1 : 0;
        return likedB - likedA;
      })
      .slice(0, 6);

    recommendList.innerHTML = sorted
      .map((song) => {
        const fallback = parseSongMeta(song.filename);
        const metaInfo = {
          title: song.title || fallback.title,
          artist: song.artistName || fallback.artist
        };
        return `
          <div class="card card-compact">
            <div class="card-title">${metaInfo.title}</div>
            <div class="card-desc">${metaInfo.artist}</div>
          </div>
        `;
      })
      .join("");
  }

  function renderPlaylists() {
    if (!playlistSelect || !playlistList) return;
    const playlists = getJSON("sw_playlists", []);
    playlistSelect.innerHTML = playlists
      .map((list) => `<option value="${list.id}">${list.name}</option>`)
      .join("") || '<option value="">No playlists</option>';

    playlistList.innerHTML = playlists
      .map((list) => `<div class="list-item"><span>${list.name}</span><span class="muted">${list.songs.length} songs</span></div>`)
      .join("") || '<div class="list-item"><span>Create your first playlist.</span></div>';
  }

  function updateQueue() {
    if (!queueList) return;
    if (!songs.length) {
      queueList.innerHTML = '<div class="list-item"><span>No queue loaded.</span></div>';
      return;
    }
    updateUpNext();
  }

  function getNextIndex(currentIndex, allowRepeatOne) {
    if (repeatMode === "one" && allowRepeatOne) return currentIndex;
    if (isShuffle) {
      const available = songs.map((_, idx) => idx).filter((idx) => idx !== currentIndex);
      return available[Math.floor(Math.random() * available.length)] ?? currentIndex;
    }
    return (currentIndex + 1) % songs.length;
  }

  function loadSong() {
    if (!songs.length) {
      title.textContent = "Select a playlist to start playing";
      meta.textContent = "";
      return;
    }

    const current = songs[index];
    const folder = encodeURIComponent(playlist.folder);
    const fileName = encodeURIComponent(current.filename);
    audio.src = `/songs/${folder}/${fileName}`;
    setTrackMeta(current);
    album.src = current.coverUrl || defaultCover;
    seekRange.value = 0;
    updateUpNext();
    updateLikeState(current);

    const key = getSongKey(current);
    playCounts[key] = Number(playCounts[key] || 0) + 1;
    setJSON("sw_play_counts", playCounts);
    playCounter.textContent = `Plays: ${playCounts[key]}`;

    pushHistory(current);
    renderHistory();
    updateStats();
    renderRecommendations();
    updateQueue();

    if (downloadBtn) {
      if (isPremium) {
        downloadBtn.href = audio.src;
        downloadBtn.setAttribute("download", "");
        downloadBtn.textContent = "Download";
      } else {
        downloadBtn.href = "premium.html";
        downloadBtn.removeAttribute("download");
        downloadBtn.textContent = "Premium Download";
      }
    }
    ensureAudioContext();
    audio.play().catch(() => {});
    playIcon.src = "img/pause.svg";
  }

  function playPause() {
    if (audio.paused) {
      ensureAudioContext();
      audio.play().catch(() => {});
      playIcon.src = "img/pause.svg";
    } else {
      audio.pause();
      playIcon.src = "img/play.svg";
    }
  }

  function nextSong() {
    if (!songs.length) return;
    playStack.push(index);
    index = getNextIndex(index, true);
    loadSong();
  }

  function prevSong() {
    if (!songs.length) return;
    if (playStack.length) {
      index = playStack.pop();
    } else {
      index = (index - 1 + songs.length) % songs.length;
    }
    loadSong();
  }

  function stopSong() {
    audio.pause();
    audio.currentTime = 0;
    playIcon.src = "img/play.svg";
  }

  function syncVolumeIcon() {
    if (audio.muted || audio.volume === 0) {
      volumeIcon.src = "img/mute.svg";
    } else {
      volumeIcon.src = "img/volume.svg";
    }
  }

  function toggleShuffle() {
    isShuffle = !isShuffle;
    shuffleBtn.textContent = `Shuffle: ${isShuffle ? "On" : "Off"}`;
    shuffleBtn.classList.toggle("active", isShuffle);
  }

  function toggleRepeat() {
    if (repeatMode === "all") {
      repeatMode = "one";
    } else if (repeatMode === "one") {
      repeatMode = "off";
    } else {
      repeatMode = "all";
    }
    repeatBtn.textContent = `Repeat: ${repeatMode === "all" ? "All" : repeatMode === "one" ? "One" : "Off"}`;
    repeatBtn.classList.toggle("active", repeatMode !== "off");
  }

  async function toggleLike() {
    if (!songs.length) return;
    const current = songs[index];
    const key = getSongKey(current);
    let liked = !serverLikedSongIds.has(current.id) && !likes[key];

    if (current.id) {
      const res = await fetch(`/api/library/songs/${current.id}/toggle`, {
        method: "POST",
        credentials: "include"
      });
      if (res.ok) {
        const data = await res.json();
        liked = data.liked;
      }
    }

    if (liked) {
      likes[key] = true;
      serverLikedSongIds.add(current.id);
    } else {
      delete likes[key];
      serverLikedSongIds.delete(current.id);
    }
    setJSON("sw_likes", likes);
    updateLikeState(current);
    if (searchInput) {
      renderLibrary(searchInput.value);
    }
    updateStats();
  }

  function handleSearch() {
    if (!searchInput) return;
    renderLibrary(searchInput.value);
  }

  async function handleLibraryClick(event) {
    if (!libraryList) return;
    const btn = event.target.closest("button");
    if (!btn) return;
    const action = btn.dataset.action;
    const idx = Number(btn.dataset.index);
    if (Number.isNaN(idx)) return;
    if (action === "play") {
      index = idx;
      loadSong();
    }
    if (action === "like") {
      const song = songs[idx];
      const key = getSongKey(song);
      let liked = !serverLikedSongIds.has(song.id) && !likes[key];
      if (song.id) {
        const res = await fetch(`/api/library/songs/${song.id}/toggle`, {
          method: "POST",
          credentials: "include"
        });
        if (res.ok) {
          const data = await res.json();
          liked = data.liked;
        }
      }
      if (liked) {
        likes[key] = true;
        serverLikedSongIds.add(song.id);
      } else {
        delete likes[key];
        serverLikedSongIds.delete(song.id);
      }
      setJSON("sw_likes", likes);
      if (searchInput) {
        renderLibrary(searchInput.value);
      }
      updateStats();
    }
  }

  function setupVoiceSearch() {
    if (!voiceBtn || !searchInput) return;
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
    voiceBtn.addEventListener("click", () => {
      recognizer.start();
    });
    recognizer.addEventListener("result", (event) => {
      const transcript = event.results[0][0].transcript;
      searchInput.value = transcript;
      renderLibrary(transcript);
    });
  }

  async function handleShare() {
    if (!songs.length) return;
    const current = songs[index];
    const metaInfo = parseSongMeta(current.filename);
    const text = `Listening to ${metaInfo.title} by ${metaInfo.artist}`;
    if (navigator.share) {
      await navigator.share({ title: metaInfo.title, text, url: window.location.href });
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(`${text} - ${window.location.href}`);
      shareBtn.textContent = "Link Copied";
      setTimeout(() => {
        shareBtn.textContent = "Share";
      }, 1500);
    }
  }

  function rememberDownload(event) {
    if (!songs.length) return;
    if (!isPremium) {
      event.preventDefault();
      window.location.href = "/premium.html";
      return;
    }
    const current = songs[index];
    const fallback = parseSongMeta(current.filename);
    const entry = {
      songId: current.id,
      title: current.title || fallback.title,
      artistName: current.artistName || fallback.artist,
      fileUrl: audio.src,
      downloadedAt: new Date().toISOString()
    };
    const downloads = getJSON("sw_downloads", []);
    const updated = [entry, ...downloads.filter((item) => item.songId !== entry.songId)].slice(0, 50);
    setJSON("sw_downloads", updated);
  }

  function setupPlaylistManagement() {
    if (!createPlaylistBtn || !addToPlaylistBtn || !playlistSelect || !newPlaylistName) return;
    renderPlaylists();
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
      if (!listId || !songs.length) return;
      const updated = getJSON("sw_playlists", []);
      const list = updated.find((item) => item.id === listId);
      if (!list) return;
      const current = songs[index];
      const key = getSongKey(current);
      if (!list.songs.includes(key)) {
        list.songs.push(key);
      }
      setJSON("sw_playlists", updated);
      renderPlaylists();
    });
  }

  function setupEqualizer() {
    if (!bassRange || !trebleRange) return;
    bassRange.addEventListener("input", () => {
      if (!bassFilter) return;
      bassFilter.gain.value = Number(bassRange.value);
    });
    trebleRange.addEventListener("input", () => {
      if (!trebleFilter) return;
      trebleFilter.gain.value = Number(trebleRange.value);
    });
  }

  function setupLocation() {
    if (!locationText) return;
    if (!navigator.geolocation) {
      locationText.textContent = "Location: Unavailable";
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(2);
        const lng = position.coords.longitude.toFixed(2);
        locationText.textContent = `Location: ${lat}, ${lng}`;
      },
      () => {
        locationText.textContent = "Location: Permission denied";
      }
    );
  }

  function renderLocalTrending() {
    if (!localTrending) return;
    if (!songs.length) {
      localTrending.innerHTML = '<div class="list-item"><span>No local trends yet.</span></div>';
      return;
    }
    const picks = songs.slice(0, 3).map((song) => song.title || parseSongMeta(song.filename).title);
    localTrending.innerHTML = picks
      .map((title, idx) => `<div class="list-item" data-index="${idx}"><span>${title}</span></div>`)
      .join("");
  }

  function setupOfflineToggle() {
    if (!offlineToggle) return;
    if (!isPremium) {
      offlineToggle.checked = false;
      offlineToggle.addEventListener("change", () => {
        offlineToggle.checked = false;
        window.location.href = "/premium.html";
      });
      return;
    }
    const stored = localStorage.getItem("sw_offline") === "true";
    offlineToggle.checked = stored;
    offlineToggle.addEventListener("change", () => {
      localStorage.setItem("sw_offline", offlineToggle.checked ? "true" : "false");
    });
  }

  function setupLiveStream() {
    if (!liveBtn) return;
    liveBtn.addEventListener("click", () => {
      liveBtn.textContent = liveBtn.textContent === "Start Live Stream" ? "Live: Connected" : "Start Live Stream";
      liveBtn.classList.toggle("active");
    });
  }


  audio.addEventListener("timeupdate", () => {
    time.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
    if (!isNaN(audio.duration) && audio.duration > 0) {
      seekRange.value = Math.floor((audio.currentTime / audio.duration) * 100);
    }
  });

  audio.addEventListener("ended", () => {
    if (repeatMode === "one") {
      loadSong();
      return;
    }
    if (repeatMode === "off" && index === songs.length - 1) {
      stopSong();
      return;
    }
    nextSong();
  });

  on(document.getElementById("playBtn"), "click", playPause);
  on(document.getElementById("nextBtn"), "click", nextSong);
  on(document.getElementById("prevBtn"), "click", prevSong);
  on(stopBtn, "click", stopSong);
  on(shuffleBtn, "click", toggleShuffle);
  on(repeatBtn, "click", toggleRepeat);
  on(likeBtn, "click", toggleLike);
  on(shareBtn, "click", handleShare);
  on(downloadBtn, "click", rememberDownload);

  on(volumeRange, "input", () => {
    audio.volume = Number(volumeRange.value) / 100;
    audio.muted = false;
    syncVolumeIcon();
  });

  on(document.getElementById("muteBtn"), "click", () => {
    audio.muted = !audio.muted;
    syncVolumeIcon();
  });

  audio.volume = 0.8;
  if (volumeRange) {
    volumeRange.value = 80;
  }
  syncVolumeIcon();

  on(seekRange, "input", () => {
    if (!isNaN(audio.duration) && audio.duration > 0) {
      audio.currentTime = (Number(seekRange.value) / 100) * audio.duration;
    }
  });

  on(searchInput, "input", handleSearch);
  on(libraryList, "click", handleLibraryClick);
  on(queueList, "click", (event) => {
    if (!songs.length) return;
    const item = event.target.closest(".list-item");
    if (!item) return;
    const idx = Number(item.dataset.index);
    if (Number.isNaN(idx)) return;
    index = idx;
    loadSong();
  });
  on(localTrending, "click", (event) => {
    if (!songs.length) return;
    const item = event.target.closest(".list-item");
    if (!item) return;
    const idx = Number(item.dataset.index);
    if (Number.isNaN(idx)) return;
    index = idx;
    loadSong();
  });

  shuffleBtn.textContent = "Shuffle: Off";
  repeatBtn.textContent = "Repeat: All";

  renderLibrary();
  renderCategories();
  renderRecommendations();
  renderHistory();
  renderPlaylists();
  updateStats();
  renderLocalTrending();
  setupVoiceSearch();
  setupPlaylistManagement();
  setupEqualizer();
  setupLocation();
  setupOfflineToggle();
  setupLiveStream();

  if (songs.length) {
    loadSong();
  } else {
    title.textContent = "Select a playlist to start playing";
    meta.textContent = "No songs loaded.";
  }
}

init();






