async function redirectIfLoggedIn() {
  try {
    const res = await fetch("/api/me", { credentials: "include" });
    if (res.ok) {
      window.location.href = "/home.html";
    }
  } catch (err) {
    // ignore
  }
}

redirectIfLoggedIn();
