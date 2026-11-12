# GURA centralized audit ledger

The backend writes important business actions to PostgreSQL table `secure_audit_ledger`, independently of the legacy UI-driven `audit_events` activity feed.

## Deployment prerequisites

1. Run the existing `npm run db:migrate` in `server/` before deploying the new backend (the Render Blueprint already runs migrations).
2. In the **gura-api** Render service environment, set `AUDIT_SIGNING_KEY` to a **cryptographically random secret of at least 32 bytes** (for example `openssl rand -hex 32`). Do not put it in Git, screenshots, logs, or the frontend. Keep a secure backup of the key. Changing it without a key-rotation procedure invalidates verification of existing signatures.
3. `HIGH_VALUE_ORDER_UGX` defaults to **1000000**. Set a positive whole-number threshold if needed.
4. Deploy the backend and verify `GET /api/admin/audit/integrity` using an authenticated administrator session. A 409 response indicates a failed integrity check.

High-value orders and payment transitions **fail closed** if the signing key is missing or too short. Configure the key **before** accepting live high-value orders. Lower-value entries may be hash-chained but unsigned if no key is configured; set the key in every environment for stronger tamper evidence.

## How it works

- The server records events directly, never trusting browser-supplied actor IDs.
- Audit entries are serialized with a PostgreSQL transaction advisory lock. Each new entry contains the SHA-256 hash of the previous entry, and an SHA-256 content hash of normalized event data.
- When a signing key is available, each entry receives an HMAC-SHA-256 proof; for high-value transactions a valid signing configuration is mandatory.
- Critical updates (user administration, business moderation, product changes, orders, payments, service requests, etc.) append their evidence within the **same database transaction** as the actual change. If audit writing fails, the change is rolled back.
- The schema rejects UPDATE, DELETE and TRUNCATE operations on the ledger through a trigger. Only the backend should have write privileges; production administrators should use separate read-only accounts to inspect evidence.
- The order-creation event stores a hash of product IDs, quantities and prices, not phone numbers, passwords or payment secrets.

## Endpoints

- `GET /api/admin/audit/ledger` — last 200 ledger events, administrator only.
- `GET /api/admin/audit/integrity` — verifies the chain and available HMAC signatures from the beginning, administrator only. Returns `valid`, `checked`, and either the head hash or the broken event.
- `GET /api/commerce/orders/:id/audit-receipt` — authenticated order owner only. Returns the order's evidence hashes, event signatures, timestamps and non-sensitive details.

The **legacy audit feed** (`/api/admin/audit`) remains for compatibility. It is **not** the cryptographically protected source of truth.

## Operational checks

- Register an account, create a business, approve it as an administrator, publish an inventory item, create an order, and verify events appear in the ledger.
- Change user verification and listing moderation; confirm an event is written after each update.
- Change a product's price or stock and review the corresponding `product.updated` event.
- Place a small test order; confirm an `order.created` entry. An order above the threshold should be rejected **before writing** if the key is absent, and signed when the key is present.
- Use a sandbox payment transaction to test `payment.initiated` and `payment.sandbox_confirmed`. Never interpret sandbox-paid as live payment.
- Check the chain with the integrity endpoint. In a **disposable test database only**, deliberately alter a row by temporarily disabling the trigger and confirm verification fails.

## Trust boundary / limitations

A hash chain and HMAC detect modification of retained records by a database-only attacker without the server's signing key. They do **not** make the database literally immutable. A compromised server/signing key or privileged administrator could potentially rewrite evidence. Stronger assurance requires periodic **off-database anchors** (for example, signed head hashes in immutable object storage), independent clock validation, backups, key rotation procedures, and monitoring.

HMAC evidence is **server-attested**, not a customer-held digital signature. It does **not** independently prove that a specific human authorized the action. Customer-level non-repudiation would require customer-controlled signing credentials or another reliable authorization ceremony. Do not treat this design as a substitute for legal advice or externally certified signatures.
