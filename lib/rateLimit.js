import { redis } from "./redis.js";

// 1日あたりのチャット送信回数の上限（JST 0時にリセット）
export const DAILY_CHAT_LIMIT = 20;

// 通常上限に達した後も、整理&GO！（壁打ち）がまとまるまで続けられる追加分の上限
export const DAILY_WALL5_OVERAGE_LIMIT = 10;

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

function getDailyCounterKey(userId, counterName, date) {
  return `aibuddy:user:${userId}:${counterName}:${getJstDateString(date)}`;
}

async function checkAndIncrementDailyCounter(userId, counterName, limit) {
  const now = new Date();
  const key = getDailyCounterKey(userId, counterName, now);

  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, getSecondsUntilNextJstMidnight(now));
  }

  return { allowed: count <= limit, count, limit };
}

export async function checkAndIncrementDailyChatLimit(userId, limit = DAILY_CHAT_LIMIT) {
  return checkAndIncrementDailyCounter(userId, "daily_chat_count", limit);
}

// 整理&GO！用：通常上限超過後の追加分（まとめるまで続けられるようにするための猶予）
export async function checkAndIncrementWall5Overage(userId, limit = DAILY_WALL5_OVERAGE_LIMIT) {
  return checkAndIncrementDailyCounter(userId, "daily_wall5_overage_count", limit);
}
