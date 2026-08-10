import { verifyToken } from "@clerk/backend";

// リクエストのAuthorizationヘッダーからClerkのセッションを検証し、userIdを返す
// 未ログイン・検証失敗時はnullを返す
export async function getClerkUserId(req) {
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!token) return null;

  if (!process.env.CLERK_SECRET_KEY) {
    console.error("clerk auth failed: CLERK_SECRET_KEY is not set");
    return null;
  }

  try {
    const result = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY
    });

    if (!result?.data?.sub) {
      console.error("clerk auth failed: verifyToken returned no sub", result?.errors);
      return null;
    }

    return result.data.sub;
  } catch (e) {
    console.error("clerk auth failed:", e?.message || e);
    return null;
  }
}
