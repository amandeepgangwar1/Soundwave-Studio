const planLabels = {
  free: "Free",
  premium: "Premium",
  "premium-monthly": "Premium Monthly",
  "premium-yearly": "Premium Yearly",
  student: "Student Premium"
};

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

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString();
}

function renderSubscription(data) {
  const currentPlan = document.getElementById("currentPlan");
  const history = document.getElementById("paymentHistory");
  if (currentPlan) {
    currentPlan.textContent = planLabels[data.subscriptionType] || data.subscriptionType || "Free";
  }
  if (!history) return;
  const payments = data.payments || [];
  if (!payments.length) {
    history.innerHTML = `<div class="list-item"><span>No payments yet.</span></div>`;
    return;
  }
  history.innerHTML = payments.map((payment) => `
    <div class="list-item">
      <span>${escapeHtml(planLabels[payment.plan] || payment.plan)} <span class="muted">- ${escapeHtml(payment.method)} - ${escapeHtml(payment.gateway || "gateway")}</span></span>
      <span>Rs ${payment.amount} <span class="muted">${escapeHtml(payment.status)} - ${formatDate(payment.paymentDate)}</span></span>
    </div>
  `).join("");
}

async function loadSubscription() {
  const res = await fetch("/api/subscription", { credentials: "include" });
  if (!res.ok) return;
  renderSubscription(await res.json());
}

function selectPlan(plan) {
  const selectedPlan = document.getElementById("selectedPlan");
  if (selectedPlan) selectedPlan.value = plan;
  document.querySelectorAll(".plan-card").forEach((card) => {
    card.classList.toggle("active-plan", card.dataset.plan === plan);
  });
}

async function submitPayment(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.getElementById("paymentMessage");
  if (message) {
    message.textContent = "Opening Soundwave Test Gateway...";
    message.className = "helper";
  }
  const payload = Object.fromEntries(new FormData(form).entries());

  await new Promise((resolve) => setTimeout(resolve, 600));

  const res = await fetch("/api/payments/test-gateway", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (message) {
      message.textContent = data.error || "Payment failed.";
      message.className = "error";
    }
    return;
  }
  if (message) {
    const data = await res.json();
    message.textContent = `Premium activated. Gateway payment id: ${data.gatewayPaymentId}`;
    message.className = "helper";
  }
  await loadSubscription();
}

async function init() {
  const user = await requireAuth();
  if (!user) return;

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.onclick = logout;

  document.querySelectorAll("[data-action='select-plan']").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".plan-card");
      if (card) selectPlan(card.dataset.plan);
    });
  });

  const form = document.getElementById("paymentForm");
  if (form) form.addEventListener("submit", submitPayment);

  selectPlan("monthly");
  await loadSubscription();
}

init();
