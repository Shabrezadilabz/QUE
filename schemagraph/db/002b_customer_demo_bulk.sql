-- =============================================================================
-- Bulk demo rows for join / stitch testing (~10k+ across related tables).
-- Applied AFTER 002_customer_demo.sql on database: customer_demo
-- Emails user{N}@example.com are shared with Excel fixtures for cross-source joins.
-- =============================================================================

TRUNCATE order_items, orders, products, customers RESTART IDENTITY CASCADE;

-- ~2,500 customers (includes classic demo emails at the start)
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

-- ~4,500 order_items  → total rows ≈ 11,000
INSERT INTO order_items (order_id, product_id, quantity)
SELECT
  1 + ((g * 41) % 3500),
  1 + ((g * 17) % 500),
  1 + (g % 5)
FROM generate_series(1, 4500) AS g;
