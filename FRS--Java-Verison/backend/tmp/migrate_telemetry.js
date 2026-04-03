import { pool } from '../src/db/pool.js';

async function migrate() {
  console.log("Migrating Telemetry Database...");
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS frs_telemetry_history (
        pk_history_id SERIAL PRIMARY KEY,
        fk_nug_id UUID NOT NULL REFERENCES frs_nug_box(pk_nug_id) ON DELETE CASCADE,
        timestamp TIMESTAMPTZ DEFAULT NOW(),
        cpu NUMERIC(5,2),
        gpu NUMERIC(5,2),
        ram NUMERIC(5,2)
      );
      CREATE INDEX IF NOT EXISTS idx_telemetry_nug_time ON frs_telemetry_history(fk_nug_id, timestamp DESC);
    `);
    console.log("Migration Successful: frs_telemetry_history created.");
  } catch (e) {
    console.error("Migration Failed:", e);
  } finally {
    await pool.end();
  }
}

migrate();
