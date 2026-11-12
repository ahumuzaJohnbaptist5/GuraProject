import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "./db.js";

// The signing key must be supplied through the server environment, never stored
// in the database or returned to clients. Keep previous keys for verification
// when implementing key rotation.
const signingKey = process.env.AUDIT_SIGNING_KEY || "";
export const highValueThreshold = Number(process.env.HIGH_VALUE_ORDER_UGX || "1000000");
if (!Number.isSafeInteger(highValueThreshold) || highValueThreshold <= 0) throw new Error("Invalid HIGH_VALUE_ORDER_UGX");

type AuditInput = {
  actorId?: string | null;
  action: string;
  subjectType: string;
  subjectId: string;
  detail?: Record<string, string | number | boolean | null>;
  highValue?: boolean;
};
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const signature = (hash: string) => signingKey ? createHmac("sha256", signingKey).update(hash).digest("hex") : null;
const genesis = "0".repeat(64);

export async function appendAudit(client: PoolClient, input: AuditInput) {
  if (input.highValue && signingKey.length < 32) throw new Error("AUDIT_SIGNING_KEY (32+ characters) is required for high-value orders.");
  // Serialize appenders, including across application instances, in the same
  // transaction as the business mutation. A rollback cannot leave an orphaned entry.
  await client.query("SELECT pg_advisory_xact_lock(6702291101)");
  const previous = await client.query<{entry_hash:string}>("SELECT entry_hash FROM secure_audit_ledger ORDER BY id DESC LIMIT 1");
  const prevHash = previous.rows[0]?.entry_hash || genesis;
  const createdAt = new Date().toISOString();
  const body = JSON.stringify({
    previous: prevHash, at: createdAt, actor: input.actorId || null,
    action: input.action, subjectType: input.subjectType,
    subjectId: input.subjectId, detail: input.detail || {},
  });
  const entryHash = digest(body);
  const proof = signature(entryHash);
  const inserted = await client.query<{id:string; entry_hash:string}>(
    `INSERT INTO secure_audit_ledger(actor_id,action,subject_type,subject_id,details,occurred_at,
       previous_hash,entry_hash,signature,high_value)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10) RETURNING id::text,entry_hash`,
    [input.actorId || null,input.action,input.subjectType,input.subjectId,
      JSON.stringify(input.detail || {}),createdAt,prevHash,entryHash,proof,!!input.highValue],
  );
  return { id: inserted.rows[0].id, hash: inserted.rows[0].entry_hash, signed: !!proof };
}

export async function withAuditTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { await client.query("BEGIN"); const result = await work(client); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function verifyLedger() {
  const records = await pool.query<{
    id:string; actor_id:string|null; action:string; subject_type:string;subject_id:string;
    details:Record<string,string|number|boolean|null>; occurred_at:Date;
    previous_hash:string; entry_hash:string; signature:string|null; high_value:boolean;
  }>("SELECT id::text,actor_id::text,action,subject_type,subject_id,details,occurred_at,previous_hash,entry_hash,signature,high_value FROM secure_audit_ledger ORDER BY id");
  let previous = genesis;
  for (const row of records.rows) {
    const body = JSON.stringify({previous:row.previous_hash,at:new Date(row.occurred_at).toISOString(),
      actor:row.actor_id,action:row.action,subjectType:row.subject_type,
      subjectId:row.subject_id,detail:row.details});
    const hash = digest(body);
    if (row.previous_hash !== previous || row.entry_hash !== hash)
      return { valid:false, checked:records.rowCount, brokenAt:row.id, reason:"Hash-chain mismatch" };
    if (row.signature && signingKey) {
      const expected = signature(row.entry_hash)!;
      if (!/^[a-f0-9]{64}$/.test(row.signature) ||
          !timingSafeEqual(Buffer.from(expected,"hex"), Buffer.from(row.signature,"hex")))
        return {valid:false,checked:records.rowCount,brokenAt:row.id,reason:"Invalid HMAC"};
    } else if (row.high_value && (!row.signature || !signingKey)) {
      return {valid:false,checked:records.rowCount,brokenAt:row.id,reason:"High-value proof unavailable"};
    }
    previous = row.entry_hash;
  }
  return { valid:true, checked:records.rowCount, head:previous };
}
