// Clerkログイン管理
const gateEl = document.getElementById("gate");
const clerkSignInEl = document.getElementById("clerkSignIn");
const logoutBtn = document.getElementById("logoutBtn");

let hasBooted = false;

function waitForClerk() {
  if (window.Clerk) return Promise.resolve(window.Clerk);

  return new Promise((resolve) => {
    const timer = setInterval(() => {
      if (window.Clerk) {
        clearInterval(timer);
        resolve(window.Clerk);
      }
    }, 50);
  });
}

async function initAuth() {
  const clerk = await waitForClerk();
  await clerk.load();

  function render() {
    if (clerk.user) {
      gateEl.style.display = "none";

      if (!hasBooted && typeof window.onAibuddyAuthReady === "function") {
        hasBooted = true;
        window.onAibuddyAuthReady();
      }
    } else {
      hasBooted = false;
      gateEl.style.display = "";

      if (clerkSignInEl && !clerkSignInEl.dataset.mounted) {
        clerk.mountSignIn(clerkSignInEl);
        clerkSignInEl.dataset.mounted = "true";
      }
    }
  }

  clerk.addListener(render);
  render();
}

// APIリクエスト用の認証ヘッダーを取得
window.getClerkAuthHeaders = async function () {
  const token = await window.Clerk?.session?.getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

logoutBtn?.addEventListener("click", async () => {
  await window.Clerk?.signOut();
  location.reload();
});

initAuth();
