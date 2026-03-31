const express = require("express");

const { authLimiter } = require("../middleware/rateLimit");
const { register, login } = require("../controllers/authController");

const router = express.Router();

router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);

module.exports = router;
