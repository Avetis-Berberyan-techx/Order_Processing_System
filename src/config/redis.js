const Redis = require("ioredis");

let redis;

function getRedisClient() {
  if (redis) {
    return redis;
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return null;
  }

  redis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1
  });

  redis.on("error", (error) => {
    console.warn("Redis connection error:", error.message);
  });

  return redis;
}

async function ensureRedisConnection(client) {
  if (!client || client.status === "ready" || client.status === "connecting") {
    return;
  }

  await client.connect();
}

module.exports = { getRedisClient, ensureRedisConnection };
