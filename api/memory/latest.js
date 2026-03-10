import { readLatestMemory } from "../../lib/memoryStore.js";

export default async function handler(req, res) {
  const ACCESS_CODE = process.env.ACCESS_CODE;
  const clientCode = req.headers["x-access-code"];

  if (!ACCESS_CODE || clientCode !== ACCESS_CODE) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const latestMemory = await readLatestMemory();
    return res.status(200).json({
      latest_memory: latestMemory
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}