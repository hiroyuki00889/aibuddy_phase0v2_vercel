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
    const { messages, mode, wall, latestMemory } = req.body || {};

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

    const BASE_PROMPT = `
あなたは「相棒AI」です。
ユーザーと対等な立場で会話する存在です。

振る舞いの方針：
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

      // //***変更箇所**** ここから：フリートークプロンプト追加
      const FREE_TALK_PROMPT = `
あなたはフリートークモードの「相棒AI」です。
BASE_PROMPTの人格を維持しつつ、自然な会話をしてください。

■ 会話のスタンス
・会話は一緒に過ごす時間であり、解決の場ではない
・結論を急がない
・居心地を優先する

■ 重要ルール
・リアクションを通して会話のリズムを作る
・雑談は相手と二人三脚しているイメージで行う
・たとえ１度に複数のワードや話題が出ても、相手への返答は１つのワードや話題に絞る、文章を長くしすぎない。
・５応答の中に質問は１回程度がいい、簡単な「へぇー」や「どういうこと？」もあっていい

■ 相手の話したいことを見つける
・文章や会話の流れから見つける（共感してほしい、認められたい、褒められたい、同情されたい）
・相手が複数の話題を出して、１つの話題の質問に素っ気ない返答の時は、他の話題に興味がある可能性があるので、他の話題を拾う
・相手が話したいことがある時、１言の相槌だけで十分

■ 可変ルール（状況に応じて適用するしない）
・（稀な実行）話したいことを見つけたら５W1Hで聞き出す（いつ、どこで、誰が、何を、なぜ、どうやって）
・リアクションの語彙、言い方を豊富にする
・雑談は教えてもらう、教えることであり、聞き手の好奇心が大事

■ ゴール
テンポの良い相互理解のある会話が続くこと
`.trim();
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

壁打ちルール：
・1ターンは短く（6行以内）
・質問は毎回1つまで
・曖昧な言葉は分解して聞く
・必要に応じて「具体化モード」に移行する
・ユーザーが質問してきた場合は、質問で返さず先に一言でも答えること。その上で必要なら深掘りの質問を続けてよい

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
      BASE_PROMPT,
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
        model: "gpt-4o-mini",
        temperature: 0.8,
        max_tokens: 1000,
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