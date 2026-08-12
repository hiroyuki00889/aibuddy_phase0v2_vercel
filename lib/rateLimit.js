import { redis } from "./redis.js";

// 1日あたりのチャット送信回数の上限（JST 0時にリセット）
export const DAILY_CHAT_LIMIT = 20;

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function getJstDateString(date) {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  return jst.toISOString().slice(0, 10);
}

function getSecondsUntilNextJstMidnight(date) {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  const nextJstMidnight = Date.UTC(
    jst.getUTCFullYear(),
    jst.getUTCMonth(),
    jst.getUTCDate() + 1
  );
  const nextUtcMidnight = nextJstMidnight - JST_OFFSET_MS;
  return Math.max(1, Math.ceil((nextUtcMidnight - date.getTime()) / 1000));
}

function getDailyChatKey(userId, date) {
  return `aibuddy:user:${userId}:daily_chat_count:${getJstDateString(date)}`;
}

export async function checkAndIncrementDailyChatLimit(userId, limit = DAILY_CHAT_LIMIT) {
  const now = new Date();
  const key = getDailyChatKey(userId, now);

  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, getSecondsUntilNextJstMidnight(now));
  }

  return { allowed: count <= limit, count, limit };
}
