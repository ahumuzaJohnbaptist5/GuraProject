import { fetchMarketplaceGet } from "./marketplaceFetch";
import type { AuditEvent, Listing, ListingReport, Message, Notification, Review, ServiceRequest, User } from "./types";

const LISTINGS_KEY = "gura-listings";
const REQUESTS_KEY = "gura-requests";
const MESSAGES_KEY = "gura-messages";
const REVIEWS_KEY = "gura-reviews";
const FAVORITES_KEY = "gura-favorites";
const NOTIFICATIONS_KEY = "gura-notifications";
const REPORTS_KEY = "gura-reports";
const AUDIT_KEY = "gura-audit";
const DOMAIN_KEYS = [LISTINGS_KEY, REQUESTS_KEY, MESSAGES_KEY, REVIEWS_KEY, FAVORITES_KEY, NOTIFICATIONS_KEY, REPORTS_KEY, AUDIT_KEY];
// Production always uses the real API; local-only demo accounts are development-only.
const configuredApiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
const API_URL = import.meta.env.PROD ? "" : configuredApiUrl?.replace(/\/+$/, "");
const useApi = import.meta.env.PROD || Boolean(API_URL);

const legacyDemoListingIds = new Set([
  "listing-maya",
  "listing-circuit",
  "listing-sam",
  "00000000-0000-0000-0000-000000000001",
  "00000000-0000-0000-0000-000000000002",
  "00000000-0000-0000-0000-000000000003",
]);

// Listing photographs can exceed browser localStorage limits. The API is the
// authoritative source in production; keep its listing response in memory.
let apiListingCache: Listing[] | null = null;
const read = <T,>(key: string, fallback: T): T => {
  if (useApi && key === LISTINGS_KEY) return (apiListingCache || fallback) as T;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
};
const write = (key: string, value: unknown) => {
  if (useApi && key === LISTINGS_KEY) {
    apiListingCache = value as Listing[];
    try { localStorage.removeItem(LISTINGS_KEY); } catch { /* storage unavailable */ }
    return;
  }
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (error) { console.warn("Unable to cache GURA browser data", key, error); }
};
export const refreshListings = async (): Promise<Listing[]> => {
  if (!useApi) return listListings();
  const result = await apiRequest<{ listings: Listing[] }>("/api/listings");
  write(LISTINGS_KEY, result.listings);
  return result.listings;
};
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const apiRequest = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const method=(init?.method||"GET").toUpperCase();
  if(method==="GET")return fetchMarketplaceGet<T>(`${API_URL}${path}`);
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "The server request failed.");
  return body as T;
};