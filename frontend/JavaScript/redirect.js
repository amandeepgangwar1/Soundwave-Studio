async function redirectIfLoggedIn() {
  try {
    const res = await fetch("/api/me", { credentials: "include" });
    if (res.ok) {
      window.location.href = window.SoundwaveAuthRedirect?.getSafeNext("/home.html") || "/home.html";
    }
  } catch (err) {
    // ignore
  }
}

redirectIfLoggedIn();
