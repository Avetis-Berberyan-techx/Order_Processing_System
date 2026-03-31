const Product = require("../models/Product");
const { getRedisClient, ensureRedisConnection } = require("../config/redis");
const createError = require("../utils/createError");

async function getProducts(req, res, next) {
  try {
    const redis = getRedisClient();
    let cachedProducts;

    if (redis) {
      try {
        await ensureRedisConnection(redis);
        cachedProducts = await redis.get("products:list");
      } catch (error) {
        console.warn("Redis unavailable for product cache:", error.message);
      }
    }

    if (cachedProducts) {
      return res.json({ products: JSON.parse(cachedProducts), cached: true });
    }

    const products = await Product.find()
      .select("_id name description price stock createdAt updatedAt")
      .sort({ createdAt: -1 });

    if (redis) {
      try {
        await ensureRedisConnection(redis);
        await redis.set("products:list", JSON.stringify(products), "EX", 30);
      } catch (error) {
        console.warn("Failed to write product cache:", error.message);
      }
    }

    return res.json({ products });
  } catch (error) {
    return next(error);
  }
}

async function createProduct(req, res, next) {
  try {
    const { name, description, price, stock } = req.body;

    if (!name || price === undefined || stock === undefined) {
      throw createError(400, "name, price, and stock are required");
    }

    const product = await Product.create({
      name,
      description,
      price,
      stock
    });

    const redis = getRedisClient();
    if (redis) {
      try {
        await ensureRedisConnection(redis);
        await redis.del("products:list");
      } catch (error) {
        console.warn("Failed to invalidate product cache:", error.message);
      }
    }

    return res.status(201).json({ product });
  } catch (error) {
    return next(error);
  }
}

module.exports = { createProduct, getProducts };
