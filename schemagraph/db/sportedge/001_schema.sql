-- SportEdge ecommerce — Postgres (PUMA + NIKE). Drops old demo tables if present.
CREATE SCHEMA IF NOT EXISTS finance;

DROP TABLE IF EXISTS finance.cod_ledger CASCADE;
DROP TABLE IF EXISTS finance.refunds CASCADE;
DROP TABLE IF EXISTS finance.payments CASCADE;
DROP TABLE IF EXISTS finance.invoices CASCADE;
DROP TABLE IF EXISTS order_warehouse_routing CASCADE;
DROP TABLE IF EXISTS delivery_addresses CASCADE;
DROP TABLE IF EXISTS order_tracking CASCADE;
DROP TABLE IF EXISTS wishlist CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS product_variants CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS warehouses CASCADE;
DROP TABLE IF EXISTS brands CASCADE;
-- Legacy customer_demo names
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS customers CASCADE;

CREATE TABLE brands (
  brand_id     SMALLINT PRIMARY KEY,
  brand_code   TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  country      TEXT NOT NULL DEFAULT 'IN',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE warehouses (
  warehouse_id   TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  city           TEXT NOT NULL,
  region_code    TEXT NOT NULL,
  serves_regions TEXT[] NOT NULL DEFAULT '{}',
  is_active      BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE customers (
  customer_id   SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT,
  full_name     TEXT NOT NULL,
  city          TEXT,
  region_code   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
  product_id    SERIAL PRIMARY KEY,
  sku           TEXT NOT NULL UNIQUE,
  brand_id      SMALLINT NOT NULL REFERENCES brands (brand_id),
  name          TEXT NOT NULL,
  category      TEXT NOT NULL,
  base_price    NUMERIC(12, 2) NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE product_variants (
  variant_id    SERIAL PRIMARY KEY,
  product_id    INT NOT NULL REFERENCES products (product_id),
  sku           TEXT NOT NULL,
  size_code     TEXT NOT NULL,
  color         TEXT NOT NULL,
  stock_hint    INT NOT NULL DEFAULT 0,
  UNIQUE (product_id, size_code, color)
);

CREATE INDEX IF NOT EXISTS idx_product_variants_sku ON product_variants (sku);

CREATE TABLE orders (
  order_id      TEXT PRIMARY KEY,
  customer_id   INT NOT NULL REFERENCES customers (customer_id),
  brand_id      SMALLINT NOT NULL REFERENCES brands (brand_id),
  status        TEXT NOT NULL DEFAULT 'pending',
  payment_type  TEXT NOT NULL DEFAULT 'prepaid',
  order_total   NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ordered_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_brand ON orders (brand_id);

CREATE TABLE order_items (
  order_item_id  SERIAL PRIMARY KEY,
  order_id       TEXT NOT NULL REFERENCES orders (order_id),
  variant_id     INT NOT NULL REFERENCES product_variants (variant_id),
  sku            TEXT NOT NULL,
  quantity       INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price     NUMERIC(12, 2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_sku ON order_items (sku);

CREATE TABLE wishlist (
  wishlist_id    SERIAL PRIMARY KEY,
  customer_id    INT NOT NULL REFERENCES customers (customer_id),
  variant_id     INT NOT NULL REFERENCES product_variants (variant_id),
  sku            TEXT NOT NULL,
  brand_id       SMALLINT NOT NULL REFERENCES brands (brand_id),
  added_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, variant_id)
);

CREATE TABLE order_tracking (
  tracking_id    SERIAL PRIMARY KEY,
  order_id       TEXT NOT NULL REFERENCES orders (order_id),
  status         TEXT NOT NULL,
  location       TEXT,
  event_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_tracking_order ON order_tracking (order_id);

CREATE TABLE delivery_addresses (
  address_id     SERIAL PRIMARY KEY,
  order_id       TEXT NOT NULL UNIQUE REFERENCES orders (order_id),
  address_line   TEXT NOT NULL,
  city           TEXT NOT NULL,
  pincode        TEXT NOT NULL,
  warehouse_id   TEXT REFERENCES warehouses (warehouse_id)
);

CREATE TABLE order_warehouse_routing (
  routing_id     SERIAL PRIMARY KEY,
  order_id       TEXT NOT NULL UNIQUE REFERENCES orders (order_id),
  warehouse_id   TEXT NOT NULL REFERENCES warehouses (warehouse_id),
  priority       SMALLINT NOT NULL DEFAULT 1,
  assigned_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE finance.invoices (
  invoice_id     TEXT PRIMARY KEY,
  order_id       TEXT NOT NULL REFERENCES public.orders (order_id),
  customer_id    INT NOT NULL REFERENCES public.customers (customer_id),
  amount         NUMERIC(12, 2) NOT NULL,
  tax_amount     NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'open',
  issued_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE finance.payments (
  payment_id     TEXT PRIMARY KEY,
  order_id       TEXT NOT NULL REFERENCES public.orders (order_id),
  method         TEXT NOT NULL,
  amount         NUMERIC(12, 2) NOT NULL,
  is_cod         BOOLEAN NOT NULL DEFAULT false,
  paid_at        TIMESTAMPTZ,
  status         TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE finance.refunds (
  refund_id      TEXT PRIMARY KEY,
  order_id       TEXT NOT NULL REFERENCES public.orders (order_id),
  customer_id    INT NOT NULL REFERENCES public.customers (customer_id),
  sku            TEXT,
  refund_amount  NUMERIC(12, 2) NOT NULL,
  reason         TEXT,
  refunded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE finance.cod_ledger (
  ledger_id      SERIAL PRIMARY KEY,
  order_id       TEXT NOT NULL UNIQUE REFERENCES public.orders (order_id),
  expected_cod   NUMERIC(12, 2) NOT NULL,
  collected_cod  NUMERIC(12, 2),
  settled_at     TIMESTAMPTZ,
  variance       NUMERIC(12, 2) GENERATED ALWAYS AS (collected_cod - expected_cod) STORED
);

INSERT INTO brands (brand_id, brand_code, name) VALUES
  (1, 'PUMA', 'Puma India'),
  (2, 'NIKE', 'Nike India')
ON CONFLICT (brand_id) DO NOTHING;

INSERT INTO warehouses (warehouse_id, name, city, region_code, serves_regions) VALUES
  ('WH-MUM-01', 'Mumbai Central FC', 'Mumbai', 'IN-WEST', ARRAY['IN-WEST', 'IN-SOUTH']),
  ('WH-DEL-01', 'Delhi NCR FC', 'Delhi', 'IN-NORTH', ARRAY['IN-NORTH', 'IN-WEST']),
  ('WH-BLR-01', 'Bangalore FC', 'Bangalore', 'IN-SOUTH', ARRAY['IN-SOUTH']),
  ('WH-CHN-01', 'Chennai FC', 'Chennai', 'IN-SOUTH', ARRAY['IN-SOUTH', 'IN-EAST']),
  ('WH-KOL-01', 'Kolkata FC', 'Kolkata', 'IN-EAST', ARRAY['IN-EAST', 'IN-NORTH'])
ON CONFLICT (warehouse_id) DO NOTHING;
