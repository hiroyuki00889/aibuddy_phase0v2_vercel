import { writeLatestMemory } from "../../lib/memoryStore.js";

function parseJsonSafely(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

export default async function handler(req, res) {
  const ACCESS_CODE = process.env.ACCESS_CODE;
  const clientCode = req.headers["x-access-code"];

  if (!ACCESS_CODE || clientCode !== ACCESS_CODE) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messages, mode } = req.body || {};

    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "messages must be an array" });
    }

    const isWall5 = mode === "wall5";

    const SYSTEM_PROMPT = `
あなたは「相棒AI」のセッション終了処理です。
会話の最後に、閉じる一言と、次回につなぐための超軽い記憶を作ります。

出力は必ずJSONのみ。
説明文や前置きは禁止です。

JSON形式:
{
  "closing_message": "string",
  "summary": "string",
  "next_action": "string"
}

ルール:
- closing_message:
  - 短く自然
  - 優しいが軽い
  - 説教しない
  - 壁打ちなら、少し前に進んだ感じを出してよい
  - フリートークなら、静かに締める感じでよい

- summary:
  - 前回の会話内容を1〜3文で短くまとめる
  - 60〜140文字程度
  - 今回の中心話題や整理された内容が分かるようにする
  - 評価しない
  - 監視感を出さない

- next_action:
  - 次にやる最小ステップを1つだけ
  - 15〜50文字程度
  - 抽象的すぎず、重すぎない
  - できなかった時に責められない言い方にする

- 壁打ちモードなら、整理結果と次の一手を重視
- フリートークなら、中心話題と次に気にしたいことを重視
`.trim();

    const MODE_CONTEXT = isWall5
      ? "現在は5分壁打ちモードの終了処理です。"
      : "現在はフリートークモードの終了処理です。";

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0.7,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "system", content: MODE_CONTEXT },
          ...messages
        ]
      })
    });

    if (!r.ok) {
      const t = await r.text();
      return res.status(500).json({ error: `OpenAI error: ${t}` });
    }

    const data = await r.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    const parsed = parseJsonSafely(content);

    if (!parsed?.closing_message || !parsed?.summary || !parsed?.next_action) {
      return res.status(500).json({ error: "Failed to parse end session payload" });
    }

    const latestMemory = {
      summary: parsed.summary.trim(),
      next_action: parsed.next_action.trim(),
      mode: mode === "wall5" ? "wall5" : "free",
      created_at: new Date().toISOString()
    };

    await writeLatestMemory(latestMemory);

    return res.status(200).json({
      closing_message: parsed.closing_message.trim(),
      latest_memory: latestMemory
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}