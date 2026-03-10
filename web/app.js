const chatEl = document.getElementById("chat");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("sendBtn");
const endBtn = document.getElementById("endBtn");

// Phase1: モード切替（5分壁打ち / フリートーク）
const modeWallBtn = document.getElementById("modeWallBtn");
const modeFreeBtn = document.getElementById("modeFreeBtn");
const timerText = document.getElementById("timerText");
const progressBar = document.getElementById("progressBar");

const modal = document.getElementById("modal");
const closingTextEl = document.getElementById("closingText");
const resetBtn = document.getElementById("resetBtn");
const closeBtn = document.getElementById("closeBtn");

const gate = document.getElementById("gate");
const passInput = document.getElementById("passInput");
const passBtn = document.getElementById("passBtn");
const passError = document.getElementById("passError");

passBtn.addEventListener("click", async () => {
  const v = passInput.value.trim();
  if (!v) return;
  accessCode = v;
  gate.style.display = "none";
  await boot();
});

// ここだけ自分の環境に合わせて
const API_BASE = ""; // これで同一ドメインに投げる

let accessCode = "";
let messages = []; // OpenAI形式: {role:"user"|"assistant", content:"..."}

// mode: free=カフェ / wall5=ノート
let mode = "free"; // "free" | "wall5"

// //***変更箇所**** ここから：Phase2の超軽い記憶を保持
let latestMemory = null;
// //***変更箇所**** ここまで

// 5分壁打ちタイマー
let wall = {
  isActive: false,
  endAt: 0,
  timerId: null,
  durationSeconds: 5 * 60,
};

// ===== テーマ（空間）管理 =====
// free: カフェ / wall5: ノート / dusk: 終了演出
function setTheme(theme) {
  document.body.classList.remove("theme-free", "theme-wall", "theme-dusk");
  if (theme === "wall") document.body.classList.add("theme-wall");
  else if (theme === "dusk") document.body.classList.add("theme-dusk");
  else document.body.classList.add("theme-free");
}

function applyThemeByMode() {
  if (mode === "wall5") setTheme("wall");
  else setTheme("free");
}

