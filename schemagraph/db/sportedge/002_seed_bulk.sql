-- SportEdge bulk seed — ~35k rows (tables recreated by 001_schema.sql).
-- Join keys align with Excel/Mongo/Databricks fixtures.

INSERT INTO customers (email, phone, full_name, city, region_code)
SELECT
  CASE WHEN g = 1 THEN 'ada@example.com' WHEN g = 2 THEN 'grace@example.com'
       WHEN g = 3 THEN 'alan@example.com' ELSE 'user' || g || '@example.com' END,
  '+91' || lpad((9000000000 + g)::text, 10, '0'),
  CASE WHEN g = 1 THEN 'Ada Lovelace' WHEN g = 2 THEN 'Grace Hopper'
       WHEN g = 3 THEN 'Alan Turing' ELSE 'Shopper ' || g END,
  (ARRAY['Mumbai','Delhi','Bangalore','Chennai','Kolkata'])[1 + (g % 5)],
  (ARRAY['IN-WEST','IN-NORTH','IN-SOUTH','IN-SOUTH','IN-EAST'])[1 + (g % 5)]
FROM generate_series(1, 2500) AS g;

INSERT INTO products (sku, brand_id, name, category, base_price)
SELECT
  CASE WHEN g <= 250 THEN 'PUMA-SKU-' || lpad(g::text, 5, '0')
       ELSE 'NIKE-SKU-' || lpad((g - 250)::text, 5, '0') END,
  CASE WHEN g <= 250 THEN 1::smallint ELSE 2::smallint END,
  CASE WHEN g <= 250 THEN 'Puma ' || g ELSE 'Nike ' || (g - 250) END,
  (ARRAY['footwear','apparel','accessories'])[1 + (g % 3)],
  round((499 + random() * 4500)::numeric, 2)
FROM generate_series(1, 500) AS g;

INSERT INTO product_variants (product_id, sku, size_code, color, stock_hint)
SELECT p.product_id, p.sku || '-' || sz.size_code, sz.size_code, sz.color,
  (p.product_id * 3 + length(sz.size_code)) % 200
FROM products p
CROSS JOIN (VALUES ('S','black'),('M','white'),('L','red'),('XL','blue')) AS sz(size_code, color)
WHERE (p.product_id + ascii(sz.size_code)) % 2 = 0;

INSERT INTO orders (order_id, customer_id, brand_id, status, payment_type, order_total, ordered_at)
SELECT 'ORD-' || lpad(g::text, 8, '0'), 1 + ((g * 37) % 2500),
  CASE WHEN g % 2 = 0 THEN 1::smallint ELSE 2::smallint END,
  (ARRAY['pending','confirmed','shipped','delivered','cancelled','returned'])[1 + (g % 6)],
  CASE WHEN g % 5 = 0 THEN 'cod' ELSE 'prepaid' END,
  round((500 + random() * 9500)::numeric, 2), now() - ((g % 400) || ' days')::interval
FROM generate_series(1, 3500) AS g;

INSERT INTO order_items (order_id, variant_id, sku, quantity, unit_price)
SELECT 'ORD-' || lpad((1 + ((g * 41) % 3500))::text, 8, '0'), pv.variant_id, pv.sku,
  1 + (g % 4), round((299 + random() * 4200)::numeric, 2)
FROM generate_series(1, 4500) AS g
JOIN product_variants pv ON pv.variant_id = 1 + ((g * 17) % (SELECT COUNT(*)::int FROM product_variants));

