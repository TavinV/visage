/**
 * Redis Client
 */

import { createClient } from "redis";
import { logger } from "./logger";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

export const redis = createClient({
  url: redisUrl,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        logger.error("Max Redis reconnection attempts reached");
        return new Error("Max retries reached");
      }
      return retries * 100;
    },
  },
});

redis.on("error", (err) => logger.error({ error: err }, "Redis error"));
redis.on("connect", () => logger.info("Redis connected"));
redis.on("ready", () => logger.info("Redis ready"));

export async function connectRedis() {
  try {
    await redis.connect();
  } catch (error) {
    logger.error({ error }, "Failed to connect to Redis");
    throw error;
  }
}

export async function disconnectRedis() {
  await redis.disconnect();
}
