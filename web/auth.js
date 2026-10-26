// Clerkログイン管理
const gateEl = document.getElementById("gate");
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

// Clerkの読み込みに失敗・遅延しても、LPが隠れたままにならないようにする
setTimeout(() => document.documentElement.classList.remove("signedInHint"), 4000);

async function initAuth() {
  const clerk = await waitForClerk();
  await clerk.load();

  // //***変更箇所**** ここから：LPのボタンからClerkの登録・ログイン画面を開く
  document.querySelectorAll("[data-auth]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.auth === "sign-up") {
        clerk.openSignUp();
      } else {
        clerk.openSignIn();
      }
    });
  });
  // //***変更箇所**** ここまで

  function render() {
    // Clerkの判定が出たので、cookieによる仮の非表示を解除する
    document.documentElement.classList.remove("signedInHint");

    if (clerk.user) {
      gateEl.style.display = "none";

      if (!hasBooted && typeof window.onAibuddyAuthReady === "function") {
        hasBooted = true;
        window.onAibuddyAuthReady();
      }
    } else {
      hasBooted = false;
      gateEl.style.display = "";
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
