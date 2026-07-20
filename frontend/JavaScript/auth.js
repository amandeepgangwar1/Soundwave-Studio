async function handleAuth(formId, endpoint, errorId, redirect = "/home.html") {
  const form = document.getElementById(formId);
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorEl = document.getElementById(errorId);
    if (errorEl) errorEl.innerHTML = "";

    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message = data.error || "Authentication failed";
        if (endpoint.includes("/api/auth/login") && /user not found|invalid credentials|no account|not found/i.test(message)) {
          if (errorEl) {
            errorEl.innerHTML = `No account yet? <a href="/signup.html">Create one</a>.`;
          }
          setTimeout(() => {
            window.location.href = "/signup.html";
          }, 800);
          return;
        }
        throw new Error(message);
      }

      if (window.showAuthOverlay) {
        await window.showAuthOverlay("Logging in...");
      }
      window.location.href = redirect;
    } catch (err) {
      if (errorEl) errorEl.textContent = err.message;
    }
  });
}

handleAuth("loginForm", "/api/auth/login", "loginError");
handleAuth("signupForm", "/api/auth/signup", "signupError");
handleAuth("adminLoginForm", "/api/admin/login", "adminLoginError", "/admin.html");
handleAuth("adminSignupForm", "/api/admin/signup", "adminSignupError", "/admin.html");

document.querySelectorAll("[data-provider]").forEach((button) => {
  button.addEventListener("click", () => {
    const providerInput = document.getElementById("signupProvider");
    if (!providerInput) return;
    providerInput.value = button.dataset.provider || "email";
    document.querySelectorAll("[data-provider]").forEach((item) => {
      item.classList.toggle("active", item === button);
    });
  });
});
