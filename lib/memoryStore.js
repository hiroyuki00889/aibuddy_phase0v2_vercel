import { redis } from "./redis.js";

const MEMORY_KEY = "aibuddy:latest_memory";

export async function readLatestMemory() {
  const data = await redis.get(MEMORY_KEY);
  return data ?? null;
}

export async function writeLatestMemory(memory) {
  await redis.set(MEMORY_KEY, memory);
}