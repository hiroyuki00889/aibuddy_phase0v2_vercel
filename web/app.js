const chatEl = document.getElementById("chat");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("sendBtn");
const endBtn = document.getElementById("endBtn");

// //***変更箇所**** ここから：壁打ち追加UI
const summarizeBtn = document.getElementById("summarizeBtn");
const wallDurationBox = document.getElementById("wallDurationBox");
const wallMinutesInput = document.getElementById("wallMinutesInput");
const answerTimerBox = document.getElementById("answerTimerBox");
const answerTimerText = document.getElementById("answerTimerText");
// //***変更箇所**** ここまで

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

const API_BASE = "";

let accessCode = "";
let messages = [];
let mode = "free";

//Phase2の軽い記憶を保持
let latestMemory = null;

// 5分壁打ちタイマー
let wall = {
  isActive: false,
  endAt: 0,
  timerId: null,
  durationSeconds: 5 * 60,

  // //***変更箇所**** ここから：回答用カウントダウン
  answerTimerId: null,
  answerEndAt: 0,
  answerActive: false,
  answerPromptShown: false,
  // //***変更箇所**** ここまで
};

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
  if (mode === "wall5") {
    const row = document.createElement("div");
    row.className = `wallRow ${who}`;

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

//memory取得API
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
      wall: mode === "wall5" 
        ? {
            remainingSeconds: getWallRemainingSeconds(),
            durationSeconds: wall.durationSeconds
          }
        : undefined,
      //latestMemoryを会話APIへ渡す
      latestMemory
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }

  const data = await res.json();
  return data;
}

//終了APIを分離
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

//bootをasync化してmemory取得
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
      `【壁打ち】タイマーが動くよ。
時間は ${Math.floor(wall.durationSeconds / 60)} 分にしてある。
必要なら上で変更してから始めてね。
「何をまとめたいか」を一文で教えて。`,
      "ai"
    );
  } else {
    addBubble("なんでも話して？", "ai");
  }
}

function setMode(nextMode) {
  mode = nextMode;
  modeWallBtn?.classList.toggle("active", mode === "wall5");
  modeFreeBtn?.classList.toggle("active", mode === "free");

  applyThemeByMode();

  // //***変更箇所**** ここから：壁打ちUIの表示切替
  wallDurationBox?.classList.toggle("hidden", mode !== "wall5");
  summarizeBtn?.classList.toggle("hidden", mode !== "wall5");
  if (mode !== "wall5") {
    stopAnswerTimer();
  }
  // //***変更箇所**** ここまで

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
  // //***変更箇所**** ここから
  stopAnswerTimer();
  // //***変更箇所**** ここまで
}

function formatMMSS(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

// //***変更箇所**** ここから：回答用カウントダウン
function stopAnswerTimer() {
  wall.answerActive = false;
  wall.answerEndAt = 0;
  wall.answerPromptShown = false;

  if (wall.answerTimerId) {
    clearInterval(wall.answerTimerId);
    wall.answerTimerId = null;
  }

  answerTimerText.textContent = "--:--";
  answerTimerText.classList.remove("isOver");
  answerTimerBox.classList.add("hidden");
}

function getAnswerRemainingSeconds() {
  if (!wall.answerActive) return 0;
  return Math.max(0, Math.ceil((wall.answerEndAt - Date.now()) / 1000));
}

function tickAnswerTimer() {
  const remaining = getAnswerRemainingSeconds();
  answerTimerText.textContent = formatMMSS(remaining);

  if (remaining <= 0) {
    answerTimerText.classList.add("isOver");

    if (!wall.answerPromptShown) {
      wall.answerPromptShown = true;
      addBubble("時間になったよ。短く一言でも大丈夫。今の時点の答えを返してみよう。", "ai");
    }

    stopAnswerTimer();
  }
}

function startAnswerTimer(seconds) {
  if (mode !== "wall5") return;

  stopAnswerTimer();

  const safeSeconds = Math.max(5, Number(seconds) || 20);

  wall.answerActive = true;
  wall.answerPromptShown = false;
  wall.answerEndAt = Date.now() + safeSeconds * 1000;

  answerTimerBox.classList.remove("hidden");
  answerTimerText.classList.remove("isOver");
  tickAnswerTimer();
  wall.answerTimerId = setInterval(tickAnswerTimer, 200);
}
// //***変更箇所**** ここまで

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

  // 回答を送ったら回答タイマーは止める
  // //***変更箇所**** ここから
  if (mode === "wall5") {
    stopAnswerTimer();
  }
  // //***変更箇所**** ここまで

  // wall5 のときは最初の送信でタイマー開始
  startWallTimerIfNeeded();

  inputEl.value = "";
  addBubble(text, "user");
  messages.push({ role: "user", content: text });

  try {
    setBusy(true);
    // //***変更箇所**** ここから
    const data = await apiChat();
    const reply = data?.reply ?? "";
    const answerLimitSeconds = data?.answerLimitSeconds ?? null;
    // //***変更箇所**** ここまで
    addBubble(reply, "ai");
    messages.push({ role: "assistant", content: reply });

    // //***変更箇所**** ここから：AIの質問にだけ回答用タイマーを出す
    if (mode === "wall5" && answerLimitSeconds) {
      startAnswerTimer(answerLimitSeconds);
    }
    // //***変更箇所**** ここまで
  } catch (e) {
    addBubble("ごめんね、今はうまく話せないみたい。少しだけ時間をおいて、もう一度でもいい？", "ai");
    console.error(e);
  } finally {
    setBusy(false);
    inputEl.focus();
  }
}

