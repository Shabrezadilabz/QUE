-- =============================================================================
-- SportEdge — Databricks LIVE (Unity Catalog)
-- Run in Databricks SQL Editor OR: npm run bootstrap:sportedge-dbx
-- Default: catalog `main`, schema `sportedge` (change if your workspace differs)
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS main.sportedge;

-- Dimensions (small)
CREATE TABLE IF NOT EXISTS main.sportedge.dim_brand (
  brand_id INT,
  brand_code STRING,
  name STRING
) USING DELTA;

CREATE TABLE IF NOT EXISTS main.sportedge.dim_warehouse (
  warehouse_id STRING,
  city STRING,
  region_code STRING
) USING DELTA;

CREATE TABLE IF NOT EXISTS main.sportedge.dim_vendor (
  vendor_id STRING,
  brand_code STRING,
  vendor_name STRING
) USING DELTA;

CREATE TABLE IF NOT EXISTS main.sportedge.dim_customer (
  customer_sk BIGINT,
  pg_customer_id INT,
  email STRING,
  region_code STRING
) USING DELTA;

CREATE TABLE IF NOT EXISTS main.sportedge.dim_product (
  product_sk BIGINT,
  sku STRING,
  brand_code STRING,
  category STRING,
  base_price DECIMAL(12,2)
) USING DELTA;

CREATE TABLE IF NOT EXISTS main.sportedge.dim_date (
  date_key INT,
  year INT,
  month INT
) USING DELTA;

-- Facts
CREATE TABLE IF NOT EXISTS main.sportedge.fact_orders (
  order_sk BIGINT,
  order_id STRING,
  pg_customer_id INT,
  brand_code STRING,
  order_total_inr DECIMAL(12,2),
  warehouse_id STRING,
  order_status STRING
) USING DELTA;

CREATE TABLE IF NOT EXISTS main.sportedge.fact_order_items (
  order_item_sk BIGINT,
  order_id STRING,
  sku STRING,
  quantity INT,
  unit_price_inr DECIMAL(12,2)
) USING DELTA;

CREATE TABLE IF NOT EXISTS main.sportedge.fact_shipments (
  shipment_sk BIGINT,
  order_id STRING,
  warehouse_id STRING,
  shipped_at TIMESTAMP
) USING DELTA;

CREATE TABLE IF NOT EXISTS main.sportedge.fact_returns (
  return_sk BIGINT,
  order_id STRING,
  sku STRING,
  refund_amount_inr DECIMAL(12,2)
) USING DELTA;

CREATE TABLE IF NOT EXISTS main.sportedge.fact_payments (
  payment_sk BIGINT,
  order_id STRING,
  method STRING,
  amount_inr DECIMAL(12,2),
  is_cod BOOLEAN
) USING DELTA;

CREATE TABLE IF NOT EXISTS main.sportedge.fact_ad_spend (
  campaign_id STRING,
  date_key INT,
  brand_code STRING,
  spend_inr DECIMAL(12,2),
  impressions BIGINT
) USING DELTA;

CREATE TABLE IF NOT EXISTS main.sportedge.fact_wishlist_daily (
  date_key INT,
  sku STRING,
  wishlist_count INT,
  brand_code STRING
) USING DELTA;

CREATE TABLE IF NOT EXISTS main.sportedge.fact_fraud (
  order_id STRING,
  fraud_score DOUBLE,
  signal_type STRING
) USING DELTA;

CREATE TABLE IF NOT EXISTS main.sportedge.fact_inventory_daily (
  date_key INT,
  warehouse_id STRING,
  sku STRING,
  qty_on_hand INT
) USING DELTA;

CREATE TABLE IF NOT EXISTS main.sportedge.fact_cod_reconciliation (
  order_id STRING,
  expected_inr DECIMAL(12,2),
  collected_inr DECIMAL(12,2),
  variance_inr DECIMAL(12,2)
) USING DELTA;

CREATE TABLE IF NOT EXISTS main.sportedge.fact_vendor_payouts (
  vendor_id STRING,
  period_month STRING,
  payout_inr DECIMAL(14,2)
) USING DELTA;

CREATE TABLE IF NOT EXISTS main.sportedge.bridge_campaign_product (
  campaign_id STRING,
  sku STRING,
  brand_code STRING
) USING DELTA;

CREATE TABLE IF NOT EXISTS main.sportedge.bridge_order_offer (
  order_id STRING,
  offer_code STRING,
  discount_inr DECIMAL(12,2)
) USING DELTA;

CREATE TABLE IF NOT EXISTS main.sportedge.agg_daily_revenue_by_brand (
  date_key INT,
  brand_code STRING,
  revenue_inr DECIMAL(14,2),
  order_count INT
) USING DELTA;
