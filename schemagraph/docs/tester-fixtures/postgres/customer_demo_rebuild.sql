-- =============================================================================
-- Que tester pack — rebuild customer_demo source DB (schema + ~11k rows)
-- Shareable one-file rebuild. Prefer this over the large INSERT dump.
-- =============================================================================
-- Apply AFTER creating database customer_demo (see README.md / PDF §4).
-- =============================================================================

DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS customers CASCADE;

CREATE TABLE customers (
  id          SERIAL PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  full_name   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id          SERIAL PRIMARY KEY,
  sku         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  unit_price  NUMERIC(10, 2) NOT NULL DEFAULT 0
);

CREATE TABLE orders (
  id           SERIAL PRIMARY KEY,
  customer_id  INT NOT NULL REFERENCES customers (id),
  status       TEXT NOT NULL DEFAULT 'pending',
  ordered_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  id          SERIAL PRIMARY KEY,
  order_id    INT NOT NULL REFERENCES orders (id),
  product_id  INT NOT NULL REFERENCES products (id),
  quantity    INT NOT NULL DEFAULT 1 CHECK (quantity > 0)
);

-- ~2,500 customers
INSERT INTO customers (email, full_name, created_at)
SELECT
  CASE
    WHEN g = 1 THEN 'ada@example.com'
    WHEN g = 2 THEN 'grace@example.com'
    WHEN g = 3 THEN 'alan@example.com'
    ELSE 'user' || g || '@example.com'
  END,
  CASE
    WHEN g = 1 THEN 'Ada Lovelace'
    WHEN g = 2 THEN 'Grace Hopper'
    WHEN g = 3 THEN 'Alan Turing'
    ELSE 'Customer ' || g
  END,
  now() - ((g % 400) || ' days')::interval
FROM generate_series(1, 2500) AS g;

-- ~500 products
INSERT INTO products (sku, name, unit_price)
SELECT
  'SKU-' || lpad(g::text, 4, '0'),
  'Product ' || g,
  round((5 + random() * 95)::numeric, 2)
FROM generate_series(1, 500) AS g;

-- ~3,500 orders
INSERT INTO orders (customer_id, status, ordered_at)
SELECT
  1 + ((g * 37) % 2500),
  (ARRAY['pending', 'shipped', 'cancelled', 'delivered'])[1 + (g % 4)],
  now() - ((g % 365) || ' days')::interval
FROM generate_series(1, 3500) AS g;

-- ~4,500 order_items  → total ≈ 11,000
INSERT INTO order_items (order_id, product_id, quantity)
SELECT
  1 + ((g * 41) % 3500),
  1 + ((g * 17) % 500),
  1 + (g % 5)
FROM generate_series(1, 4500) AS g;
