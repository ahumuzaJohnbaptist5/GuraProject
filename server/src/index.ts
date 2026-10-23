import express, { type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { z } from "zod";
import { config } from "./config.js";
import { createSession, currentUser, destroySession, hashPassword, verifyPassword, type AuthUser } from "./auth.js";
import { query } from "./db.js";

const app = express();
app.use(cors({ origin: config.webOrigin, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

const asyncRoute = (handler: (request: Request, response: Response) => Promise<void>) =>
  (request: Request, response: Response, next: NextFunction) => handler(request, response).catch(next);

const requireUser = async (request: Request, response: Response, next: NextFunction) => {
  try {
    const user = await currentUser(request);
    if (!user) {
      response.status(401).json({ error: "Authentication required." });
      return;
    }
    response.locals.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(128),
  role: z.enum(["customer", "technician", "shop"]).default("customer"),
});

app.get("/health", (_request, response) => response.json({ ok: true, service: "gura-api" }));

app.post("/api/auth/register", asyncRoute(async (request, response) => {
  const input = registerSchema.parse(request.body);
  const passwordHash = await hashPassword(input.password);
  const result = await query<AuthUser>(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, lower($2), $3, $4)
     RETURNING id, name, email, role, location, bio, verified, suspended`,
    [input.name, input.email, passwordHash, input.role],
  );
  const user = result.rows[0];
  await createSession(user.id, response);
  response.status(201).json({ user });
}));

app.post("/api/auth/login", asyncRoute(async (request, response) => {
  const input = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(request.body);
  const result = await query<AuthUser & { password_hash: string }>(
    `SELECT id, name, email, role, location, bio, verified, suspended, password_hash
     FROM users WHERE email = lower($1)`,
    [input.email],
  );
  const user = result.rows[0];
  if (!user || !(await verifyPassword(input.password, user.password_hash))) {
    response.status(401).json({ error: "Email or password is incorrect." });
    return;
  }
  if (user.suspended) {
    response.status(403).json({ error: "This account is suspended." });
    return;
  }
  const { password_hash: _passwordHash, ...safeUser } = user;
  await createSession(user.id, response);
  response.json({ user: safeUser });
}));

app.post("/api/auth/logout", asyncRoute(async (request, response) => {
  await destroySession(request, response);
  response.status(204).end();
}));

app.get("/api/auth/me", asyncRoute(async (request, response) => {
  const user = await currentUser(request);
  response.json({ user });
}));

app.patch("/api/auth/me", requireUser, asyncRoute(async (request, response) => {
  const user = response.locals.user as AuthUser;
  const input = z.object({
    name: z.string().trim().min(2).max(120).optional(),
    location: z.string().trim().max(160).nullable().optional(),
    bio: z.string().trim().max(2000).nullable().optional(),
  }).parse(request.body);
  const result = await query<AuthUser>(
    `UPDATE users SET name = COALESCE($1, name), location = $2, bio = $3
     WHERE id = $4
     RETURNING id, name, email, role, location, bio, verified, suspended`,
    [input.name ?? null, input.location ?? null, input.bio ?? null, user.id],
  );
  response.json({ user: result.rows[0] });
}));

app.get("/api/listings", asyncRoute(async (_request, response) => {
  const result = await query(
    `SELECT id, owner_id AS "ownerId", name, type, location, text, services, verified,
            rating, availability, moderation_status AS "moderationStatus"
     FROM listings WHERE moderation_status = 'approved' ORDER BY rating DESC, created_at DESC`,
  );
  response.json({ listings: result.rows });
}));

app.post("/api/requests", requireUser, asyncRoute(async (request, response) => {
  const user = response.locals.user as AuthUser;
  const input = z.object({
    listingId: z.string().uuid(),
    title: z.string().trim().min(3).max(160),
    details: z.string().trim().min(3).max(4000),
    preferredDate: z.string().date().optional(),
    preferredTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  }).parse(request.body);
  const listing = await query<{ owner_id: string | null }>("SELECT owner_id FROM listings WHERE id = $1 AND moderation_status = 'approved'", [input.listingId]);
  if (!listing.rows[0]) {
    response.status(404).json({ error: "Listing not found." });
    return;
  }
  const result = await query(
    `INSERT INTO service_requests
      (customer_id, provider_id, listing_id, title, details, preferred_date, preferred_time)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, customer_id AS "customerId", provider_id AS "providerId", listing_id AS "listingId",
       title, details, status, preferred_date AS "preferredDate", preferred_time AS "preferredTime",
       confirmed_date AS "confirmedDate", confirmed_time AS "confirmedTime", created_at AS "createdAt"`,
    [user.id, listing.rows[0].owner_id, input.listingId, input.title, input.details, input.preferredDate || null, input.preferredTime || null],
  );
  response.status(201).json({ request: result.rows[0] });
}));

app.get("/api/requests", requireUser, asyncRoute(async (_request, response) => {
  const user = response.locals.user as AuthUser;
  const result = await query(
    `SELECT r.id, r.customer_id AS "customerId", r.provider_id AS "providerId", r.listing_id AS "listingId",
      r.title, r.details, r.status, r.preferred_date AS "preferredDate", r.preferred_time AS "preferredTime",
      r.confirmed_date AS "confirmedDate", r.confirmed_time AS "confirmedTime", r.created_at AS "createdAt"
     FROM service_requests r
     WHERE $1 = 'administrator' OR r.customer_id = $2 OR r.provider_id = $2
        OR EXISTS (SELECT 1 FROM listings l WHERE l.id = r.listing_id AND l.owner_id = $2)
     ORDER BY r.created_at DESC`,
    [user.role, user.id],
  );
  response.json({ requests: result.rows });
}));

const requestStatusSchema = z.object({
  status: z.enum(["open", "accepted", "declined", "completed", "cancelled"]),
});

const ownedRequest = async (requestId: string, user: AuthUser) => {
  const result = await query<{ id: string; customer_id: string; provider_id: string | null; owner_id: string | null }>(
    `SELECT r.id, r.customer_id, r.provider_id, l.owner_id
     FROM service_requests r JOIN listings l ON l.id = r.listing_id
     WHERE r.id = $1`,
    [requestId],
  );
  const item = result.rows[0];
  if (!item) return null;
  const allowed = user.role === "administrator" || item.customer_id === user.id || item.provider_id === user.id || item.owner_id === user.id;
  return allowed ? item : null;
};

app.patch("/api/requests/:id/status", requireUser, asyncRoute(async (request, response) => {
  const user = response.locals.user as AuthUser;
  const requestId = String(request.params.id);
  const input = requestStatusSchema.parse(request.body);
  const item = await ownedRequest(requestId, user);
  if (!item) {
    response.status(404).json({ error: "Request not found." });
    return;
  }
  const providerAction = ["accepted", "declined", "completed"].includes(input.status);
  if (providerAction && user.role !== "administrator" && item.provider_id !== user.id && item.owner_id !== user.id) {
    response.status(403).json({ error: "Only the assigned provider can change this request." });
    return;
  }
  if (input.status === "cancelled" && user.role !== "administrator" && item.customer_id !== user.id) {
    response.status(403).json({ error: "Only the customer can cancel this request." });
    return;
  }
  const result = await query(
    `UPDATE service_requests SET status = $1 WHERE id = $2
     RETURNING id, customer_id AS "customerId", provider_id AS "providerId", listing_id AS "listingId",
       title, details, status, preferred_date AS "preferredDate", preferred_time AS "preferredTime",
       confirmed_date AS "confirmedDate", confirmed_time AS "confirmedTime", created_at AS "createdAt"`,
    [input.status, requestId],
  );
  response.json({ request: result.rows[0] });
}));

app.patch("/api/requests/:id/appointment", requireUser, asyncRoute(async (request, response) => {
  const user = response.locals.user as AuthUser;
  const requestId = String(request.params.id);
  const input = z.object({
    confirmedDate: z.string().date(),
    confirmedTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  }).parse(request.body);
  const item = await ownedRequest(requestId, user);
  if (!item) {
    response.status(404).json({ error: "Request not found." });
    return;
  }
  if (user.role !== "administrator" && item.provider_id !== user.id && item.owner_id !== user.id) {
    response.status(403).json({ error: "Only the assigned provider can confirm an appointment." });
    return;
  }
  const result = await query(
    `UPDATE service_requests SET confirmed_date = $1, confirmed_time = $2 WHERE id = $3
     RETURNING id, customer_id AS "customerId", provider_id AS "providerId", listing_id AS "listingId",
       title, details, status, preferred_date AS "preferredDate", preferred_time AS "preferredTime",
       confirmed_date AS "confirmedDate", confirmed_time AS "confirmedTime", created_at AS "createdAt"`,
    [input.confirmedDate, input.confirmedTime || null, requestId],
  );
  response.json({ request: result.rows[0] });
}));

const requestAccess = async (requestId: string, user: AuthUser) => {
  const item = await ownedRequest(requestId, user);
  return item;
};

app.get("/api/requests/:id/messages", requireUser, asyncRoute(async (request, response) => {
  const user = response.locals.user as AuthUser;
  if (!(await requestAccess(String(request.params.id), user))) {
    response.status(404).json({ error: "Request not found." });
    return;
  }
  const result = await query(
    `SELECT id, request_id AS "requestId", sender_id AS "senderId", body, created_at AS "createdAt"
     FROM messages WHERE request_id = $1 ORDER BY created_at ASC`,
    [String(request.params.id)],
  );
  response.json({ messages: result.rows });
}));

app.post("/api/requests/:id/messages", requireUser, asyncRoute(async (request, response) => {
  const user = response.locals.user as AuthUser;
  const requestId = String(request.params.id);
  if (!(await requestAccess(requestId, user))) {
    response.status(404).json({ error: "Request not found." });
    return;
  }
  const input = z.object({ body: z.string().trim().min(1).max(4000) }).parse(request.body);
  const result = await query(
    `INSERT INTO messages (request_id, sender_id, body) VALUES ($1, $2, $3)
     RETURNING id, request_id AS "requestId", sender_id AS "senderId", body, created_at AS "createdAt"`,
    [requestId, user.id, input.body],
  );
  response.status(201).json({ message: result.rows[0] });
}));

app.get("/api/listings/:id/reviews", asyncRoute(async (request, response) => {
  const result = await query(
    `SELECT id, listing_id AS "listingId", request_id AS "requestId", author_id AS "authorId",
      rating, body, created_at AS "createdAt"
     FROM reviews WHERE listing_id = $1 ORDER BY created_at DESC`,
    [String(request.params.id)],
  );
  response.json({ reviews: result.rows });
}));

app.post("/api/listings/:id/reviews", requireUser, asyncRoute(async (request, response) => {
  const user = response.locals.user as AuthUser;
  const input = z.object({
    requestId: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
    body: z.string().trim().min(1).max(2000),
  }).parse(request.body);
  const eligible = await query(
    `SELECT r.id FROM service_requests r
     WHERE r.id = $1 AND r.listing_id = $2 AND r.customer_id = $3 AND r.status = 'completed'`,
    [input.requestId, String(request.params.id), user.id],
  );
  if (!eligible.rows[0]) {
    response.status(403).json({ error: "Only customers can review their completed request." });
    return;
  }
  try {
    const result = await query(
      `INSERT INTO reviews (listing_id, request_id, author_id, rating, body)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, listing_id AS "listingId", request_id AS "requestId", author_id AS "authorId",
         rating, body, created_at AS "createdAt"`,
      [String(request.params.id), input.requestId, user.id, input.rating, input.body],
    );
    response.status(201).json({ review: result.rows[0] });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      response.status(409).json({ error: "This request already has a review." });
      return;
    }
    throw error;
  }
}));

app.get("/api/favorites", requireUser, asyncRoute(async (_request, response) => {
  const user = response.locals.user as AuthUser;
  const result = await query<{ listing_id: string }>("SELECT listing_id FROM favorites WHERE user_id = $1 ORDER BY created_at DESC", [user.id]);
  response.json({ listingIds: result.rows.map((item) => item.listing_id) });
}));

app.put("/api/favorites/:listingId", requireUser, asyncRoute(async (request, response) => {
  const user = response.locals.user as AuthUser;
  const listingId = String(request.params.listingId);
  const listing = await query("SELECT id FROM listings WHERE id = $1", [listingId]);
  if (!listing.rows[0]) {
    response.status(404).json({ error: "Listing not found." });
    return;
  }
  const existing = await query("SELECT 1 FROM favorites WHERE user_id = $1 AND listing_id = $2", [user.id, listingId]);
  if (existing.rows[0]) {
    await query("DELETE FROM favorites WHERE user_id = $1 AND listing_id = $2", [user.id, listingId]);
  } else {
    await query("INSERT INTO favorites (user_id, listing_id) VALUES ($1, $2)", [user.id, listingId]);
  }
  const result = await query<{ listing_id: string }>("SELECT listing_id FROM favorites WHERE user_id = $1 ORDER BY created_at DESC", [user.id]);
  response.json({ listingIds: result.rows.map((item) => item.listing_id) });
}));

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) {
    response.status(400).json({ error: "Validation failed.", issues: error.issues });
    return;
  }
  console.error(error);
  response.status(500).json({ error: "Internal server error." });
});

app.listen(config.port, () => console.log(`Gura API listening on http://127.0.0.1:${config.port}`));
