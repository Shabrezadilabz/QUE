-- SportEdge Databricks seed — join keys aligned with Postgres/Mongo/Excel
-- TRUNCATE + reload (idempotent for testing)

TRUNCATE TABLE main.sportedge.dim_brand;
INSERT INTO main.sportedge.dim_brand VALUES
  (1, 'PUMA', 'Puma India'),
  (2, 'NIKE', 'Nike India');

TRUNCATE TABLE main.sportedge.dim_warehouse;
INSERT INTO main.sportedge.dim_warehouse VALUES
  ('WH-MUM-01', 'Mumbai', 'IN-WEST'),
  ('WH-DEL-01', 'Delhi', 'IN-NORTH'),
  ('WH-BLR-01', 'Bangalore', 'IN-SOUTH'),
  ('WH-CHN-01', 'Chennai', 'IN-SOUTH'),
  ('WH-KOL-01', 'Kolkata', 'IN-EAST');

TRUNCATE TABLE main.sportedge.dim_vendor;
INSERT INTO main.sportedge.dim_vendor VALUES
  ('V-PUMA-01', 'PUMA', 'Puma Vendor India'),
  ('V-NIKE-01', 'NIKE', 'Nike Vendor India');

TRUNCATE TABLE main.sportedge.dim_customer;
INSERT INTO main.sportedge.dim_customer
SELECT
  1000 + id AS customer_sk,
  CAST(id AS INT) AS pg_customer_id,
  CASE
    WHEN id = 1 THEN 'ada@example.com'
    WHEN id = 2 THEN 'grace@example.com'
    WHEN id = 3 THEN 'alan@example.com'
    ELSE concat('user', CAST(id AS STRING), '@example.com')
  END AS email,
  CASE (id % 4)
    WHEN 0 THEN 'IN-WEST'
    WHEN 1 THEN 'IN-NORTH'
    WHEN 2 THEN 'IN-SOUTH'
    ELSE 'IN-EAST'
  END AS region_code
FROM range(1, 2501);

TRUNCATE TABLE main.sportedge.dim_product;
INSERT INTO main.sportedge.dim_product
SELECT
  2000 + id AS product_sk,
  CASE WHEN id <= 250 THEN concat('PUMA-SKU-', lpad(CAST(id AS STRING), 5, '0'))
       ELSE concat('NIKE-SKU-', lpad(CAST(id - 250 AS STRING), 5, '0')) END AS sku,
  CASE WHEN id <= 250 THEN 'PUMA' ELSE 'NIKE' END AS brand_code,
  CASE (id % 3) WHEN 0 THEN 'footwear' WHEN 1 THEN 'apparel' ELSE 'accessories' END AS category,
  CAST(499 + (id * 137) % 4500 AS DECIMAL(12,2)) AS base_price
FROM range(1, 501);

TRUNCATE TABLE main.sportedge.dim_date;
INSERT INTO main.sportedge.dim_date
SELECT
  CAST(date_format(d, 'yyyyMMdd') AS INT) AS date_key,
  year(d) AS year,
  month(d) AS month
FROM (
  SELECT explode(sequence(to_date('2024-01-01'), to_date('2024-12-31'), interval 1 day)) AS d
);

TRUNCATE TABLE main.sportedge.fact_orders;
INSERT INTO main.sportedge.fact_orders
SELECT
  9000 + id AS order_sk,
  concat('ORD-', lpad(CAST(id AS STRING), 8, '0')) AS order_id,
  CAST(1 + ((id * 37) % 2500) AS INT) AS pg_customer_id,
  CASE WHEN id % 2 = 0 THEN 'PUMA' ELSE 'NIKE' END AS brand_code,
  CAST(500 + (id * 211) % 9500 AS DECIMAL(12,2)) AS order_total_inr,
  CASE (id % 5)
    WHEN 0 THEN 'WH-MUM-01'
    WHEN 1 THEN 'WH-DEL-01'
    WHEN 2 THEN 'WH-BLR-01'
    WHEN 3 THEN 'WH-CHN-01'
    ELSE 'WH-KOL-01'
  END AS warehouse_id,
  CASE (id % 6)
    WHEN 0 THEN 'pending'
    WHEN 1 THEN 'confirmed'
    WHEN 2 THEN 'shipped'
    WHEN 3 THEN 'delivered'
    WHEN 4 THEN 'cancelled'
    ELSE 'returned'
  END AS order_status
