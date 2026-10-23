import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { config } from "./config.js";
import { query } from "./db.js";

export const SESSION_COOKIE = "gura_session";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export const hashPassword = (password: string) => bcrypt.hash(password, 12);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

export const createSession = async (userId: string, response: Response) => {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + config.sessionDays * 24 * 60 * 60 * 1000);
  await query("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)", [userId, hashToken(token), expiresAt]);
  response.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.production,
    expires: expiresAt,
    path: "/",
  });
};

export const destroySession = async (request: Request, response: Response) => {
  const token = request.cookies?.[SESSION_COOKIE];
  if (token) await query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
  response.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax", secure: config.production, path: "/" });
};

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "customer" | "technician" | "shop" | "administrator";
  location: string | null;
  bio: string | null;
  verified: boolean;
  suspended: boolean;
};

export const currentUser = async (request: Request): Promise<AuthUser | null> => {
  const token = request.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  const result = await query<AuthUser>(
    `SELECT u.id, u.name, u.email, u.role, u.location, u.bio, u.verified, u.suspended
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
  const user = result.rows[0] || null;
  return user?.suspended ? null : user;
};
