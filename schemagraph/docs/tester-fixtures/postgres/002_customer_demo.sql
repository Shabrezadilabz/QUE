-- =============================================================================
-- Customer demo source DB — tables Stitch introspects (NOT Stitch metadata).
-- Applied to database: customer_demo (same Docker instance as stitch-pg).
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

INSERT INTO customers (email, full_name) VALUES
  ('ada@example.com', 'Ada Lovelace'),
  ('grace@example.com', 'Grace Hopper'),
  ('alan@example.com', 'Alan Turing');

INSERT INTO products (sku, name, unit_price) VALUES
  ('WIDGET-1', 'Brass Widget', 12.50),
  ('GADGET-9', 'Chrome Gadget', 44.00),
  ('BOLT-X', 'Titanium Bolt', 3.25);

INSERT INTO orders (customer_id, status) VALUES
  (1, 'shipped'),
  (1, 'pending'),
  (2, 'shipped');

INSERT INTO order_items (order_id, product_id, quantity) VALUES
  (1, 1, 2),
  (1, 3, 10),
  (2, 2, 1),
  (3, 1, 4);
