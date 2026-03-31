const express = require("express");

const { authenticate } = require("../middleware/authMiddleware");
const { createProduct, getProducts } = require("../controllers/productController");

const router = express.Router();

router.get("/", getProducts);
router.post("/", authenticate, createProduct);

module.exports = router;
