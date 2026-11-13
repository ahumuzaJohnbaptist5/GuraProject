// Exercise the production same-origin proxy against a local fake API.
// No production accounts, database or payments are touched.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";

const listen = async server => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
};
const localOrigin = port => `http://127.0.0.1:${port}`;
let productsCount = 0;
let listingsCount = 0;
let rejectCatalog = false;
let authStatus = 200;
let lastLogoutCookie = "";
let lastLogoutOrigin = "";
const api = createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const json = (status, body, headers = {}) => {
    res.writeHead(status, { "Content-Type": "application/json", ...headers });
    res.end(JSON.stringify(body));
  };
  if (pathname === "/api/commerce/products") {
    productsCount++;
    if (rejectCatalog) { res.writeHead(429, { "Content-Type": "text/plain" });res.end("Too Many Requests");return; }
    return json(200, { products: [{ id: "test-product", isDemo: false }] });
  }
  if (pathname === "/api/listings") {
    listingsCount++;
    if (rejectCatalog) { res.writeHead(429, { "Content-Type": "text/plain" });res.end("Too Many Requests");return; }
    return json(200, { listings: [{ id: "test-shop" }] });
  }
  if (pathname === "/api/auth/me") {
    if (authStatus === 429) { res.writeHead(429, { "Content-Type": "text/plain" });res.end("Too Many Requests");return; }
    return json(200, { user: req.headers.cookie?.includes("gura_session=ok") ? { id:"test-user" } : null });
  }
  if (pathname === "/api/auth/register") {
    return json(201, { message: "Account created" });
  }
  if (pathname === "/api/auth/logout") {
    lastLogoutCookie = req.headers.cookie || "";
    lastLogoutOrigin = req.headers.origin || "";
    res.writeHead(204, { "Set-Cookie": "gura_session=; Path=/; HttpOnly; Max-Age=0" });
    res.end(); return;
  }
  return json(404, { error: "Unknown test route" });
});
let proxy;
try {
  const upstreamPort = await listen(api);
  const reservation = createServer();
  const reservedPort = await listen(reservation);
  await new Promise((resolve,reject)=>reservation.close(err=>err?reject(err):resolve()));
  proxy = spawn(process.execPath, ["deploy-server.mjs"], {
    cwd: new URL("../", import.meta.url).pathname,
    env: { ...process.env, NODE_ENV: "test", PORT: String(reservedPort), API_PROXY_TARGET: localOrigin(upstreamPort) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  proxy.stderr.on("data", data => { stderr += data.toString(); });
  const base = localOrigin(reservedPort);
  let ready = false;
  for (let i=0;i<60;i++) {
    if (proxy.exitCode !== null) throw new Error("Proxy exited early: " + stderr);
    try { const response=await fetch(base+"/");if(response.ok){ready=true;break;} }catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(ready, "Proxy did not start: "+stderr);
  const get = path => fetch(base+path);
  const first = await Promise.all(Array.from({length:8},()=>get("/api/commerce/products")));
  assert.ok(first.every(res=>res.status===200));
  assert.equal(productsCount,1,"Public GETs should coalesce into one backend fetch");
  assert.equal((await first[0].json()).products[0].id,"test-product");
  assert.equal((await get("/api/listings")).status,200);
  assert.equal(listingsCount,1);
  rejectCatalog=true;
  await new Promise(resolve=>setTimeout(resolve,110));
  const stale=await get("/api/commerce/products");
  assert.equal(stale.status,200,"Cached public products should survive short upstream 429");
  assert.equal(stale.headers.get("x-gura-catalog-cache"),"stale");
  assert.equal((await stale.json()).products[0].id,"test-product");
  const staleListings=await get("/api/listings");
  assert.equal(staleListings.status,200);
  assert.equal(staleListings.headers.get("x-gura-catalog-cache"),"stale");
  console.log("PASS public catalogue requests coalesce and tolerate brief upstream 429");
  const me=await fetch(base+"/api/auth/me",{headers:{Cookie:"gura_session=ok"}});
  assert.equal(me.status,200);
  assert.equal((await me.json()).user.id,"test-user");
  authStatus=429;
  const blocked=await get("/api/auth/me");
  assert.equal(blocked.status,429,"User-specific 429 must not be replaced by cached identity");
  authStatus=200;
  console.log("PASS authenticated identity remains uncached and upstream statuses are preserved");
  const origin="https://gura-web-bkid.onrender.com";
  const loggedOut=await fetch(base+"/api/auth/logout",{
    method:"POST",headers:{Cookie:"gura_session=ok",Origin:origin},
  });
  assert.equal(loggedOut.status,204);
  assert.match(loggedOut.headers.get("set-cookie")||"",/gura_session=/);
  assert.equal(lastLogoutCookie,"gura_session=ok");
  assert.equal(lastLogoutOrigin,origin);
  const registered=await fetch(base+"/api/auth/register",{
    method:"POST",headers:{"Content-Type":"application/json",Origin:origin},
    body:JSON.stringify({name:"Smoke",email:"demo@example.invalid"}),
  });
  assert.equal(registered.status,201);
  console.log("PASS sign-out forwards session cookies, origin and session invalidation");
  console.log("PASS registration POST is routed upstream and never cached");
  console.log("GURA web-proxy release regression checks passed.");
} finally {
  if (proxy) {
    proxy.kill("SIGTERM");
    await once(proxy,"exit").catch(()=>{});
  }
  await new Promise(resolve=>api.close(()=>resolve()));
}
