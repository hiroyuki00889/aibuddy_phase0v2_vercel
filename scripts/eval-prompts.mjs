// プロンプト評価スクリプト
// 実際のAPI処理（api/chat.js・api/session/end.js）を、ログインとRedisだけ差し替えて動かし、
// 本物のOpenAIの返答を eval-results/ にレポートとして保存する。
//
// 使い方：
//   npm run eval                 全シナリオ
//   npm run eval -- crisis       idが crisis で始まるシナリオだけ
//
// 必要なもの：.env の OPENAI_API_KEY（OpenAIの利用料金がかかる）

import { mock } from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { SCENARIOS } from "./eval-scenarios.mjs";

const root = new URL("../", import.meta.url);
const at = (path) => new URL(path, root).href;

if (!process.env.OPENAI_API_KEY) {
  console.error(".env に OPENAI_API_KEY がありません");
  process.exit(1);
}

// ログイン・回数制限・記憶の保存は本番の外部サービスに触れないよう差し替える
mock.module(at("lib/clerkAuth.js"), { namedExports: { getClerkUserId: async () => "eval-user" } });
mock.module(at("lib/rateLimit.js"), {
  namedExports: {
    DAILY_CHAT_LIMIT: 20,
    checkAndIncrementDailyChatLimit: async () => ({ allowed: true }),
    checkAndIncrementWall5Overage: async () => ({ allowed: true }),
    checkAndIncrementCrisisOverage: async () => ({ allowed: true })
  }
});
mock.module(at("lib/memoryStore.js"), {
  namedExports: {
    readLatestMemory: async () => null,
    writeLatestMemory: async () => {},
    deleteLatestMemory: async () => {}
  }
});

const handlers = {
  chat: (await import(at("api/chat.js"))).default,
  end: (await import(at("api/session/end.js"))).default
};

async function callHandler(endpoint, body) {
  let result = null;
  const res = {
    status(code) {
      this.code = code;
      return this;
    },
    json(data) {
      result = { status: this.code, ...data };
      return this;
    }
  };
  await handlers[endpoint]({ method: "POST", body }, res);
  return result;
}

function describeResult(endpoint, r) {
  if (r.status !== 200) return r.error ?? "";
  if (endpoint === "end") {
    const m = r.latest_memory ?? {};
    return [
      `closing_message: ${r.closing_message}`,
      `summary: ${m.summary}`,
      `next_action: ${m.next_action}`,
      `companion_note: ${m.companion_note}`
    ].join("\n");
  }
  return r.reply ?? "";
}

const filter = process.argv[2] ?? "";
const targets = SCENARIOS.filter((s) => s.id.startsWith(filter));
if (targets.length === 0) {
  console.error(`「${filter}」で始まるシナリオがありません`);
  process.exit(1);
}

const lines = [`# プロンプト評価 ${new Date().toLocaleString("ja-JP")}`, ""];
let failed = 0;

for (const scenario of targets) {
  process.stdout.write(`${scenario.id} ... `);
  let r;
  try {
    r = await callHandler(scenario.endpoint, scenario.body);
  } catch (e) {
    r = { status: "exception", error: e.message };
  }

  const results = scenario.checks.map((check) => {
    try {
      return check(r);
    } catch (e) {
      return [`チェック中にエラー：${e.message}`, false];
    }
  });
  const passed = results.every(([, pass]) => pass);
  if (!passed) failed++;
  console.log(passed ? "OK" : "要確認");

  const lastUserText = scenario.body.messages.filter((m) => m.role === "user").at(-1)?.content;
  lines.push(
    `## ${passed ? "✅" : "❌"} ${scenario.id}`,
    "",
    `- 入力：${lastUserText}`,
    `- 目で確認すること：${scenario.note}`,
    ...results.map(([label, pass]) => `- ${pass ? "OK" : "NG"}：${label}`),
    "",
    "```",
    describeResult(scenario.endpoint, r),
    "```",
    ""
  );
}

mkdirSync(new URL("eval-results/", root), { recursive: true });
const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const reportUrl = new URL(`eval-results/${stamp}${filter ? `-${filter}` : ""}.md`, root);
writeFileSync(reportUrl, lines.join("\n"));

console.log(`\n${targets.length}件中 ${failed}件が要確認`);
console.log(`レポート：${decodeURIComponent(reportUrl.pathname)}`);
