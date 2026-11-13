# GURA on one Render Free Web service

This is an **opt-in deployment**, not an automatic production switch. It avoids the public Render-to-Render API request hop, which previously returned HTTP 429 for both marketplace reads and authentication writes.

## Architecture

**Before:** Browser → `gura-web` (public) → `gura-api` (public) → PostgreSQL

**After:** Browser → `gura-web` (React static files and in-process Express API) → PostgreSQL

The public GURA address remains `https://gura-web-bkid.onrender.com`. Existing cookies remain same-origin. No paid Render instance or second hostname is required. The separate `gura-api` service can be retained during migration/rollback. The free instance is still subject to sleep, cold starts and inbound request limits; this change removes a specific *extra* public hop, not every possible 429.

## What the code does

- `npm run build` at the repository root also installs and compiles the Express backend into `server/dist`.
- `deploy-server.mjs` normally behaves exactly as before, forwarding API requests to the public API URL.
- When `GURA_EMBEDDED_API=1`, it imports the **existing Express application** and routes all `/api/` and `/health` HTTP requests to it in-process. It never calls `API_PROXY_TARGET` for those requests.
- Runtime checks require `DATABASE_URL`, `WEB_ORIGIN` and a 32+-character `AUDIT_SIGNING_KEY`; invalid configuration refuses startup rather than silently weakening audit guarantees.

## Activation (after CI is green and PR is merged)

In Render, open **gura-web → Environment** and **copy values securely from the existing gura-api service**. Never paste credentials in a chat, repository, or screenshot.

Required environment variables on **gura-web**:

| Key | Value |
| --- | --- |
| `DATABASE_URL` | The **same existing** PostgreSQL connection string used by `gura-api` |
| `WEB_ORIGIN` | `https://gura-web-bkid.onrender.com` |
| `AUDIT_SIGNING_KEY` | The **exact existing** backend audit signing key (do not rotate during this change) |
| `GURA_EMBEDDED_API` | `1` |
| `NODE_ENV` | `production` |
| `SESSION_DAYS` | `7` |
| `HIGH_VALUE_ORDER_UGX` | `1000000` |
| `GURA_ADMIN_EMAIL`, `GURA_ADMIN_PASSWORD` | Copy if administrator provisioning is in use; do not invent/reset credentials |

For optional features, keep parity with the backend environment: `RESEND_API_KEY`, `RESEND_FROM`, SMTP settings, and `PESAPAL_ENV`, `PESAPAL_CONSUMER_KEY`, `PESAPAL_CONSUMER_SECRET`, `PESAPAL_IPN_ID`. **Pesapal must remain `sandbox`** until payment issues are resolved. The old public `gura-api` should remain deployed for rollback while evaluating.

Set all required variables **before** enabling `GURA_EMBEDDED_API`. Saving changes triggers a redeploy; verify the latest commit has the combined build. Verify the service logs say `Gura single-service API enabled`.

## Live release tests

1. `https://gura-web-bkid.onrender.com/health` returns `{"ok":true,"service":"gura-api"}`.
2. `/api/commerce/products` and `/api/listings` return HTTP 200 JSON, with real product/business entries (when present).
3. Register a fresh test **customer** through the browser, log in, load `/api/auth/me`, log out, and check signed-out state.
4. Register and sign in a **shop** or **technician**, create a business, upload a non-demo product with stock, and confirm it appears in the catalogue.
5. Add a stocked product to cart; verify count, quantity updates, removal and persistence on desktop and phone.
6. Verify no new unexpected 429 or 500s appear in **gura-web → Logs**, including registration/sign-out.
7. Confirm an administrator can access moderated listings and validate audit ledger integrity.

**Do not perform real payment attempts.** Pesapal sandbox is a separate release gate.

## Rollback

If the new web service fails to boot or tests fail: in **gura-web → Environment**, set `GURA_EMBEDDED_API` to `0` (or remove it), redeploy, and verify the previous public-backend proxy path works. Do not delete the old `gura-api` service until the integrated deployment is accepted.

Do not mark GURA stable until real desktop/mobile browser journeys and Render logs meet the go/no-go criteria in `RELEASE_READINESS.md`.