FROM range(1, 3501);

TRUNCATE TABLE main.sportedge.fact_order_items;
INSERT INTO main.sportedge.fact_order_items
SELECT
  9100 + id AS order_item_sk,
  concat('ORD-', lpad(CAST(1 + ((id * 41) % 3500) AS STRING), 8, '0')) AS order_id,
  CASE WHEN id % 2 = 0
    THEN concat('PUMA-SKU-', lpad(CAST(1 + (id % 250) AS STRING), 5, '0'), '-M')
    ELSE concat('NIKE-SKU-', lpad(CAST(1 + (id % 250) AS STRING), 5, '0'), '-L')
  END AS sku,
  CAST(1 + (id % 4) AS INT) AS quantity,
  CAST(299 + (id * 17) % 4200 AS DECIMAL(12,2)) AS unit_price_inr
FROM range(1, 4501);

TRUNCATE TABLE main.sportedge.fact_shipments;
INSERT INTO main.sportedge.fact_shipments
SELECT
  9200 + id AS shipment_sk,
  concat('ORD-', lpad(CAST(id AS STRING), 8, '0')) AS order_id,
  CASE (id % 5)
    WHEN 0 THEN 'WH-MUM-01'
    WHEN 1 THEN 'WH-DEL-01'
    WHEN 2 THEN 'WH-BLR-01'
    WHEN 3 THEN 'WH-CHN-01'
    ELSE 'WH-KOL-01'
  END AS warehouse_id,
  timestamp('2024-06-01') + (id % 180) * interval 1 day AS shipped_at
FROM range(1, 3501);

TRUNCATE TABLE main.sportedge.fact_returns;
INSERT INTO main.sportedge.fact_returns
SELECT
  9300 + id AS return_sk,
  concat('ORD-', lpad(CAST(id AS STRING), 8, '0')) AS order_id,
  concat('PUMA-SKU-', lpad(CAST(1 + (id % 250) AS STRING), 5, '0'), '-M') AS sku,
  CAST(899 + (id * 13) % 4000 AS DECIMAL(12,2)) AS refund_amount_inr
FROM range(1, 401);

TRUNCATE TABLE main.sportedge.fact_payments;
INSERT INTO main.sportedge.fact_payments
SELECT
  9400 + id AS payment_sk,
  concat('ORD-', lpad(CAST(id AS STRING), 8, '0')) AS order_id,
  CASE WHEN id % 5 = 0 THEN 'cod' ELSE 'upi' END AS method,
  CAST(500 + (id * 137) % 9500 AS DECIMAL(12,2)) AS amount_inr,
  id % 5 = 0 AS is_cod
FROM range(1, 3501);

TRUNCATE TABLE main.sportedge.fact_ad_spend;
INSERT INTO main.sportedge.fact_ad_spend
SELECT
  concat('CMP-', lpad(CAST(1 + (id % 8000) AS STRING), 5, '0')) AS campaign_id,
  20240101 + (id % 365) AS date_key,
  CASE WHEN id % 2 = 0 THEN 'PUMA' ELSE 'NIKE' END AS brand_code,
  CAST(100 + (id * 53) % 50000 AS DECIMAL(12,2)) AS spend_inr,
  CAST(1000 + (id * 97) % 500000 AS BIGINT) AS impressions
FROM range(1, 8001);

TRUNCATE TABLE main.sportedge.fact_wishlist_daily;
INSERT INTO main.sportedge.fact_wishlist_daily
SELECT
  20240101 + (id % 365) AS date_key,
  CASE WHEN id % 2 = 0
    THEN concat('PUMA-SKU-', lpad(CAST(1 + (id % 250) AS STRING), 5, '0'))
    ELSE concat('NIKE-SKU-', lpad(CAST(1 + (id % 250) AS STRING), 5, '0'))
  END AS sku,
  CAST(10 + (id % 200) AS INT) AS wishlist_count,
  CASE WHEN id % 2 = 0 THEN 'PUMA' ELSE 'NIKE' END AS brand_code
FROM range(1, 5001);

