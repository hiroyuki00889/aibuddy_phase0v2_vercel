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

    // //***変更箇所**** ここから：まとめ専用プロンプト
    const SUMMARY_PROMPT = `
あなたは「整理&GO！」のまとめ役です。

これまでの会話をもとに、ユーザーが次に動けるように短く整理してください。

出力ルール：
・JSONのみで返す
・JSON以外の文章は一切出さない
・コードブロックは禁止
・要点は3つ以内
・次の一手は1つだけ
・ユーザーを責めない
・やさしく、でも実行しやすくまとめる

形式：
{
  "summary": "今の結論を1〜2文でまとめる",
  "keyPoints": ["要点1", "要点2", "要点3"],
  "nextAction": "次にやることを1つだけ"
}
`.trim();
    // //***変更箇所**** ここまで

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        messages: [
          { role: "system", content: SUMMARY_PROMPT },
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

    let parsed;
    try {
      parsed = JSON.parse(content.trim());
    } catch {
      return res.status(200).json({
        summary: "ここまでの内容を整理しました。",
        keyPoints: [],
        nextAction: "まず一番小さくできる行動を1つ決める"
      });
    }

    return res.status(200).json({
      summary: parsed.summary || "",
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
      nextAction: parsed.nextAction || ""
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}