# Mini Order Processing System

Node.js backend take-home assignment for a simple e-commerce order service with JWT auth, MongoDB transactions, and concurrency-safe stock handling.

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

3. Start MongoDB as a replica set. Transactions require it.

4. Run the API:

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