TRUNCATE TABLE main.sportedge.fact_fraud;
INSERT INTO main.sportedge.fact_fraud
SELECT
  concat('ORD-', lpad(CAST(1 + (id % 3500) AS STRING), 8, '0')) AS order_id,
  CAST((id % 100) / 100.0 AS DOUBLE) AS fraud_score,
  CASE (id % 3) WHEN 0 THEN 'cod_risk' WHEN 1 THEN 'velocity' ELSE 'address_mismatch' END AS signal_type
FROM range(1, 1501);

TRUNCATE TABLE main.sportedge.fact_inventory_daily;
INSERT INTO main.sportedge.fact_inventory_daily
SELECT
  20240101 + (id % 365) AS date_key,
  CASE (id % 5)
    WHEN 0 THEN 'WH-MUM-01'
    WHEN 1 THEN 'WH-DEL-01'
    WHEN 2 THEN 'WH-BLR-01'
    WHEN 3 THEN 'WH-CHN-01'
    ELSE 'WH-KOL-01'
  END AS warehouse_id,
  CASE WHEN id % 2 = 0
    THEN concat('PUMA-SKU-', lpad(CAST(1 + (id % 250) AS STRING), 5, '0'))
    ELSE concat('NIKE-SKU-', lpad(CAST(1 + (id % 250) AS STRING), 5, '0'))
  END AS sku,
  CAST(5 + (id % 500) AS INT) AS qty_on_hand
FROM range(1, 5001);

TRUNCATE TABLE main.sportedge.fact_cod_reconciliation;
INSERT INTO main.sportedge.fact_cod_reconciliation
SELECT
  concat('ORD-', lpad(CAST(id AS STRING), 8, '0')) AS order_id,
  CAST(500 + (id * 137) % 9500 AS DECIMAL(12,2)) AS expected_inr,
  CAST(500 + (id * 131) % 9500 AS DECIMAL(12,2)) AS collected_inr,
  CAST((id * 131 - id * 137) % 500 AS DECIMAL(12,2)) AS variance_inr
FROM range(1, 701);

TRUNCATE TABLE main.sportedge.fact_vendor_payouts;
INSERT INTO main.sportedge.fact_vendor_payouts VALUES
  ('V-PUMA-01', '2024-06', 250000.00),
  ('V-NIKE-01', '2024-06', 380000.00),
  ('V-PUMA-01', '2024-07', 265000.00),
  ('V-NIKE-01', '2024-07', 395000.00);

TRUNCATE TABLE main.sportedge.bridge_campaign_product;
INSERT INTO main.sportedge.bridge_campaign_product
SELECT
  concat('CMP-', lpad(CAST(1 + (id % 8000) AS STRING), 5, '0')) AS campaign_id,
  CASE WHEN id % 2 = 0
    THEN concat('PUMA-SKU-', lpad(CAST(1 + (id % 250) AS STRING), 5, '0'))
    ELSE concat('NIKE-SKU-', lpad(CAST(1 + (id % 250) AS STRING), 5, '0'))
  END AS sku,
  CASE WHEN id % 2 = 0 THEN 'PUMA' ELSE 'NIKE' END AS brand_code
FROM range(1, 5001);

TRUNCATE TABLE main.sportedge.bridge_order_offer;
INSERT INTO main.sportedge.bridge_order_offer
SELECT
  concat('ORD-', lpad(CAST(1 + (id % 3500) AS STRING), 8, '0')) AS order_id,
  concat('OFFER', CAST((id % 50) + 1 AS STRING)) AS offer_code,
  CAST(50 + (id * 7) % 500 AS DECIMAL(12,2)) AS discount_inr
FROM range(1, 3001);

TRUNCATE TABLE main.sportedge.agg_daily_revenue_by_brand;
INSERT INTO main.sportedge.agg_daily_revenue_by_brand
SELECT
  20240101 + (id % 365) AS date_key,
  CASE WHEN id % 2 = 0 THEN 'PUMA' ELSE 'NIKE' END AS brand_code,
  CAST(100000 + (id * 9973) % 2000000 AS DECIMAL(14,2)) AS revenue_inr,
  CAST(200 + (id % 800) AS INT) AS order_count
FROM range(1, 731);
