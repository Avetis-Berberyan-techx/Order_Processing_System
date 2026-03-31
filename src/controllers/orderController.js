const { createOrderForUser, listOrdersForUser } = require("../services/orderService");
const { getRedisClient, ensureRedisConnection } = require("../config/redis");

async function createOrder(req, res, next) {
  try {
    const order = await createOrderForUser(req.user._id, req.body.items || []);

    const redis = getRedisClient();
    if (redis) {
      try {
        await ensureRedisConnection(redis);
        await redis.del("products:list");
      } catch (error) {
        console.warn("Failed to invalidate product cache after order:", error.message);
      }
    }

    return res.status(201).json(order);
  } catch (error) {
    return next(error);
  }
}

async function getOrders(req, res, next) {
  try {
    const orders = await listOrdersForUser(req.user._id);
    return res.json({ orders });
  } catch (error) {
    return next(error);
  }
}

module.exports = { createOrder, getOrders };
