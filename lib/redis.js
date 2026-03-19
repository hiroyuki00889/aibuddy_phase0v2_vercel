import { Redis } from "@upstash/redis";

function getRedisClient() {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL;

  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error("Redis environment variables are not set");
  }

  return new Redis({ url, token });
}

export const redis = getRedisClient();