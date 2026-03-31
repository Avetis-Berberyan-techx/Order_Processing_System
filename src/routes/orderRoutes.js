const express = require("express");

const { authenticate } = require("../middleware/authMiddleware");
const { createOrder, getOrders } = require("../controllers/orderController");

const router = express.Router();

router.use(authenticate);
router.post("/", createOrder);
router.get("/", getOrders);

module.exports = router;
