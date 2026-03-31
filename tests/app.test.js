const mongoose = require("mongoose");
const request = require("supertest");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

let replSet;
let app;
let User;
let Product;
let Order;
let OrderItem;

function summarizeOrderResponses(responses) {
  return responses.reduce(
    (summary, response) => {
      if (response.status === 201) {
        summary.success += 1;
      } else if (response.status === 409) {
        summary.conflict += 1;
      } else {
        summary.other += 1;
      }

      return summary;
    },
    { success: 0, conflict: 0, other: 0 }
  );
}

async function registerAndLogin() {
  const registerResponse = await request(app).post("/auth/register").send({
    name: "Test User",
    email: "test@example.com",
    password: "supersecret"
  });

  return registerResponse.body.token;
}

beforeAll(async () => {
  process.env.JWT_SECRET = "test-secret";
  process.env.JWT_EXPIRES_IN = "1d";
  process.env.REDIS_URL = "";

  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replSet.getUri("order_processing_test");

  const connectDatabase = require("../src/config/database");
  await connectDatabase();

  app = require("../src/app");
  User = require("../src/models/User");
  Product = require("../src/models/Product");
  Order = require("../src/models/Order");
  OrderItem = require("../src/models/OrderItem");
});

afterEach(async () => {
  await User.deleteMany({});
  await Product.deleteMany({});
  await Order.deleteMany({});
  await OrderItem.deleteMany({});
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await replSet.stop();
});

test("registers and logs in a user", async () => {
  const registerResponse = await request(app).post("/auth/register").send({
    name: "Jane",
    email: "jane@example.com",
    password: "password123"
  });

  expect(registerResponse.status).toBe(201);
  expect(registerResponse.body.token).toBeTruthy();

  const loginResponse = await request(app).post("/auth/login").send({
    email: "jane@example.com",
    password: "password123"
  });

  expect(loginResponse.status).toBe(200);
  expect(loginResponse.body.user.email).toBe("jane@example.com");
});

test("prevents overselling under concurrent order requests", async () => {
  const token = await registerAndLogin();

  const productResponse = await request(app)
    .post("/products")
    .set("Authorization", `Bearer ${token}`)
    .send({
      name: "Limited Product",
      description: "Only a few available",
      price: 19.99,
      stock: 20
    });

  expect(productResponse.status).toBe(201);
  const productId = productResponse.body.product._id;

  const concurrentRequests = Array.from({ length: 50 }, () =>
    request(app)
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [{ productId, quantity: 1 }]
      })
  );

  const responses = await Promise.all(concurrentRequests);
  const summary = summarizeOrderResponses(responses);
  const reloadedProduct = await Product.findById(productId);

  expect(summary.success).toBe(20);
  expect(summary.conflict).toBe(30);
  expect(summary.other).toBe(0);
  expect(reloadedProduct.stock).toBe(0);
});
