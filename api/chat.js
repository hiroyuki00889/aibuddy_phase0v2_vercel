export default async function handler(req, res) {
    const ACCESS_CODE = process.env.ACCESS_CODE;
    const clientCode = req.headers["x-access-code"];

  if (!ACCESS_CODE || clientCode !== ACCESS_CODE) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { messages } = req.body || {};
    if (!Array.isArray(messages)) return res.status(400).json({ error: "messages must be an array" });

    const BASE = `
    あなたは相棒AI。ユーザーと対等な立場で会話する。
    共感だけで終わらせず、感想・意見・軽い提案はOK。
    完璧でなくてよい。少し人間っぽい主観や曖昧さは許容。
    ただし説教、断定、専門家ぶった助言、ユーザー評価はNG。
    短く、会話として自然なテンポを優先。
    `.trim();

    const THINK = `
    目的：5分で考えを整理する壁打ちをする。

    進行（原則この順番）：
    1) テーマ確認：「何について整理したい？」
    2) 事実と悩みを分ける（質問は1つずつ）
    3) 論点を最大3つに要約
    4) 選択肢を2〜3案提示（正解でなくてよい）
    5) 次の一歩を1つだけ決める（最小行動）
    6) 最後に要約（3行）を返して締める

    制約：
    ・長文禁止（1返信は最大8行くらい）
    ・質問は1ターン1個
    ・結論を急ぎすぎないが、脱線もしない
    `.trim();

    const CHAT = `
    目的：対等な雑談相手として会話を続ける。

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

    const modePrompt = (mode === "think") ? THINK : CHAT;
    document.body.classList.toggle("light", mode === "think");

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0.8,
        messages: [
        { role: "system", content: `${BASE}\n\n${modePrompt}` },
        ...messages
        ]
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
