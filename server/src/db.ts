import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;
export const pool = new Pool({ connectionString: config.databaseUrl });

export const query = <T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  values: unknown[] = [],
) => pool.query<T>(text, values);
