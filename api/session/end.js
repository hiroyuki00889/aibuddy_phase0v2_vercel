import { writeLatestMemory } from "../../lib/memoryStore.js";
import { MAX_SUMMARY_HISTORY_MESSAGES, trimHistory } from "../../lib/limits.js";
import { getClerkUserId } from "../../lib/clerkAuth.js";
import { getPersonaPrompt } from "../../lib/personas.js";

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
  const userId = await getClerkUserId(req);

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messages, mode, persona } = req.body || {};

    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "messages must be an array" });
    }

    // //***変更箇所**** ここから：コスト対策（履歴件数制限）
    const trimmedMessages = trimHistory(messages, MAX_SUMMARY_HISTORY_MESSAGES);
    // //***変更箇所**** ここまで

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
  "next_action": "string",
  "companion_note": "string"
}

ルール:
- closing_message:
  - 有意義な時間だったことが伝わるようにする
  - 雑談で心に残った気持ちを一言で表す
  - 次回も話したいと思えるような、前向きな内容にする
  - 壁打ちなら、少し前に進んだ感じを出してよい
  - フリートークなら、親しみを込めて
  -一言〜二文程度で短くまとめる

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

- companion_note（フリートークの時だけ使う。壁打ちなら空文字""でよい）:
  - 次にやることの提案ではなく、相棒自身がこの会話について感じたこと・思ったことを1文だけ語る
  - 「〜だったね」「〜だなって思ったよ」のような、相棒自身の気持ちを表す言い方にする
  - 説教や評価、アドバイスにはしない
  - 30〜60文字程度

- 壁打ちモードなら、整理結果と次の一手を重視
- フリートークなら、中心話題と相棒自身の感想を重視

`.trim();

    const MODE_CONTEXT = isWall5
      ? "現在は5分壁打ちモードの終了処理です。"
      : "現在はフリートークモードの終了処理です。";

    // //***変更箇所**** ここから：フリートークのclosing_message・companion_noteに選択中のペルソナを反映
    const PERSONA_CONTEXT = !isWall5
      ? `closing_messageとcompanion_noteの話し方は、今の会話で使っていた次のペルソナに合わせること（summaryとnext_actionは対象外。通常通り中立に書く）：\n\n${getPersonaPrompt(persona)}`
      : "";
    // //***変更箇所**** ここまで

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0.7,
        max_tokens: 500,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "system", content: MODE_CONTEXT },
          ...(PERSONA_CONTEXT ? [{ role: "system", content: PERSONA_CONTEXT }] : []),
          ...trimmedMessages
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
      // //***変更箇所**** ここから：フリートーク向けの相棒自身の一言（ペルソナ反映）
      companion_note: typeof parsed.companion_note === "string" ? parsed.companion_note.trim() : "",
      // //***変更箇所**** ここまで
      mode: mode === "wall5" ? "wall5" : "free",
      created_at: new Date().toISOString()
    };

    // //***変更箇所**** ここから：ユーザー別・現在モードのキーに保存
    await writeLatestMemory(userId, latestMemory, latestMemory.mode);
    // //***変更箇所**** ここまで

    return res.status(200).json({
      closing_message: parsed.closing_message.trim(),
      latest_memory: latestMemory
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}