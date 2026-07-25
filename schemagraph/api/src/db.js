import pg from 'pg'

const connectionString =
  process.env.DATABASE_URL ??
  'postgresql://stitch:stitch@localhost:5432/stitch'

export const pool = new pg.Pool({ connectionString })

export async function query(text, params) {
  return pool.query(text, params)
}
