import { deleteLatestMemory, readLatestMemory } from "../../lib/memoryStore.js";
import { getClerkUserId } from "../../lib/clerkAuth.js";

export default async function handler(req, res) {
  const userId = await getClerkUserId(req);

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // //***変更箇所**** ここから：マイページから記憶を削除する（mode=free / wall5 / all）
  if (req.method === "DELETE") {
    const target = req.query?.mode;
    const modes = target === "all" ? ["free", "wall5"] : target === "free" || target === "wall5" ? [target] : null;

    if (!modes) {
      return res.status(400).json({ error: "mode must be free, wall5, or all" });
    }

    try {
      await Promise.all(modes.map((m) => deleteLatestMemory(userId, m)));
      return res.status(200).json({ deleted: modes });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
  // //***変更箇所**** ここまで

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // //***変更箇所**** ここから：ユーザー別・modeごとに記憶を取得
    const mode = req.query?.mode === "wall5" ? "wall5" : "free";
    const latestMemory = await readLatestMemory(userId, mode);
    // //***変更箇所**** ここまで

    return res.status(200).json({
      latest_memory: latestMemory
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}