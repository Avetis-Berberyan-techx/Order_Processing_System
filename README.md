# Mini Order Processing System

Node.js backend take-home assignment for a simple e-commerce order service with JWT auth, MongoDB transactions, and concurrency-safe stock handling.

## Backend Overview

This application is a small REST API for users, products, and orders. It is structured as a layered Express backend:

- `src/server.js` loads environment variables, connects to MongoDB, connects to Redis, and starts the HTTP server.
- `src/app.js` builds the Express app, registers middleware, exposes `/health`, and mounts feature routes.
- `src/routes/*` maps HTTP endpoints to controller functions.
- `src/controllers/*` handles request validation, response formatting, and integration with Redis where needed.
- `src/services/*` contains reusable business logic such as JWT generation and transactional order creation.
- `src/models/*` defines the MongoDB schemas and indexes.
- `src/middleware/*` handles authentication, rate limiting, and centralized error behavior.
- `src/config/*` contains infrastructure setup for MongoDB and Redis.

## Tech Stack

- Node.js + Express
- MongoDB + Mongoose
- JWT authentication
- bcrypt password hashing
- Redis for optional product-list caching
- Jest + Supertest for API testing
- Docker Compose for local setup

## Features

- `POST /auth/register` for user registration
- `POST /auth/login` for JWT login
- `GET /products` for listing products
- `POST /products` for creating products (protected)
- `POST /orders` for placing orders (protected)
- `GET /orders` for listing a user's orders (protected)
- Rate limiting on auth and general API traffic
- Logging, centralized error handling, and health check endpoint

## Project Structure

```text
src/
├── app.js
├── server.js
├── config/
│   ├── database.js
│   └── redis.js
├── controllers/
│   ├── authController.js
│   ├── orderController.js
│   └── productController.js
├── middleware/
│   ├── authMiddleware.js
│   ├── errorMiddleware.js
│   └── rateLimit.js
├── models/
│   ├── Order.js
│   ├── OrderItem.js
│   ├── Product.js
│   └── User.js
├── routes/
│   ├── authRoutes.js
│   ├── orderRoutes.js
│   └── productRoutes.js
├── services/
│   ├── generateToken.js
│   └── orderService.js
└── utils/
    └── createError.js

tests/
└── app.test.js
```

## How The Backend Works

### Application Startup

When the API starts:

1. `src/server.js` loads `.env`.
2. MongoDB is connected through `src/config/database.js`.
3. Redis is initialized through `src/config/redis.js`.
4. The Express app from `src/app.js` begins listening on `PORT`.

Redis is optional for request handling, but when `REDIS_URL` is available the server now tries to connect during startup so connectivity issues are visible immediately.

### Request Lifecycle

A typical request moves through these layers:

1. Express middleware applies security headers, CORS, JSON parsing, request logging, and API rate limiting.
2. The request hits a route module such as `src/routes/productRoutes.js`.
3. The route calls a controller.
4. The controller validates input, calls models or services, and returns a JSON response.
5. If something fails, the error middleware produces a consistent HTTP error response.

### Routing Summary

- `/auth`
  - `POST /register`
  - `POST /login`
- `/products`
  - `GET /`
  - `POST /` protected by JWT auth
- `/orders`
  - all routes protected by JWT auth
  - `POST /`
  - `GET /`
- `/health`
  - simple service health endpoint

## Main Backend Components

### Authentication

- Registration and login live in `src/controllers/authController.js`.
- Passwords are hashed with `bcrypt` in the `User` model before save.
- JWTs are created by `src/services/generateToken.js`.
- Protected routes use `src/middleware/authMiddleware.js`, which reads the `Authorization: Bearer <token>` header and attaches the authenticated user to `req.user`.

### Products

- Product reads and writes are handled in `src/controllers/productController.js`.
- `GET /products` tries Redis first for the `products:list` cache key.
- If the cache is empty or Redis is unavailable, products are loaded from MongoDB.
- `POST /products` creates a new product and clears the cached product list.

### Orders

- HTTP handling is in `src/controllers/orderController.js`.
- Core business logic lives in `src/services/orderService.js`.
- Orders are created inside a MongoDB transaction to prevent overselling.
- Duplicate product lines in a request are normalized and grouped before stock updates happen.
- Each product stock update uses an atomic conditional decrement, so stock only changes if enough inventory exists.
- On success, the service writes one `Order` record and multiple `OrderItem` records.

### Redis