function addBubble(text, who) {
  // wall5 はバブル無しの左右レイアウト
  if (mode === "wall5") {
    const row = document.createElement("div");
    row.className = `wallRow ${who}`; // ai / user

    const label = document.createElement("div");
    label.className = "wallLabel";
    label.textContent = who === "ai" ? "AI" : "あなた";

    const content = document.createElement("div");
    content.className = "wallText";
    content.textContent = text;

    row.appendChild(label);
    row.appendChild(content);

    chatEl.appendChild(row);
    chatEl.scrollTop = chatEl.scrollHeight;
    return;
  }

  // フリートークは従来どおりバブル
  const div = document.createElement("div");
  div.className = `bubble ${who}`;
  div.textContent = text;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function setBusy(isBusy) {
  sendBtn.disabled = isBusy;
  inputEl.disabled = isBusy;
  endBtn.disabled = isBusy;
  sendBtn.textContent = isBusy ? "…" : "送信";
}

function getWallRemainingSeconds() {
  if (mode !== "wall5") return 0;
  if (!wall.isActive) return wall.durationSeconds;
  return Math.max(0, Math.ceil((wall.endAt - Date.now()) / 1000));
}

// //***変更箇所**** ここから：最新記憶を取得
async function apiGetLatestMemory() {
  const res = await fetch(`${API_BASE}/api/memory/latest`, {
    method: "GET",
    headers: {
      "x-access-code": accessCode
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }

  return await res.json();
}
// //***変更箇所**** ここまで

async function apiChat() {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-access-code": accessCode
    },
    body: JSON.stringify({
      messages,
      mode,
      wall: mode === "wall5" ? { remainingSeconds: getWallRemainingSeconds() } : undefined,
      // //***変更箇所**** ここから：Phase2の記憶を会話APIへ渡す
      latestMemory
      // //***変更箇所**** ここまで
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }
  const data = await res.json();
  return data.reply;
}

// //***変更箇所**** ここから：終了時専用API
async function apiEndSession() {
  const res = await fetch(`${API_BASE}/api/session/end`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-access-code": accessCode
    },
    body: JSON.stringify({
      messages,
      mode
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }

  return await res.json();
}

function buildMemoryIntro(memory) {
  if (!memory?.summary || !memory?.next_action) return "";

  return `この前の続きからでもいけるよ。

前回は「${memory.summary}」

次の一手は
「${memory.next_action}」

続きから話す？
今日は別の話でも大丈夫。`;
}
// //***変更箇所**** ここまで

// //***変更箇所**** ここから：bootをasync化し、開始時に記憶を読む
async function boot() {
  applyThemeByMode();

  latestMemory = null;

  try {
    const memoryRes = await apiGetLatestMemory();
    latestMemory = memoryRes?.latest_memory ?? null;
  } catch (e) {
    console.error("memory load failed:", e);
    latestMemory = null;
  }

  if (latestMemory) {
    addBubble(buildMemoryIntro(latestMemory), "ai");
    return;
  }

  if (mode === "wall5") {
    addBubble(
      "【5分壁打ち】タイマーが動くよ。\nテーマと『5分で何をまとめたいか』を一文で教えて。",
      "ai"
    );
  } else {
    addBubble("なんでも話して？", "ai");
  }
}
// //***変更箇所**** ここまで

function setMode(nextMode) {
  mode = nextMode;
  modeWallBtn?.classList.toggle("active", mode === "wall5");
  modeFreeBtn?.classList.toggle("active", mode === "free");

  applyThemeByMode();

  if (mode === "free") {
    stopWallTimer();
    timerText.textContent = "--:--";
    progressBar.style.width = "0%";
  } else {
    timerText.textContent = "05:00";
    progressBar.style.width = "0%";
  }
}

function startWallTimerIfNeeded() {
  if (mode !== "wall5") return;
  if (wall.isActive) return;
  wall.isActive = true;
  wall.endAt = Date.now() + wall.durationSeconds * 1000;
  tickWallTimer();
  wall.timerId = setInterval(tickWallTimer, 200);
}

function stopWallTimer() {
  wall.isActive = false;
  wall.endAt = 0;
  if (wall.timerId) {
    clearInterval(wall.timerId);
    wall.timerId = null;
  }
}

function formatMMSS(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function tickWallTimer() {
  const remaining = getWallRemainingSeconds();
  timerText.textContent = formatMMSS(remaining);
  const progress = 1 - remaining / wall.durationSeconds;
  progressBar.style.width = `${Math.max(0, Math.min(1, progress)) * 100}%`;

  if (remaining <= 0) {
    stopWallTimer();
    addBubble("時間になった。ここまでを短くまとめる？（『まとめて』でOK）", "ai");
  }
}

async function send() {
  const text = inputEl.value.trim();
  if (!text) return;

  // wall5 のときは最初の送信でタイマー開始
  startWallTimerIfNeeded();

  inputEl.value = "";
  addBubble(text, "user");
  messages.push({ role: "user", content: text });

  try {
    setBusy(true);
    const reply = await apiChat();
    addBubble(reply, "ai");
    messages.push({ role: "assistant", content: reply });
  } catch (e) {
    addBubble("ごめんね、今はうまく話せないみたい。少しだけ時間をおいて、もう一度でもいい？", "ai");
    console.error(e);
  } finally {
    setBusy(false);
    inputEl.focus();
  }
}

// //***変更箇所**** ここから：終了APIを分離し、memoryも受け取る
async function endSession() {
  const closingRequest =
    mode === "wall5"
      ? "ここで壁打ちを終えたい。今までの内容を短くまとめて、次の一手を1つだけ出して。"
      : "ここで会話を終えたい。今日を閉じる一言を、短く静かに添えて。";

  messages.push({ role: "user", content: closingRequest });

  try {
    setBusy(true);
    const data = await apiEndSession();

    if (data?.latest_memory) {
      latestMemory = data.latest_memory;
    }

    // 終了演出：夕暮れ空間に切り替え
    setTheme("dusk");

    closingTextEl.textContent = data?.closing_message || "今日はここまで。おつかれさま。";
    modal.classList.remove("hidden");
  } catch (e) {
    setTheme("dusk");
    closingTextEl.textContent = "今日はここまで。おつかれさま。";
    modal.classList.remove("hidden");
    console.error(e);
  } finally {
    setBusy(false);
  }
}
// //***変更箇所**** ここまで

// //***変更箇所**** ここから：resetもasync化
async function reset() {
  chatEl.innerHTML = "";
  messages = [];
  modal.classList.add("hidden");

  // モード空間に戻す
  applyThemeByMode();

  if (mode === "wall5") {
    stopWallTimer();
    timerText.textContent = "05:00";
    progressBar.style.width = "0%";
  }

  await boot();
  inputEl.focus();
}
// //***変更箇所**** ここまで

// //***変更箇所**** ここから：IME変換中Enterで送信しないためのフラグ
let isComposing = false;

inputEl.addEventListener("compositionstart", () => {
  isComposing = true;
});

inputEl.addEventListener("compositionend", () => {
  isComposing = false;
});
// //***変更箇所**** ここまで

sendBtn.addEventListener("click", send);

// //***変更箇所**** ここから：Enter二重送信を修正
inputEl.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  if (e.isComposing || isComposing || e.keyCode === 229) return;
  if (e.shiftKey) return;

  e.preventDefault();
  send();
});
// //***変更箇所**** ここまで

endBtn.addEventListener("click", endSession);

resetBtn.addEventListener("click", () => {
  reset();
});

closeBtn.addEventListener("click", () => {
  modal.classList.add("hidden");
  // 閉じたら現在モードの空間に戻す
  applyThemeByMode();
});

// --- モードボタン ---
modeWallBtn?.addEventListener("click", () => {
  setMode("wall5");
  reset();
});

modeFreeBtn?.addEventListener("click", () => {
  setMode("free");
  reset();
});

// 初期状態
setMode("free");