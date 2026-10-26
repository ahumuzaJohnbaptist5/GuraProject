import type { NextFunction, Request, RequestHandler, Response } from "express";
import { config } from "./config.js";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

const clientKey = (request: Request) => request.ip || request.socket.remoteAddress || "unknown";

export const rateLimit = (windowMs: number, max: number, message: string): RequestHandler => {
  return (request, response, next) => {
    const now = Date.now();
    const key = `${message}:${clientKey(request)}`;
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > max) {
      response.setHeader("Retry-After", Math.ceil((bucket.resetAt - now) / 1000));
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
  if (origin && !config.webOrigins.includes(origin)) {
    response.status(403).json({ error: "Cross-origin request rejected." });
    return;
  }
  next();
};
