import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";

const schemaPath = fileURLToPath(new URL("../schema.sql", import.meta.url));
const schema = await readFile(schemaPath, "utf8");
await pool.query(schema);
await pool.end();
console.log("Gura database schema is up to date.");
