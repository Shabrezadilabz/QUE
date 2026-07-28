# Warehouse connectors — honest limits (tech diligence)

## Supported live engines
| Engine | Introspect | Live validate (≤20 rows) | Notes |
|--------|------------|--------------------------|--------|
| PostgreSQL | information_schema + FK | Yes | Primary |
| Databricks | Unity information_schema + FK (best-effort) | Yes (live token) | Schema-scoped; **maxTables default 500** |
| Snowflake | INFORMATION_SCHEMA / fixture | Yes (SQL API) | Auth modes vary; treat live as partner-validated |
| Excel/CSV | Local/upload parse | No | Samples capped ≤5 |
| MongoDB | Sampled docs | No | Schema guess only |

## Do not claim
- “Full Unity Catalog / Snowflake account sync”
- Multi-schema warehouse crawl without `catalog` + `schema` + `maxTables`
- Okta SSO (see `GET /auth/sso` → `loginImplemented: false`)

## Partner gate
Sell warehouse-ready only after **two successful live syncs** on that partner’s account without engineer babysitting.