INSERT INTO wishlist (customer_id, variant_id, sku, brand_id, added_at)
SELECT cust_id, variant_id, sku, brand_id, added_at
FROM (
  SELECT DISTINCT ON (1 + ((g * 23) % 2500), pv.variant_id)
    1 + ((g * 23) % 2500) AS cust_id,
    pv.variant_id,
    pv.sku,
    p.brand_id,
    now() - ((g % 120) || ' days')::interval AS added_at,
    g
  FROM generate_series(1, 3000) AS g
  JOIN product_variants pv ON pv.variant_id = 1 + (g % (SELECT COUNT(*)::int FROM product_variants))
  JOIN products p ON p.product_id = pv.product_id
  ORDER BY 1 + ((g * 23) % 2500), pv.variant_id, g
) sub
LIMIT 2000;
INSERT INTO order_tracking (order_id, status, location, event_at)
SELECT 'ORD-' || lpad((1 + ((g * 13) % 3500))::text, 8, '0'),
  (ARRAY['picked','packed','in_transit','out_for_delivery','delivered','return_initiated'])[1 + (g % 6)],
  (ARRAY['WH-MUM-01','WH-DEL-01','WH-BLR-01','WH-CHN-01','WH-KOL-01','last_mile'])[1 + (g % 6)],
  now() - ((g % 60) || ' hours')::interval
FROM generate_series(1, 8000) AS g;

INSERT INTO delivery_addresses (order_id, address_line, city, pincode, warehouse_id)
SELECT o.order_id, 'Flat ' || (o.customer_id % 200) || ', Sample Street', c.city,
  lpad((400000 + (o.customer_id % 50000))::text, 6, '0'),
  (ARRAY['WH-MUM-01','WH-DEL-01','WH-BLR-01','WH-CHN-01','WH-KOL-01'])[1 + (o.customer_id % 5)]
FROM orders o JOIN customers c ON c.customer_id = o.customer_id;

INSERT INTO order_warehouse_routing (order_id, warehouse_id, priority)
SELECT o.order_id, da.warehouse_id, 1
FROM orders o JOIN delivery_addresses da ON da.order_id = o.order_id WHERE da.warehouse_id IS NOT NULL;

INSERT INTO finance.invoices (invoice_id, order_id, customer_id, amount, tax_amount, status, issued_at)
SELECT 'INV-' || o.order_id, o.order_id, o.customer_id, o.order_total, round(o.order_total * 0.18, 2),
  CASE WHEN o.status IN ('cancelled','returned') THEN 'void' ELSE 'paid' END, o.ordered_at + interval '1 hour'
FROM orders o;

INSERT INTO finance.payments (payment_id, order_id, method, amount, is_cod, paid_at, status)
SELECT 'PAY-' || o.order_id, o.order_id, CASE WHEN o.payment_type = 'cod' THEN 'cod' ELSE 'upi' END,
  o.order_total, o.payment_type = 'cod',
  CASE WHEN o.payment_type = 'cod' THEN NULL ELSE o.ordered_at + interval '2 hours' END,
  CASE WHEN o.status = 'cancelled' THEN 'failed'
       WHEN o.payment_type = 'cod' AND o.status = 'delivered' THEN 'collected'
       WHEN o.payment_type = 'cod' THEN 'pending' ELSE 'paid' END
FROM orders o;

INSERT INTO finance.refunds (refund_id, order_id, customer_id, sku, refund_amount, reason, refunded_at)
SELECT 'REF-' || o.order_id, o.order_id, o.customer_id,
  (SELECT oi.sku FROM order_items oi WHERE oi.order_id = o.order_id LIMIT 1),
  round(o.order_total * 0.9, 2),
  (ARRAY['size_issue','defect','late_delivery','wrong_item'])[1 + (o.customer_id % 4)],
  o.ordered_at + interval '10 days'
FROM orders o WHERE o.status = 'returned' LIMIT 400;

INSERT INTO finance.cod_ledger (order_id, expected_cod, collected_cod, settled_at)
SELECT o.order_id, o.order_total,
  CASE WHEN o.status = 'delivered' THEN o.order_total ELSE NULL END,
  CASE WHEN o.status = 'delivered' THEN o.ordered_at + interval '5 days' ELSE NULL END
FROM orders o WHERE o.payment_type = 'cod';
