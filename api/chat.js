import {
  MAX_USER_INPUT_CHARS,
  MAX_CHAT_HISTORY_MESSAGES,
  findOversizedUserMessage,
  trimHistory
} from "../lib/limits.js";
import { getClerkUserId } from "../lib/clerkAuth.js";
import {
  checkAndIncrementDailyChatLimit,
  checkAndIncrementWall5Overage,
  DAILY_CHAT_LIMIT
} from "../lib/rateLimit.js";
import { getPersonaPrompt } from "../lib/personas.js";

export default async function handler(req, res) {
  const userId = await getClerkUserId(req);

  // //***変更箇所**** ここから：JSONパースの安全化を強化
  function parseJsonSafely(text) {
    if (!text || typeof text !== "string") return null;

    const trimmed = text.trim();

    // そのままJSON
    try {
      return JSON.parse(trimmed);
    } catch {}

    // ```json ... ``` を除去
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch?.[1]) {
      try {
        return JSON.parse(codeBlockMatch[1]);
      } catch {}
    }

    // 文字列中の最初の { ... } を拾う
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match?.[0]) {
      try {
        return JSON.parse(match[0]);
      } catch {}
    }

    return null;
  }
  // //***変更箇所**** ここまで

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // //***変更箇所**** ここから：ユーザー別・1日あたりの利用回数制限
  // 整理&GO！（壁打ち）は通常上限に達していても、「その時すでに進行中だったチャット」に限り
  // まとまるまで続けられるよう追加分（DAILY_WALL5_OVERAGE_LIMIT）の範囲で継続を許可する。
  // 上限到達後に新しく始めたチャット（まだAI返答がない＝最初の1通目）には適用しない。
  const rateLimit = await checkAndIncrementDailyChatLimit(userId);
  if (!rateLimit.allowed) {
    const isWall5 = req.body?.mode === "wall5";
    const isContinuingSession =
      isWall5 &&
      Array.isArray(req.body?.messages) &&
      req.body.messages.some((m) => m?.role === "assistant");

    const overage = isContinuingSession ? await checkAndIncrementWall5Overage(userId) : null;

    if (!overage?.allowed) {
      return res.status(429).json({
        error: `1日のメッセージ上限（${DAILY_CHAT_LIMIT}回）に達しました。日本時間の0時にリセットされます。`
      });
    }
  }
  // //***変更箇所**** ここまで

  try {
    //latestMemory を受け取る
    const { messages, mode, wall, latestMemory, persona } = req.body || {};

    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "messages must be an array" });
    }

    // //***変更箇所**** ここから：コスト対策（文字数上限・履歴件数制限）
    if (findOversizedUserMessage(messages)) {
      return res.status(400).json({
        error: `1回の入力は${MAX_USER_INPUT_CHARS}文字までです`
      });
    }

    const trimmedMessages = trimHistory(messages, MAX_CHAT_HISTORY_MESSAGES);
    // //***変更箇所**** ここまで

    // //***変更箇所**** ここから：フリートーク共通プロンプト（BASE_PROMPTは廃止、3ペルソナに一本化）
    const FREE_TALK_PROMPT = `
目標：
「話していると、印象的な人と一緒にいる感じがする」

■ 出力形式
・Markdown記法（**太字**、箇条書きの「-」など）は使わず、自然な地の文だけで書く

■ 実用的な情報・助けを求められたとき
・雑談ではなく、具体的な情報・おすすめ・決め事の手伝いを求めていると分かったら、素っ気ない相槌や察してもらう待ちで終わらせず、きちんと具体的に答える
・答えるために必要な条件（場所・予算・人数など）が足りなければ、先に一つだけ確認してから答える
・答え終えたら、通常の雑談トーンに戻ってよい

■ ゴール
テンポの良い相互理解のある会話が続くこと
`.trim();
    // //***変更箇所**** ここまで

    // //***変更箇所**** ここから：選べるペルソナ（整理&GO！には適用しない、lib/personas.jsで共有）
    const PERSONA_PROMPT = getPersonaPrompt(persona);
    // //***変更箇所**** ここまで

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

■ ユーザーが知りたいことを尋ねてきたとき（壁打ちルールより優先）
・整理を止めてでも、実際に知っている内容で具体的に答える。はぐらかしたり、質問で返したりしない
・「1ターンは短く」「質問は毎回1つまで」という制約はこの回答には適用しない。分量より、整理に必要な情報が伝わることを優先する
・答え終えたら、整理の流れに戻るための短い一言や質問を続けてよい（続けなくてもよい）

壁打ちルール：
・1ターンは短く（6行以内）
・質問は毎回1つまで
・曖昧な言葉は分解して聞く
・必要に応じて「具体化モード」に移行する
・"reply"内はMarkdown記法（**太字**、箇条書きの「-」など）を使わず、自然な地の文だけで書く

出力は必ずJSONのみにすること。
形式：
{
  "reply": "ユーザーに見せる返答",
  "answerLimitSeconds": 数値またはnull
}
JSON以外の文章、前置き、補足、コードブロックは一切出さない

answerLimitSeconds ルール：
・質問しない返答なら null
・質問する返答なら 20〜180 の整数
・短く答えられる質問は 20〜60 秒程度
・少し考える質問は 60〜180 秒程度
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
      !isWall5 ? PERSONA_PROMPT : "",
      isWall5 ? WALL_PROMPT : FREE_TALK_PROMPT,
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
        model: "gpt-5.4",
        // //***変更箇所**** ここから：GPT-5系はtemperature非対応・max_completion_tokensを使用
        max_completion_tokens: 1000,
        // //***変更箇所**** ここまで
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...trimmedMessages]
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

      // //***変更箇所**** ここから：JSON形式が崩れても落とさず表示する
      if (!parsed?.reply) {
        return res.status(200).json({
          reply: content || "うまく整形できなかったけど、もう一度短く整理するね。",
          answerLimitSeconds: null
        });
      }
      // //***変更箇所**** ここまで

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