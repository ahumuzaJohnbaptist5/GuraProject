import type { NextFunction, Request, RequestHandler, Response } from "express";
import { createHash } from "node:crypto";
import { config } from "./config.js";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

const clientKey = (request: Request) => request.ip || request.socket.remoteAddress || "unknown";

type RateLimitOptions = { skipReadOnly?: boolean; keyByEmail?: boolean };

export const rateLimit = (windowMs: number, max: number, message: string, options: RateLimitOptions = {}): RequestHandler => {
  return (request, response, next) => {
    // Public catalog and business reads must not be locked out by other
    // visitors sharing the frontend reverse proxy's apparent IP address.
    if (options.skipReadOnly && ["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      next();
      return;
    }
    const now = Date.now();
    const submittedEmail = options.keyByEmail && typeof request.body?.email === "string"
      ? request.body.email.trim().toLowerCase()
      : "";
    // Authentication attempts are counted per account, not per shared
    // Render proxy IP. Unknown/invalid identifiers still fall back to IP.
    // Reverse proxies make many legitimate visitors appear to share one IP.
    // Use a signed-in session as the identity for non-authenticated write limits;
    // only fall back to IP for anonymous traffic. Never store session secrets.
    const session = typeof request.cookies?.gura_session === "string" ? request.cookies.gura_session : "";
    const sessionKey = session ? "session:" + createHash("sha256").update(session).digest("hex") : "";
    const identity = submittedEmail && submittedEmail.length <= 320
      ? "email:" + submittedEmail : sessionKey || "ip:" + clientKey(request);
    const key = `${message}:${identity}`;
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > max) {
      response.setHeader("Retry-After", Math.ceil((bucket.resetAt - now) / 1000));
      response.setHeader("X-Gura-Rate-Limit", options.keyByEmail ? "authentication" : "write");
      response.status(429).json({ error: message });
      return;
    }
    next();
  };
};

const cleanupBuckets = () => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
};

setInterval(cleanupBuckets, 60_000).unref();

export const securityHeaders = (_request: Request, response: Response, next: NextFunction) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("Cache-Control", "no-store");
  if (config.production) response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
};

export const sameOrigin = (request: Request, response: Response, next: NextFunction) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
    next();
    return;
  }
  const origin = request.get("origin");
  if (origin && origin !== config.webOrigin) {
    response.status(403).json({ error: "Cross-origin request rejected." });
    return;
  }
  next();
};
