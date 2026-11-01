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

const clerkReady = waitForClerk().then(async (clerk) => {
  await clerk.load();
  return clerk;
});

// //***変更箇所**** ここから：LPのボタンからClerkの登録・ログイン画面を開く（読み込み前や失敗時も反応を返す）
const CLERK_WAIT_MS = 10000;
const authStatusEl = document.getElementById("lpAuthStatus");
let isOpeningAuth = false;

function showAuthStatus(message) {
  authStatusEl.textContent = message;
  authStatusEl.hidden = !message;
}

async function openAuth(type) {
  if (isOpeningAuth) return;
  isOpeningAuth = true;
  showAuthStatus("読み込み中です…");

  try {
    const clerk = await Promise.race([
      clerkReady,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Clerk load timeout")), CLERK_WAIT_MS)),
    ]);
    showAuthStatus("");
    if (type === "sign-up") {
      clerk.openSignUp();
    } else {
      clerk.openSignIn();
    }
  } catch (err) {
    console.error(err);
    showAuthStatus("ログイン画面を開けませんでした。広告ブロッカーをオフにするか、別のブラウザでお試しください。");
  } finally {
    isOpeningAuth = false;
  }
}

document.querySelectorAll("[data-auth]").forEach((btn) => {
  btn.addEventListener("click", () => openAuth(btn.dataset.auth));
});
// //***変更箇所**** ここまで

async function initAuth() {
  const clerk = await clerkReady;

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
