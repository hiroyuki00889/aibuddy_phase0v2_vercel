import { redis } from "./redis.js";

// //***変更箇所**** ここから：モード別の保存キーに変更
function getMemoryKey(mode = "free") {
  return mode === "wall5"
    ? "aibuddy:latest_memory:wall5"
    : "aibuddy:latest_memory:free";
}

export async function readLatestMemory(mode = "free") {
  const data = await redis.get(getMemoryKey(mode));
  return data ?? null;
}

export async function writeLatestMemory(memory, mode = "free") {
  await redis.set(getMemoryKey(mode), memory);
}
// //***変更箇所**** ここまで