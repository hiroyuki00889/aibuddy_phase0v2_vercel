import { readLatestMemory } from "../../lib/memoryStore.js";
import { getClerkUserId } from "../../lib/clerkAuth.js";

export default async function handler(req, res) {
  const { userId, reason } = await getClerkUserId(req);

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized", reason });
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // //***変更箇所**** ここから：modeごとに記憶を取得
    const mode = req.query?.mode === "wall5" ? "wall5" : "free";
    const latestMemory = await readLatestMemory(mode);
    // //***変更箇所**** ここまで

    return res.status(200).json({
      latest_memory: latestMemory
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}