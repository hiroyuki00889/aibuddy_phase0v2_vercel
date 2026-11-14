import { redis } from "./redis.js";

// //***変更箇所**** ここから：ユーザー別・モード別の保存キーに変更
function getMemoryKey(userId, mode = "free") {
  const modeKey = mode === "wall5" ? "wall5" : "free";
  return `aibuddy:user:${userId}:latest_memory:${modeKey}`;
}

export async function readLatestMemory(userId, mode = "free") {
  const data = await redis.get(getMemoryKey(userId, mode));
  return data ?? null;
}

export async function writeLatestMemory(userId, memory, mode = "free") {
  await redis.set(getMemoryKey(userId, mode), memory);
}

// ユーザー自身の操作で記憶を消す（mode: "free" / "wall5"）
export async function deleteLatestMemory(userId, mode = "free") {
  await redis.del(getMemoryKey(userId, mode));
}
// //***変更箇所**** ここまで