- Redis configuration lives in `src/config/redis.js`.
- The client uses `REDIS_URL` from the environment.
- Redis is currently used for product-list caching only.
- The main cache key is `products:list`.
- Cache invalidation happens after product creation and after successful order creation.
- If Redis is down, the API still works and falls back to MongoDB reads.

### Rate Limiting

- `src/middleware/rateLimit.js` defines two rate limiters:
  - a general API limiter applied app-wide
  - a stricter auth limiter applied to login and registration
- The current rate limiter store is in-memory, not Redis-backed.

## Concurrency Handling

Overselling is prevented with MongoDB transactions plus atomic stock decrements:

1. Incoming order items are normalized and grouped by `productId`.
2. The order flow starts a MongoDB session and transaction.
3. For each product, stock is decremented with:

```js
Product.updateOne(
  { _id: productId, stock: { $gte: quantity } },
  { $inc: { stock: -quantity } },
  { session }
)
```

4. If any product update fails, the transaction aborts and the order is not created.
5. Orders and order items are only persisted if all stock reservations succeed.

This guarantees stock never drops below zero even under heavy concurrent requests.

## Data Model

### User

- `name`
- `email` with unique index
- `password` hashed with bcrypt

### Product

- `name`
- `description`
- `price`
- `stock`
- indexes on `name` and `stock`

### Order

- `userId`
- `status`
- `totalAmount`
- compound index on `userId + createdAt`

### OrderItem

- `orderId`
- `productId`
- `productName`
- `unitPrice`
- `quantity`
- `lineTotal`
- compound index on `orderId + productId`

## Data Flow Examples

### Register User

1. Client sends `POST /auth/register`.
2. Controller validates `name`, `email`, and `password`.
3. `User` is created in MongoDB.
4. Password is hashed by the model hook.
5. JWT is generated and returned in the response.

### List Products

1. Client sends `GET /products`.
2. Controller checks Redis for `products:list`.
3. If cache exists, cached data is returned.
4. Otherwise products are fetched from MongoDB, cached for 30 seconds, and returned.

### Create Order

1. Client sends `POST /orders` with JWT and order items.
2. Auth middleware verifies the token and loads the user.
3. Order service groups duplicate items and validates quantities.
4. A MongoDB transaction checks stock and decrements inventory atomically.
5. `Order` and `OrderItem` documents are created.
6. Product cache is invalidated in Redis.
7. Final order payload is returned.

## Local Setup

### Option 1: Docker Compose

```bash
docker compose up --build
```

This starts:

- the Node.js API on port `3000`
- MongoDB on port `27017` with replica set `rs0`
- Redis on port `6379`

### Option 2: Manual

1. Copy environment variables:

```bash
cp .env.example .env
```

2. Install dependencies:

```bash
npm install
```

3. Start MongoDB and Redis locally:

```bash
npm run infra:up
```

If you only need Redis, you can start just that service:

```bash
npm run redis:up
```

4. Verify Redis is reachable on `localhost:6379`:

```bash
npm run redis:check
```

5. Run the API:

```bash
npm run dev
```

## Environment Variables

```bash
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/order_processing?replicaSet=rs0
JWT_SECRET=change-me
JWT_EXPIRES_IN=1d
REDIS_URL=redis://localhost:6379
```

## Example API Usage

### Register

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com","password":"password123"}'
```

### Login

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"password123"}'
```

### Create Product

```bash
curl -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT>" \
  -d '{"name":"Keyboard","description":"Mechanical keyboard","price":99.99,"stock":25}'
```

### Create Order

```bash
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT>" \
  -d '{"items":[{"productId":"<PRODUCT_ID>","quantity":2}]}'
```

## Concurrency Test

The repo includes a simple script to simulate 50-100 concurrent requests:

```bash
AUTH_TOKEN=<JWT> PRODUCT_ID=<PRODUCT_ID> CONCURRENCY=100 npm run test:concurrency
```

Expected behavior:

- successful orders stop once stock is exhausted
- remaining requests return `409 Conflict`
- product stock never goes below zero

## Tests

```bash
npm test
```

The main automated test uses an in-memory MongoDB replica set and verifies that 50 concurrent order attempts against stock of 20 result in exactly 20 successful orders and zero negative stock.

## Design Notes

- Transactions are used instead of application-only locks so stock updates remain safe across multiple app instances.
- Product snapshots are stored in `OrderItem` records to preserve historical order pricing and names.
- Redis is optional and used as a small cache for product listing plus invalidation on product creation/order placement.
- The API uses indexed queries for the most common reads: listing products, fetching user orders, and loading order items by order.
