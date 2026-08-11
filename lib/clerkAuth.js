import { verifyToken } from "@clerk/backend";

// リクエストのAuthorizationヘッダーからClerkのセッションを検証し、{ userId, reason } を返す
// 未ログイン・検証失敗時は userId が null になる。reasonはデバッグ用の失敗理由
export async function getClerkUserId(req) {
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!token) return { userId: null, reason: "no-token" };

  if (!process.env.CLERK_SECRET_KEY) {
    return { userId: null, reason: "no-secret-key" };
  }

  try {
    const result = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY
    });

    if (!result?.data?.sub) {
      const errDetail = (result?.errors || []).map((e) => ({
        name: e?.name,
        message: e?.message,
        reason: e?.reason,
        action: e?.action,
        full: typeof e?.getFullMessage === "function" ? e.getFullMessage() : undefined
      }));
      return {
        userId: null,
        reason: `verify-no-sub: hasData=${!!result?.data} errors=${JSON.stringify(errDetail)}`
      };
    }

    return { userId: result.data.sub, reason: null };
  } catch (e) {
    return {
      userId: null,
      reason: `verify-threw: name=${e?.name} message=${e?.message} reason=${e?.reason}`
    };
  }
}
