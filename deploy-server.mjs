import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "dist");
const port = Number(process.env.PORT || 10000);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

const safePath = (requestPath) => {
  const decoded = decodeURIComponent(requestPath.split("?")[0]);
  const candidate = normalize(join(root, decoded === "/" ? "index.html" : decoded));
  return candidate.startsWith(`${root}${sep}`) || candidate === root ? candidate : null;
};

const serve = async (request, response) => {
  const requested = safePath(request.url || "/");
  const fallback = join(root, "index.html");
  const filePath = requested && await access(requested).then(() => requested).catch(() => null);
  const target = filePath || fallback;
  response.setHeader("Content-Type", contentTypes[extname(target)] || "application/octet-stream");
  response.setHeader("X-Content-Type-Options", "nosniff");
  createReadStream(target).on("error", () => {
    response.writeHead(500);
    response.end("Unable to serve the application.");
  }).pipe(response);
};

// Keep API requests same-origin so browsers send session cookies reliably.
const apiOrigin = new URL(process.env.API_PROXY_TARGET || "https://gura-api-272p.onrender.com");
// Only public, identical-for-everyone catalogue responses may be shared.
// Never cache identity, admin, checkout, payment or other user-specific APIs.
const catalogPaths = new Map([
  ["/api/commerce/products", "products"],
  ["/api/listings", "listings"],
]);
const catalogCache = new Map();
const catalogInflight = new Map();
const FRESH_MS = process.env.NODE_ENV === "test" ? 80 : 20_000;
const STALE_MS = 5 * 60_000;

const sendCatalog = (response, data, cacheState) => {
  response.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Gura-Catalog-Cache": cacheState,
  });
  response.end(data);
};
const publicCatalog = async (path, response) => {
  const existing = catalogCache.get(path);
  if (existing && Date.now() - existing.at < FRESH_MS) {
    sendCatalog(response, existing.body, "fresh");
    return;
  }
  let pending = catalogInflight.get(path);
  if (!pending) {
    pending = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const upstream = await fetch(new URL(path, apiOrigin), {
          headers: { Accept: "application/json" },
          redirect: "manual",
          signal: controller.signal,
        });
        const body = Buffer.from(await upstream.arrayBuffer());
        const contentType = upstream.headers.get("content-type") || "";
        if (upstream.ok && contentType.includes("application/json")) {
          // Cache only a response that matches this public endpoint's schema.
          let parsed;
          try { parsed = JSON.parse(body.toString("utf8")); } catch { parsed = null; }
          if (parsed && Array.isArray(parsed[catalogPaths.get(path)])) {
            catalogCache.set(path, { body, at: Date.now() });
            return { body, cacheState: "refreshed" };
          }
        }
        console.warn("GURA public catalog refresh failed", path, "HTTP", upstream.status);
        return { failureStatus: upstream.status, retryAfter: upstream.headers.get("retry-after") };
      } finally {
        clearTimeout(timeout);
      }
    })().finally(() => catalogInflight.delete(path));
    catalogInflight.set(path, pending);
  }
  try {
    const result = await pending;
    if (result.body) {
      sendCatalog(response, result.body, result.cacheState);
    } else {
      const fallback = catalogCache.get(path);
      if (fallback && Date.now() - fallback.at < STALE_MS) {
        sendCatalog(response, fallback.body, "stale");
      } else {
        const status = result.failureStatus === 429 ? 429 : 503;
        const retryAfter = result.retryAfter ? { "Retry-After": result.retryAfter } : {};
        response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...retryAfter });
        response.end(JSON.stringify({ error: status === 429
          ? "Marketplace is being rate limited. Please retry shortly."
          : "Marketplace data is temporarily unavailable. Please retry." }));
      }
    }
  } catch (error) {
    console.error("GURA public catalog proxy error", path, error);
    const fallback = catalogCache.get(path);
    if (fallback && Date.now() - fallback.at < STALE_MS) {
      sendCatalog(response, fallback.body, "stale");
    } else {
      response.writeHead(503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ error: "Marketplace data is temporarily unavailable. Please retry." }));
    }
  }
};
const proxyApi = async (request, response) => {
  const url = new URL(request.url || "/", "http://localhost");
  if (!url.pathname.startsWith("/api/")) { response.writeHead(404); response.end(); return; }
  if (request.method === "GET" && !url.search && catalogPaths.has(url.pathname)) {
    await publicCatalog(url.pathname, response);
    return;
  }
  const headers = {
    Accept: request.headers.accept || "application/json",
    "Content-Type": request.headers["content-type"] || "application/json",
  };
  if (request.headers.cookie) headers.Cookie = request.headers.cookie;
  if (request.headers.origin) headers.Origin = request.headers.origin;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    let body;
    if (request.method !== "GET" && request.method !== "HEAD") {
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 9 * 1024 * 1024) {
          response.writeHead(413, { "Content-Type": "application/json" });
          response.end(JSON.stringify({error:"Request body too large."}));
          return;
        }
        chunks.push(chunk);
      }
      body = Buffer.concat(chunks);
    }
    const upstream = await fetch(new URL(url.pathname + url.search, apiOrigin), {
      method: request.method, headers, body, redirect: "manual", signal: controller.signal,
    });
    const responseHeaders = { "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff" };
    const contentType = upstream.headers.get("content-type");
    if (contentType) responseHeaders["Content-Type"] = contentType;
    const retryAfter = upstream.headers.get("retry-after");
    if (retryAfter) responseHeaders["Retry-After"] = retryAfter;
    const limitSource = upstream.headers.get("x-gura-rate-limit");
    if (limitSource) responseHeaders["X-Gura-Rate-Limit"] = limitSource;
    if (upstream.status === 429) {
      console.warn("GURA upstream API returned HTTP 429", url.pathname, limitSource || "unidentified upstream limit");
    }
    const cookie = upstream.headers.getSetCookie?.() || [];
    if (cookie.length) responseHeaders["Set-Cookie"] = cookie;
    response.writeHead(upstream.status, responseHeaders);
    if (request.method === "HEAD") { response.end(); return; }
    response.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    console.error("Gura API proxy error", error);
    if (!response.headersSent) response.writeHead(502, { "Content-Type":"application/json", "Cache-Control":"no-store" });
    response.end(JSON.stringify({error:"GURA service is temporarily unreachable. Please retry."}));
  } finally {
    clearTimeout(timeout);
  }
};

createServer((request, response) => {
  if ((request.url || "").startsWith("/api/")) {
    void proxyApi(request, response);
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }
  void serve(request, response);
}).listen(port, "0.0.0.0", () => {
  console.log("Gura web listening on port " + port);
});
