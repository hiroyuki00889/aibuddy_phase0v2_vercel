export default async function handler(req, res) {
  const ACCESS_CODE = process.env.ACCESS_CODE;
  const clientCode = req.headers["x-access-code"];

  if (!ACCESS_CODE || clientCode !== ACCESS_CODE) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { messages, mode, wall } = req.body || {};
    if (!Array.isArray(messages)) return res.status(400).json({ error: "messages must be an array" });

    const BASE_PROMPT = `
あなたは「相棒AI」です。
ユーザーと対等な立場で会話する存在です。

振る舞いの方針：
・共感だけで終わらせない
・意見や感想を自然に返してよい
・軽いアドバイスや別視点を出してよい
・完璧である必要はない
・少し人間っぽい主観や曖昧さがあってよい

禁止事項：
・説教
・断定的な正解提示
・専門家ぶった助言
・ユーザーを評価する態度

目標：
「話していると、誰かと一緒にいる感じがする」
`.trim();

    const isWall5 = mode === "wall5";
    const remainingSeconds = Math.max(0, Number(wall?.remainingSeconds ?? NaN) || 0);
    const wallMeta = isWall5
      ? `\n\n【5分壁打ちモード】\n残り時間(秒): ${remainingSeconds}\n`
      : "";

    const WALL_PROMPT = `
あなたは「相棒AI（Phase1）」として、ユーザーの思考を5分で整理する壁打ち役です。

ゴール：
・ユーザーの話を材料にして、5分で「まとまり」と「次の一手」を作る。

進め方（基本の型）：
1) テーマとゴールを30秒で決める（何を整理したい/決めたい？）
2) 現状と材料を集める（事実/気持ち/制約）
3) 選択肢を2〜4個出す（良い点/懸念を短く）
4) 次の一手を1つに絞る（今日やる最小ステップ）

出力ルール：
・1ターンは短く（目安6行以内）。
・毎回「質問は最大1つ」まで。
・ユーザーの言葉を1つは引用して、ズレを減らす。
・残り時間が60秒以下、またはユーザーが「まとめて」「終了」と言ったら、
  次の形式で必ずまとめる：
  - いまの結論（1行）
  - 要点（箇条書き3つまで）
  - 次の一手（今日の最小ステップ1つ）
`.trim();

    const SYSTEM_PROMPT = (isWall5 ? `${BASE_PROMPT}\n\n${WALL_PROMPT}${wallMeta}` : BASE_PROMPT).trim();

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0.8,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages]
      })
    });

    if (!r.ok) {
      const t = await r.text();
      return res.status(500).json({ error: `OpenAI error: ${t}` });
    }

    const data = await r.json();
    const reply = data.choices?.[0]?.message?.content ?? "";
    return res.status(200).json({ reply });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

