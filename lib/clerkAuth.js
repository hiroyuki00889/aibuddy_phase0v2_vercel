import { verifyToken } from "@clerk/backend";

// リクエストのAuthorizationヘッダーからClerkのセッションを検証し、userIdを返す
// 未ログイン・検証失敗時はnullを返す
export async function getClerkUserId(req) {
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!token || !process.env.CLERK_SECRET_KEY) return null;

  try {
    const result = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY
    });

    // verifyTokenは{ data: payload }で返る場合とpayloadを直接返す場合があるため両対応
    const payload = result?.data ?? result;
    return payload?.sub || null;
  } catch {
    return null;
  }
}
