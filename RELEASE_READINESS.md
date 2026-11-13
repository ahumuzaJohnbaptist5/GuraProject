# GURA stable-release gate

**Release objective:** A presenter can demonstrate the same complete, repeatable core journey without relying on a screenshot, stale browser state, or a simulated payment.

## CI gate (runs on every PR)

The backend workflow starts a disposable PostgreSQL database and exercises the real HTTP routes via `server/scripts/release-smoke.mjs`:

- `/health`, public products and listings return 200 with correct JSON shapes
- unauthenticated `/api/auth/me` returns `user: null`
- invalid registration returns 400, valid registration 201, duplicate email 409
- wrong password returns 401, correct password issues an HttpOnly session cookie
- authenticated identity matches the registered account
- customer cannot read administrator audit history (403)
- cross-origin logout is rejected (403)
- same-origin logout succeeds (204) and the old session no longer authenticates

The test deliberately refuses to run against a public hostname, requires `RELEASE_SMOKE_ALLOW_WRITES=1`, and creates a unique test account only in the disposable CI database.

The frontend TypeScript/Vite build runs separately. **Neither build nor these tests prove the Render deployment is healthy**.

## Manual live acceptance (must pass before presentation)

Record date/time, production deployment commit, account role, browser/device and exact outcomes.

| Journey | Pass condition |
| --- | --- |
| Open homepage and shop | Product and business APIs respond 200; no false empty-state/HTTP 429 |
| Register with a new test email | Form returns success and links to sign-in |
| Register with same email | Clear existing-account message; no 500 |
| Login with wrong/right password | Correct rejection then successful session |
| Sign out | Server confirms logout; page changes to signed-out state |
| Re-login after logout | Previously revoked cookie is no longer recognized |
| Business registration | A shop/technician can register and create their one permitted business |
| Product listing | Available, non-demo product appears with correct stock and image |
| Cart | Add to cart updates count, quantity, and subtotal on desktop and mobile |
| Admin | Login and approve a test business; customer cannot access admin endpoints |
| Audit | Admin ledger captures the event; integrity endpoint reports `valid: true` |

Do not claim an acceptance item passed unless you actually executed it on deployed GURA.

## Currently blocked: payments

Pesapal sandbox initiation has returned HTTP 500. Keep `PESAPAL_ENV=sandbox`; don't use real payment data or treat `sandbox_paid` as `paid`. Existing pending orders can be resumed; do not repeatedly create new orders for the same test. Payment initiation and gateway webhook/reconciliation must be independently tested before enabling live payments.

## Persistent HTTP 429 investigation

Browser logs show **plain-text HTTP 429** for multiple GET endpoints; the application rate limiter skips read-only GET requests. This suggests an upstream restriction, but only Render logs/response headers can establish the precise source. Check both `gura-web` and `gura-api` request logs and compare public-backend vs frontend-proxy paths. Do not remove application rate limits to mask an upstream error.

The frontend proxy currently uses `API_PROXY_TARGET` (default: public backend URL). Render can support private service-to-service networking in the same workspace and region, **but free web services cannot receive private-network traffic**. Verify service plans, region, workspace, and the backend's **Connect → Internal** endpoint before considering this change. Never invent internal hostnames.

## Deployment / rollback discipline

1. Review and merge only when both CI workflows pass.
2. Verify Render deployed the intended commit to **both** web and API services.
3. Run the manual live acceptance table from a fresh or private browser and a phone, preferably on different networks.
4. On failed acceptance, stop release promotion, preserve logs (without secrets), and roll back to the last known-good deployment in Render.
5. Keep core authentication/catalog/cart stable before further feature development.

**Release decision: NO-GO** while registration/sign-out, catalogue availability, or cart fails during live acceptance. Payments are explicitly excluded from the core-demo milestone until the separate sandbox gate passes.
