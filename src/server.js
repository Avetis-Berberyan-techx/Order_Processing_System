require("dotenv").config();

const app = require("./app");
const connectDatabase = require("./config/database");
const { getRedisClient, ensureRedisConnection } = require("./config/redis");

const port = Number(process.env.PORT || 3000);

async function startServer() {
  await connectDatabase();

  const redis = getRedisClient();
  if (redis) {
    try {
      await ensureRedisConnection(redis);
      console.log("Redis connected");
    } catch (error) {
      console.warn("Redis unavailable at startup:", error.message);
    }
  }

  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
