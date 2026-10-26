import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "dist");
const apiOrigin = new URL(process.env.API_URL || "https://gura-api-272p.onrender.com");
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
  let requested;
  try { requested = safePath(request.url || "/"); } catch {
    response.writeHead(400);
    response.end("Invalid request path.");
    return;
  }
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

// Keep authentication cookies first-party; preserve Origin for the API's CSRF check.
const proxyApi = (request, response) => {
  const transport = apiOrigin.protocol === "https:" ? httpsRequest : httpRequest;
  const upstream = transport(new URL(request.url, apiOrigin), {
    method: request.method,
    headers: { ...request.headers, host: apiOrigin.host },
  }, (incoming) => {
    response.writeHead(incoming.statusCode || 502, incoming.headers);
    incoming.pipe(response);
  });
  upstream.setTimeout(120_000, () => upstream.destroy(new Error("API timeout")));
  upstream.on("error", (error) => {
    console.error("API proxy failed:", error.message);
    if (!response.headersSent) {
      response.writeHead(502, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "The API is unavailable. Please try again shortly." }));
    } else response.destroy();
  });
  request.on("aborted", () => upstream.destroy());
  request.pipe(upstream);
};

const server = createServer((request, response) => {
  if (request.url === "/api" || request.url?.startsWith("/api/") || request.url?.startsWith("/api?")) {
    proxyApi(request, response);
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }
  void serve(request, response);
}).listen(port, "0.0.0.0", () => {
  console.log(`Gura web listening on port ${server.address().port}`);
});
