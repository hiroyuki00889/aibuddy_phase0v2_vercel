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
      const errText = result?.errors?.map((e) => e?.message || String(e)).join("; ");
      return { userId: null, reason: `verify-no-sub: ${errText || "unknown"}` };
    }

    return { userId: result.data.sub, reason: null };
  } catch (e) {
    return { userId: null, reason: `verify-threw: ${e?.message || e}` };
  }
}
