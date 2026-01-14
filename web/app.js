const chatEl = document.getElementById("chat");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("sendBtn");
const endBtn = document.getElementById("endBtn");

const modal = document.getElementById("modal");
const closingTextEl = document.getElementById("closingText");
const resetBtn = document.getElementById("resetBtn");
const closeBtn = document.getElementById("closeBtn");

const gate = document.getElementById("gate");
const passInput = document.getElementById("passInput");
const passBtn = document.getElementById("passBtn");
const passError = document.getElementById("passError");

passBtn.addEventListener("click", () => {
  const v = passInput.value.trim();
  if (!v) return;
  accessCode = v;
  gate.style.display = "none";
  boot(); // 最初の「今日はどんな夜？」を表示
});

// ここだけ自分の環境に合わせて
const API_BASE = ""; // これで同一ドメインに投げる

let accessCode = "";
let messages = []; // OpenAI形式: {role:"user"|"assistant", content:"..."}

function addBubble(text, who) {
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

async function apiChat() {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "x-access-code": accessCode
     },
    body: JSON.stringify({ messages })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }
  const data = await res.json();
  return data.reply;
}

function boot() {
  addBubble("なんでも話して？", "ai");
}

async function send() {
  const text = inputEl.value.trim();
  if (!text) return;

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

async function endSession() {
  // “締め”専用のユーザーメッセージを足す（助言禁止のまま、閉じる一言だけ返してもらう）
  const closingRequest = "ここで会話を終えたい。今日を閉じる一言を、短く静かに添えて。";
  messages.push({ role: "user", content: closingRequest });

  try {
    setBusy(true);
    const reply = await apiChat();
    closingTextEl.textContent = reply || "今日はここまで。おつかれさま。";
    modal.classList.remove("hidden");
  } catch (e) {
    closingTextEl.textContent = "今日はここまで。おつかれさま。";
    modal.classList.remove("hidden");
    console.error(e);
  } finally {
    setBusy(false);
  }
}

function reset() {
  // UIをリセット
  chatEl.innerHTML = "";
  messages = [];
  modal.classList.add("hidden");
  boot();
  inputEl.focus();
}

sendBtn.addEventListener("click", send);
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") send();
});
endBtn.addEventListener("click", endSession);

resetBtn.addEventListener("click", reset);
closeBtn.addEventListener("click", () => modal.classList.add("hidden"));

boot();
