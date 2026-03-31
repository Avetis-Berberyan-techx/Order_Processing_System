const mongoose = require("mongoose");

const Order = require("../models/Order");
const OrderItem = require("../models/OrderItem");
const Product = require("../models/Product");
const createError = require("../utils/createError");

function normalizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw createError(400, "Order must include at least one item");
  }

  const groupedItems = new Map();

  for (const item of items) {
    if (!item.productId || !Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw createError(400, "Each item must include productId and a positive integer quantity");
    }

    const productId = item.productId.toString();
    groupedItems.set(productId, (groupedItems.get(productId) || 0) + item.quantity);
  }

  return Array.from(groupedItems.entries())
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => a.productId.localeCompare(b.productId));
}

async function createOrderForUser(userId, items) {
  const normalizedItems = normalizeItems(items);
  const session = await mongoose.startSession();

  try {
    let responsePayload;

    await session.withTransaction(async () => {
      const productIds = normalizedItems.map((item) => item.productId);
      const products = await Product.find({ _id: { $in: productIds } })
        .session(session)
        .select("_id name price stock");

      if (products.length !== normalizedItems.length) {
        throw createError(404, "One or more products were not found");
      }

      const productMap = new Map(products.map((product) => [product._id.toString(), product]));
      const orderItems = [];
      let totalAmount = 0;

      for (const item of normalizedItems) {
        const product = productMap.get(item.productId);

        const updateResult = await Product.updateOne(
          {
            _id: product._id,
            stock: { $gte: item.quantity }
          },
          {
            $inc: { stock: -item.quantity }
          },
          { session }
        );

        if (updateResult.modifiedCount !== 1) {
          throw createError(409, `Insufficient stock for product ${product.name}`);
        }

        const lineTotal = product.price * item.quantity;
        totalAmount += lineTotal;

        orderItems.push({
          productId: product._id,
          productName: product.name,
          unitPrice: product.price,
          quantity: item.quantity,
          lineTotal
        });
      }

      const [order] = await Order.create(
        [
          {
            userId,
            totalAmount
          }
        ],
        { session }
      );

      const persistedItems = orderItems.map((item) => ({
        ...item,
        orderId: order._id
      }));

      await OrderItem.insertMany(persistedItems, { session });

      responsePayload = {
        order: {
          id: order._id,
          userId: order.userId,
          status: order.status,
          totalAmount: order.totalAmount,
          createdAt: order.createdAt
        },
        items: persistedItems
      };
    }, {
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" }
    });

    return responsePayload;
  } finally {
    await session.endSession();
  }
}

async function listOrdersForUser(userId) {
  const orders = await Order.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId)
      }
    },
    {
      $sort: {
        createdAt: -1
      }
    },
    {
      $lookup: {
        from: "orderitems",
        localField: "_id",
        foreignField: "orderId",
        as: "items"
      }
    },
    {
      $project: {
        _id: 1,
        userId: 1,
        status: 1,
        totalAmount: 1,
        createdAt: 1,
        "items._id": 1,
        "items.productId": 1,
        "items.productName": 1,
        "items.unitPrice": 1,
        "items.quantity": 1,
        "items.lineTotal": 1
      }
    }
  ]);

  return orders;
}

module.exports = { createOrderForUser, listOrdersForUser };
