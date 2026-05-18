import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import pg from "pg";

const { Client } = pg;

const [, , sqlPathArg] = process.argv;

if (!sqlPathArg) {
  throw new Error("Usage: node tests/db/run-sql.mjs <sql-file>");
}

if (!process.env.SUPABASE_DB_URL) {
  throw new Error("SUPABASE_DB_URL is required to run test DB SQL.");
}

const sqlFilePath = path.resolve(process.cwd(), sqlPathArg);
const sql = await fs.readFile(sqlFilePath, "utf8");

const client = new Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: process.env.SUPABASE_DB_SSL === "disable" ? false : { rejectUnauthorized: false },
});

await client.connect();

try {
  await client.query(sql);
  console.log(`Executed SQL file: ${sqlFilePath}`);
} finally {
  await client.end();
}
