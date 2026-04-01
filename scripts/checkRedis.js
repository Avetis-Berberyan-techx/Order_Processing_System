require("dotenv").config();

const { getRedisClient, ensureRedisConnection } = require("../src/config/redis");

async function main() {
  const client = getRedisClient();

  if (!client) {
    throw new Error("REDIS_URL is not configured");
  }

  await ensureRedisConnection(client);
  const pong = await client.ping();

  console.log(`Redis reachable at ${process.env.REDIS_URL}: ${pong}`);
  await client.quit();
}

main().catch((error) => {
  console.error(`Redis check failed: ${error.message}`);
  process.exit(1);
});
