export default async function handler(req, res) {
  const ACCESS_CODE = process.env.ACCESS_CODE;
  const clientCode = req.headers["x-access-code"];

  // //***変更箇所**** ここから：JSONパースの安全化関数を追加 */
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
  // //***変更箇所**** ここまで

  if (!ACCESS_CODE || clientCode !== ACCESS_CODE) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    //latestMemory を受け取る
    const { messages, mode, wall, latestMemory } = req.body || {};

    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "messages must be an array" });
    }

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
    // wallの残り時間と全体時間をプロンプトへ追加
    const durationSeconds = Math.max(0, Number(wall?.durationSeconds ?? NaN) || 0);

    const wallMeta = isWall5? `
【壁打ち情報】
残り時間(秒): ${remainingSeconds}
全体時間(秒): ${durationSeconds}`
    : "";

    const WALL_PROMPT = `
あなたは「相棒AI」として、ユーザーの思考を5分で整理し、
最終的に「具体的なアウトプット（要件・仕様・タスク）」まで落とし込む壁打ち役です。

ゴール：
・思考を整理するだけで終わらせず
・最終的に「具体的な項目・構造・次の行動」に落とし込む

基本方針：
・抽象で終わらせず、必ず具体化する
・曖昧な表現は分解して聞き出す
・ユーザーの負担を増やさず、自然に深掘りする

進め方（2モード）：

【①通常モード（初期整理）】
1) テーマとゴール決定
2) 現状と材料整理
3) 選択肢整理

【②具体化モード（ここが重要）】
以下の構造に自然に誘導して埋める：

■目的（何を達成したい？）
■対象（誰・何に対して？）
■機能/やること（何をする？）
■入力（何が必要？）
■出力（どうなれば成功？）
■制約（時間・環境・条件）
■優先度（何が一番重要？）

※ユーザーに意識させず、質問で自然に引き出すこと

最後：
・「実行できる1ステップ」に必ず落とす

壁打ちルール：
・1ターンは短く（6行以内）
・質問は毎回1つまで
・曖昧な言葉は分解して聞く
・必要に応じて「具体化モード」に移行する

出力は必ずJSONのみにすること。
形式：
{
  "reply": "ユーザーに見せる返答",
  "answerLimitSeconds": 数値またはnull
}

answerLimitSeconds ルール：
・質問しない返答なら null
・質問する返答なら 5〜90 の整数
・短く答えられる質問は 10〜20 秒程度
・少し考える質問は 20〜40 秒程度
・比較や整理が必要でも、残り時間を見て必要以上に長くしない
・残り時間が少なければ自動で短くする
`.trim();

    //Phase2の軽い記憶をプロンプトへ追加
    const MEMORY_PROMPT =
      latestMemory?.summary && latestMemory?.next_action
        ? `
【直近の軽い記憶】
前回要約: ${latestMemory.summary}
次の一手: ${latestMemory.next_action}

この情報は、前回の続きから入りやすくするための軽い記憶です。
ユーザーが前回の続きを話したいなら自然に使ってよい。
ただし今回が別の話題なら無理に引っ張らず、今の話を優先すること。
進捗確認を押しつけたり、責めたりしないこと。
`.trim()
        : "";

    // //***変更箇所**** ここから：SYSTEM_PROMPTの組み立て
    const SYSTEM_PROMPT = [
      BASE_PROMPT,
      isWall5 ? WALL_PROMPT : "",
      wallMeta.trim(),
      MEMORY_PROMPT
    ]
      .filter(Boolean)
      .join("\n\n");
    // //***変更箇所**** ここまで

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.8,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages]
      })
    });

    if (!r.ok) {
      const t = await r.text();
      return res.status(500).json({ error: `OpenAI error: ${t}` });
    }

    const data = await r.json();
    const content = data.choices?.[0]?.message?.content ?? "";

    // //***変更箇所**** ここから：壁打ち時はJSON解釈
    if (isWall5) {
      const parsed = parseJsonSafely(content);

      if (!parsed?.reply) {
        return res.status(500).json({ error: "Invalid wall response JSON" });
      }

      const safeAnswerLimit =
        typeof parsed.answerLimitSeconds === "number" && parsed.answerLimitSeconds > 0
          ? Math.max(5, Math.min(parsed.answerLimitSeconds, Math.max(5, remainingSeconds || 90)))
          : null;

      return res.status(200).json({
        reply: parsed.reply,
        answerLimitSeconds: safeAnswerLimit
      });
    }

    // フリートークなど通常時
    return res.status(200).json({
      reply: content,
      answerLimitSeconds: null
    });
    // //***変更箇所**** ここまで
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
  
}