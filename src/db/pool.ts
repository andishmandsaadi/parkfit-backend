import { Pool } from "pg";
import dotenv from "dotenv";
dotenv.config({ override: false }); // don't overwrite vars already set by caller

if (!process.env.DATABASE_URL) {
  if (process.env.NODE_ENV === "test") {
    // allow test suite to run without a real DB
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test_parkfit";
  } else {
    throw new Error("DATABASE_URL environment variable is required");
  }
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  console.error("Unexpected DB pool error:", err);
});