//終了時に memory を保存
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

//reset後に記憶込みで再起動　resetをasync化
async function reset() {
  chatEl.innerHTML = "";
  messages = [];
  modal.classList.add("hidden");

  // モード空間に戻す
  applyThemeByMode();

    // //***変更箇所**** ここから：回答タイマー停止を追加
  if (mode === "wall5") {
    stopWallTimer();
    const minutes = Math.max(1, Number(wallMinutesInput?.value || 5));
    wall.durationSeconds = minutes * 60;
    timerText.textContent = formatMMSS(wall.durationSeconds);
    progressBar.style.width = "0%";
  } else {
    stopAnswerTimer();
  }
  
  // //***変更箇所**** ここまで
  await boot();
  inputEl.focus();
}

let isComposing = false;

inputEl.addEventListener("compositionstart", () => {
  isComposing = true;
});

inputEl.addEventListener("compositionend", () => {
  isComposing = false;
});

sendBtn.addEventListener("click", send);

// //***変更箇所**** ここから：壁打ち用まとめるボタン
summarizeBtn?.addEventListener("click", async () => {
  if (mode !== "wall5") return;

  stopAnswerTimer();

  const text = "ここまでをまとめて、今の結論と要点と次の一手を出して。";
  addBubble("まとめる", "user");
  messages.push({ role: "user", content: text });

  try {
    setBusy(true);
    const data = await apiChat();
    const reply = data?.reply ?? "";
    addBubble(reply, "ai");
    messages.push({ role: "assistant", content: reply });
  } catch (e) {
    addBubble("ごめんね、今はうまく話せないみたい。少しだけ時間をおいて、もう一度でもいい？", "ai");
    console.error(e);
  } finally {
    setBusy(false);
    inputEl.focus();
  }
});
// //***変更箇所**** ここまで

// //***変更箇所**** ここから：壁打ち時間変更
wallMinutesInput?.addEventListener("change", () => {
  const minutes = Math.max(1, Math.min(30, Number(wallMinutesInput.value) || 5));
  wallMinutesInput.value = String(minutes);
  wall.durationSeconds = minutes * 60;

  if (!wall.isActive && mode === "wall5") {
    timerText.textContent = formatMMSS(wall.durationSeconds);
    progressBar.style.width = "0%";
  }
});
// //***変更箇所**** ここまで

//Enter二重送信を修正
inputEl.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  if (e.isComposing || isComposing || e.keyCode === 229) return;
  if (e.shiftKey) return;

  e.preventDefault();
  send();
});

endBtn.addEventListener("click", endSession);

resetBtn.addEventListener("click", () => {
  reset();
});

closeBtn.addEventListener("click", () => {
  modal.classList.add("hidden");
  applyThemeByMode();
});

modeWallBtn?.addEventListener("click", () => {
  setMode("wall5");
  reset();
});

modeFreeBtn?.addEventListener("click", () => {
  setMode("free");
  reset();
});

setMode("free");