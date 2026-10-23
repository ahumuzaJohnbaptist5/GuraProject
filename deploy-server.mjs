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

createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }
  void serve(request, response);
}).listen(port, "0.0.0.0", () => {
  console.log(`Gura web listening on port ${port}`);
});
