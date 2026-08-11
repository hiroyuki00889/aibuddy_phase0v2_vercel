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
      let raw;
      try {
        raw = JSON.stringify(result, Object.getOwnPropertyNames(Object(result)));
      } catch {
        raw = "stringify-failed";
      }
      return {
        userId: null,
        reason: `verify-no-sub: type=${typeof result} isUndefined=${result === void 0} raw=${raw}`
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
