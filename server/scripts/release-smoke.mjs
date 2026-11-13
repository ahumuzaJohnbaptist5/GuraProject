// LOCAL/CI ONLY: creates a fresh test account. Never run against production.
// Usage: RELEASE_SMOKE_ALLOW_WRITES=1 node scripts/release-smoke.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const base = new URL(process.env.RELEASE_SMOKE_BASE_URL || "http://127.0.0.1:8787");
if (process.env.RELEASE_SMOKE_ALLOW_WRITES !== "1" ||
    !["127.0.0.1", "localhost", "::1"].includes(base.hostname)) {
  throw new Error("Release smoke writes are restricted to localhost and require RELEASE_SMOKE_ALLOW_WRITES=1.");
}
const origin = process.env.WEB_ORIGIN || "http://127.0.0.1:5173";
const email = `release-test-${randomUUID()}@example.invalid`;
const password = `GuraSmoke-${randomUUID()}!`;
let cookie = "";

async function call(path, { method = "GET", json, withCookie = false, requestOrigin = origin } = {}) {
  const response = await fetch(new URL(path, base), {
    method,
    headers: {
      Accept: "application/json",
      ...(json === undefined ? {} : { "Content-Type": "application/json" }),
      ...(method === "GET" ? {} : { Origin: requestOrigin }),
      ...(withCookie ? { Cookie: cookie } : {}),
    },
    ...(json === undefined ? {} : { body: JSON.stringify(json) }),
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); }
    catch { throw new Error(`${method} ${path} returned non-JSON response: HTTP ${response.status}`); }
  }
  return { status: response.status, body, headers: response.headers };
}

const check = async (label, run) => {
  try { await run(); console.log(`PASS ${label}`); }
  catch (error) { console.error(`FAIL ${label}`); throw error; }
};

await check("Backend health", async () => {
  const r = await call("/health");
  assert.equal(r.status, 200);
  assert.equal(r.body?.ok, true);
});
await check("Anonymous identity is null", async () => {
  const r = await call("/api/auth/me");
  assert.equal(r.status, 200);
  assert.equal(r.body?.user, null);
});
await check("Public products and listings return arrays", async () => {
  for (const path of ["/api/commerce/products", "/api/listings"]) {
    const r = await call(path);
    assert.equal(r.status, 200, path);
    const items = path.endsWith("products") ? r.body?.products : r.body?.listings;
    assert.ok(Array.isArray(items), path);
    if (path.endsWith("products")) assert.equal(items.some(p => p.isDemo), false);
  }
});
await check("Registration validation rejects invalid details", async () => {
  const r = await call("/api/auth/register", {
    method: "POST", json: { name: "A", email: "invalid", password: "short", confirmPassword: "different", role: "customer" },
  });
  assert.equal(r.status, 400);
});
await check("Registration creates a customer account", async () => {
  const r = await call("/api/auth/register", {
    method: "POST",
    json: { name: "Release Smoke Customer", email, password, confirmPassword: password, role: "customer" },
  });
  assert.equal(r.status, 201);
});
await check("Duplicate registration is a clear conflict, not HTTP 500", async () => {
  const r = await call("/api/auth/register", {
    method: "POST",
    json: { name: "Release Smoke Customer", email, password, confirmPassword: password, role: "customer" },
  });
  assert.equal(r.status, 409);
});
await check("Invalid login is rejected", async () => {
  const r = await call("/api/auth/login", { method: "POST", json: { email, password: "IncorrectPass123" } });
  assert.equal(r.status, 401);
});
await check("Valid login issues a protected session", async () => {
  const r = await call("/api/auth/login", { method: "POST", json: { email, password } });
  assert.equal(r.status, 200);
  assert.equal(r.body?.user?.role, "customer");
  const setCookie = r.headers.get("set-cookie") || "";
  assert.match(setCookie, /gura_session=/);
  assert.match(setCookie, /httponly/i);
  cookie = setCookie.split(";")[0];
});
await check("Session identifies the correct account", async () => {
  const r = await call("/api/auth/me", { withCookie: true });
  assert.equal(r.status, 200);
  assert.equal(r.body?.user?.email, email);
});
await check("Customer cannot access administrator audit history", async () => {
  const r = await call("/api/admin/audit/ledger", { withCookie: true });
  assert.equal(r.status, 403);
});
await check("Cross-origin write is rejected", async () => {
  const r = await call("/api/auth/logout", {
    method: "POST", withCookie: true, requestOrigin: "https://untrusted.example.invalid",
  });
  assert.equal(r.status, 403);
});
await check("Logout revokes session in the database", async () => {
  const r = await call("/api/auth/logout", { method: "POST", withCookie: true });
  assert.equal(r.status, 204);
  const me = await call("/api/auth/me", { withCookie: true });
  assert.equal(me.status, 200);
  assert.equal(me.body?.user, null);
});
console.log("GURA core release smoke checks passed.");
