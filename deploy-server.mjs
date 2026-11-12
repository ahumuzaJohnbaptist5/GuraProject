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
const proxyApi = async (request, response) => {
  const url = new URL(request.url || "/", "http://localhost");
  if (!url.pathname.startsWith("/api/")) { response.writeHead(404); response.end(); return; }
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
