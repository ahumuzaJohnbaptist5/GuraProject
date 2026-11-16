// Shared by the live endpoint and database regression tests.
export const issueRecoveryTokenSql = `
    WITH eligible AS (SELECT id,email FROM users WHERE email=lower($1) AND suspended=FALSE),
    issued AS (
      INSERT INTO gura_password_recovery_tokens_v2(user_id,token_hash,expires_at)
      SELECT id,$2,now()+interval '15 minutes' FROM eligible
      ON CONFLICT(user_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,created_at=now(),expires_at=EXCLUDED.expires_at
      WHERE gura_password_recovery_tokens_v2.created_at < now()-interval '1 minute'
      RETURNING user_id
    )
    SELECT eligible.email FROM eligible JOIN issued ON eligible.id=issued.user_id
  `;
