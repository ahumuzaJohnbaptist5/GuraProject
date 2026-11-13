import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

// This starts a fake local upstream and the real frontend proxy. No production
// credentials, accounts, database writes or public network calls are involved.
const upstreamHits = { products: 0, listings: 0, logout: 0 };
let productsRateLimited = false;
const upstream = createServer(async (req, res) => {
  if (req.url === "/api/commerce/products") {
    upstreamHits.products++;
    await delay(60);
    if (productsRateLimited) {
      res.writeHead(429, { "Content-Type": "text/plain", "Retry-After": "30" });
      res.end("Too Many Requests");
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ products: [{ id: "test-product", name: "Test part", availableUnits: 2 }] }));
    return;
  }
  if (req.url === "/api/listings") {
    upstreamHits.listings++;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ listings: [{ id: "test-shop", name: "Test shop" }] }));
    return;
  }
  if (req.url === "/api/auth/logout" && req.method === "POST") {
    upstreamHits.logout++;
    res.writeHead(204);res.end();return;
  }
  res.writeHead(404);res.end();
});
upstream.listen(0, "127.0.0.1");
await once(upstream, "listening");

const reservePort = async () => {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
};
const port = await reservePort();
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["deploy-server.mjs"], {
  env: {
    ...process.env,
    NODE_ENV: "test",
    PORT: String(port),
    API_PROXY_TARGET: `http://127.0.0.1:${upstream.address().port}`,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let childOutput = "";
child.stderr.on("data", chunk => { childOutput += chunk.toString(); });
child.stdout.on("data", chunk => { childOutput += chunk.toString(); });

try {
  let ready = false;
  for (let i=0; i<40; i++) {
    if (child.exitCode !== null) throw Error("Proxy exited unexpectedly: " + childOutput);
    try {
      const r = await fetch(origin+"/api/listings", { signal: AbortSignal.timeout(1000) });
      if (r.status === 200) { ready=true; break; }
    } catch {}
    await delay(100);
  }
  assert.ok(ready, "Proxy failed to start: " + childOutput);
  // Distinct public product clients should trigger exactly one backend GET.
  const batch = await Promise.all(Array.from({length: 12}, () =>
    fetch(origin+"/api/commerce/products").then(async r=>({status:r.status,data:await r.json()}))
  ));
  assert.ok(batch.every(x=>x.status===200 && x.data.products.length===1));
  assert.equal(upstreamHits.products, 1, "concurrent catalog requests must share one backend fetch");

  const again = await fetch(origin+"/api/commerce/products");
  assert.equal(again.headers.get("x-gura-catalog-cache"), "fresh");
  assert.equal(upstreamHits.products, 1, "fresh catalogue should be served from memory");

  // Neither logout nor other user-specific mutations may be cached.
  for(let i=0;i<2;i++){
    const r=await fetch(origin+"/api/auth/logout",{method:"POST"});
    assert.equal(r.status,204);
  }
  assert.equal(upstreamHits.logout,2,"logout must pass through every time");

  // After expiry, a provider-side 429 should show the last recent,
  // validated public catalogue rather than an empty marketplace.
  await delay(150);
  productsRateLimited = true;
  const fallback = await fetch(origin+"/api/commerce/products");
  assert.equal(fallback.status,200);
  assert.equal(fallback.headers.get("x-gura-catalog-cache"),"stale");
  assert.equal((await fallback.json()).products.length,1);
  assert.equal(upstreamHits.products,2);
  console.log("PASS public catalog concurrent request coalescing");
  console.log("PASS public catalog cache reuse");
  console.log("PASS login/logout API is never cached");
  console.log("PASS stale public catalog fallback on upstream HTTP 429");
} finally {
  child.kill();
  await new Promise(resolve => upstream.close(resolve));
}
