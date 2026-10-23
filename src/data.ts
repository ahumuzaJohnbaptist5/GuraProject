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
const API_URL = import.meta.env.VITE_API_URL as string | undefined;
const useApi = Boolean(API_URL);

const legacyDemoListingIds = new Set([
  "listing-maya",
  "listing-circuit",
  "listing-sam",
  "00000000-0000-0000-0000-000000000001",
  "00000000-0000-0000-0000-000000000002",
  "00000000-0000-0000-0000-000000000003",
]);

const read = <T,>(key: string, fallback: T): T => {
  const raw = localStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T) : fallback;
};
const write = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value));
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const apiRequest = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "The server request failed.");
  return body as T;
};
export const isApiMode = useApi;
export const hydrateDomain = async () => {
  if (!useApi) return;
  const listings = await apiRequest<{ listings: Listing[] }>("/api/listings");
  write(LISTINGS_KEY, listings.listings);
  try {
    const requests = await apiRequest<{ requests: ServiceRequest[] }>("/api/requests");
    write(REQUESTS_KEY, requests.requests);
  } catch {
    write(REQUESTS_KEY, []);
  }
  try {
    const notifications = await apiRequest<{ notifications: Notification[] }>("/api/notifications");
    write(NOTIFICATIONS_KEY, notifications.notifications);
  } catch {
    write(NOTIFICATIONS_KEY, []);
  }
  try {
    const reports = await apiRequest<{ reports: ListingReport[] }>("/api/admin/reports");
    write(REPORTS_KEY, reports.reports);
    const audit = await apiRequest<{ events: AuditEvent[] }>("/api/admin/audit");
    write(AUDIT_KEY, audit.events);
    const users = await apiRequest<{ users: User[] }>("/api/admin/users");
    write("gura-users", users.users);
  } catch {
    // Non-administrators are expected to receive 403 for admin hydration.
  }
};

export const listListings = (): Listing[] => {
  const listings = read<Listing[]>(LISTINGS_KEY, []);
  const userListings = listings.filter((listing) => !legacyDemoListingIds.has(listing.id));
  if (userListings.length !== listings.length) write(LISTINGS_KEY, userListings);
  return userListings;
};
export const listRequests = (): ServiceRequest[] => read<ServiceRequest[]>(REQUESTS_KEY, []);
export const listMessages = (): Message[] => read<Message[]>(MESSAGES_KEY, []);
export const listReviews = (): Review[] => read<Review[]>(REVIEWS_KEY, []);
export const getListingRating = (listing: Listing) => {
  const reviews = listReviews().filter((review) => review.listingId === listing.id);
  if (!reviews.length) return listing.rating;
  return Math.round((reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length) * 10) / 10;
};
export const listFavorites = (userId: string): string[] => read<Record<string, string[]>>(FAVORITES_KEY, {})[userId] || [];
export const listNotifications = (userId: string): Notification[] => read<Notification[]>(NOTIFICATIONS_KEY, []).filter((item) => item.userId === userId);
export const listReports = (): ListingReport[] => read<ListingReport[]>(REPORTS_KEY, []);
export const listUsers = (): User[] => read<Array<User & { password: string }>>("gura-users", []).map(({ password: _password, ...user }) => user);
export const listAuditEvents = (): AuditEvent[] => read<AuditEvent[]>(AUDIT_KEY, []);
export const createAuditEvent = (event: AuditEvent) => {
  if (useApi) {
    void apiRequest<{ event: AuditEvent }>("/api/admin/audit", { method: "POST", body: JSON.stringify(event) })
      .catch((error) => console.error("Unable to create API audit event", error));
  }
  const next = [event, ...listAuditEvents()];
  write(AUDIT_KEY, next);
  return event;
};
export const exportDomainData = () => ({
  exportedAt: new Date().toISOString(),
  listings: clone(listListings()),
  requests: clone(listRequests()),
  messages: clone(listMessages()),
  reviews: clone(listReviews()),
  favorites: clone(read<Record<string, string[]>>(FAVORITES_KEY, {})),
  notifications: clone(read<Notification[]>(NOTIFICATIONS_KEY, [])),
  reports: clone(listReports()),
  auditEvents: clone(listAuditEvents()),
});
export const resetDomainData = () => DOMAIN_KEYS.forEach((key) => localStorage.removeItem(key));

export const createRequest = (request: ServiceRequest) => {
  if (useApi) {
    void apiRequest<{ request: ServiceRequest }>("/api/requests", {
      method: "POST",
      body: JSON.stringify({
        listingId: request.listingId,
        title: request.title,
        details: request.details,
        preferredDate: request.preferredDate || undefined,
        preferredTime: request.preferredTime || undefined,
      }),
    }).then(({ request: created }) => {
      write(REQUESTS_KEY, [created, ...listRequests().filter((item) => item.id !== request.id)]);
    }).catch((error) => console.error("Unable to create API request", error));
  }
  const next = [request, ...listRequests()];
  write(REQUESTS_KEY, next);
  if (request.providerId) createNotification({ id: crypto.randomUUID(), userId: request.providerId, title: "New service request", body: request.title, read: false, createdAt: new Date().toISOString() });
  return request;
};
export const updateRequest = (id: string, status: ServiceRequest["status"]) => {
  if (useApi) void apiRequest(`/api/requests/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }).catch((error) => console.error("Unable to update API request status", error));
  const next = listRequests().map((request) => request.id === id ? { ...request, status } : request);
  write(REQUESTS_KEY, next);
  const request = next.find((item) => item.id === id);
  if (request) createNotification({ id: crypto.randomUUID(), userId: request.customerId, title: `Request ${status}`, body: request.title, read: false, createdAt: new Date().toISOString() });
};
export const confirmRequestDate = (id: string, confirmedDate: string, confirmedTime?: string) => {
  if (useApi) void apiRequest(`/api/requests/${id}/appointment`, { method: "PATCH", body: JSON.stringify({ confirmedDate, confirmedTime }) }).catch((error) => console.error("Unable to update API appointment", error));
  const next = listRequests().map((request) => request.id === id ? { ...request, confirmedDate, confirmedTime } : request);
  write(REQUESTS_KEY, next);
  const request = next.find((item) => item.id === id);
  if (request) createNotification({ id: crypto.randomUUID(), userId: request.customerId, title: "Appointment confirmed", body: `${request.title} · ${confirmedDate}${confirmedTime ? ` at ${confirmedTime}` : ""}`, read: false, createdAt: new Date().toISOString() });
};
export const createMessage = (message: Message) => {
  const next = [...listMessages(), message];
  write(MESSAGES_KEY, next);
  return message;
};
export const createReview = (review: Review) => {
  const next = [review, ...listReviews()];
  write(REVIEWS_KEY, next);
  return review;
};
export const toggleFavorite = (userId: string, listingId: string) => {
  const favorites = read<Record<string, string[]>>(FAVORITES_KEY, {});
  const current = favorites[userId] || [];
  favorites[userId] = current.includes(listingId) ? current.filter((id) => id !== listingId) : [...current, listingId];
  write(FAVORITES_KEY, favorites);
  return favorites[userId];
};
export const createListing = (listing: Listing) => {
  if (useApi) {
    void apiRequest<{ listing: Listing }>("/api/listings", {
      method: "POST",
      body: JSON.stringify({
        name: listing.name,
        type: listing.type,
        location: listing.location,
        text: listing.text,
        services: listing.services,
        imageUrls: listing.images || [],
        availability: listing.availability || null,
      }),
    }).then(({ listing: created }) => {
      write(LISTINGS_KEY, [created, ...listListings().filter((item) => item.id !== listing.id)]);
    }).catch((error) => console.error("Unable to create API listing", error));
  }
  const next = [listing, ...listListings()];
  write(LISTINGS_KEY, next);
  return listing;
};
export const updateListingStatus = (id: string, moderationStatus: Listing["moderationStatus"]) => {
  if (useApi && moderationStatus) {
    void apiRequest<{ listing: Listing }>(`/api/admin/listings/${id}/moderation`, {
      method: "PATCH",
      body: JSON.stringify({ moderationStatus }),
    }).catch((error) => console.error("Unable to moderate API listing", error));
  }
  const next = listListings().map((listing) => listing.id === id ? { ...listing, moderationStatus, verified: moderationStatus === "approved" ? listing.verified : false } : listing);
  write(LISTINGS_KEY, next);
};
export const updateListing = (id: string, update: Partial<Listing>) => {
  if (useApi) {
    const { images, ...rest } = update;
    void apiRequest<{ listing: Listing }>(`/api/listings/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ ...rest, ...(images ? { imageUrls: images } : {}) }),
    }).catch((error) => console.error("Unable to update API listing", error));
  }
  const next = listListings().map((listing) => listing.id === id ? { ...listing, ...update } : listing);
  write(LISTINGS_KEY, next);
};
export const createNotification = (notification: Notification) => {
  const next = [notification, ...read<Notification[]>(NOTIFICATIONS_KEY, [])];
  write(NOTIFICATIONS_KEY, next);
  return notification;
};
export const markNotificationsRead = (userId: string) => {
  if (useApi) {
    void apiRequest(`/api/notifications/read`, { method: "PATCH", body: "{}" })
      .catch((error) => console.error("Unable to mark API notifications read", error));
  }
  const next = read<Notification[]>(NOTIFICATIONS_KEY, []).map((item) => item.userId === userId ? { ...item, read: true } : item);
  write(NOTIFICATIONS_KEY, next);
};
export const createReport = (report: ListingReport) => {
  if (useApi) {
    void apiRequest<{ report: ListingReport }>("/api/reports", { method: "POST", body: JSON.stringify(report) })
      .catch((error) => console.error("Unable to create API report", error));
  }
  const next = [report, ...listReports()];
  write(REPORTS_KEY, next);
  return report;
};
export const updateReportStatus = (id: string, status: ListingReport["status"]) => {
  if (useApi) {
    void apiRequest<{ report: ListingReport }>(`/api/admin/reports/${id}`, { method: "PATCH", body: JSON.stringify({ status }) })
      .catch((error) => console.error("Unable to update API report", error));
  }
  write(REPORTS_KEY, listReports().map((report) => report.id === id ? { ...report, status } : report));
};

export type DomainAdapter = {
  listListings: () => Listing[];
  listRequests: () => ServiceRequest[];
  listMessages: () => Message[];
  createRequest: (request: ServiceRequest) => ServiceRequest;
  updateRequest: (id: string, status: ServiceRequest["status"]) => void;
  confirmRequestDate: (id: string, confirmedDate: string, confirmedTime?: string) => void;
  createMessage: (message: Message) => Message;
  listReviews: () => Review[];
  getListingRating: (listing: Listing) => number;
  listFavorites: (userId: string) => string[];
  createReview: (review: Review) => Review;
  toggleFavorite: (userId: string, listingId: string) => string[];
  listNotifications: (userId: string) => Notification[];
  markNotificationsRead: (userId: string) => void;
  createListing: (listing: Listing) => Listing;
  updateListingStatus: (id: string, status: Listing["moderationStatus"]) => void;
  updateListing: (id: string, update: Partial<Listing>) => void;
  listReports: () => ListingReport[];
  createReport: (report: ListingReport) => ListingReport;
  updateReportStatus: (id: string, status: ListingReport["status"]) => void;
  updateUser: (userId: string, update: Partial<User>) => void;
  listUsers: () => User[];
  listAuditEvents: () => AuditEvent[];
  createAuditEvent: (event: AuditEvent) => AuditEvent;
  exportDomainData: () => ReturnType<typeof exportDomainData>;
  resetDomainData: () => void;
};

export const domainAdapter: DomainAdapter = {
  listListings,
  listRequests,
  listMessages,
  createRequest,
  updateRequest,
  confirmRequestDate,
  createMessage,
  listReviews,
  getListingRating,
  listFavorites,
  createReview,
  toggleFavorite,
  listNotifications,
  markNotificationsRead,
  createListing,
  updateListingStatus,
  updateListing,
  listReports,
  createReport,
  updateReportStatus,
  updateUser(userId, update) {
    if (useApi) {
      void apiRequest<{ user: User }>(`/api/admin/users/${userId}`, { method: "PATCH", body: JSON.stringify(update) })
        .catch((error) => console.error("Unable to update API user", error));
    }
    const raw = localStorage.getItem("gura-users");
    if (!raw) return;
    const users = JSON.parse(raw) as Array<User & { password: string }>;
    localStorage.setItem("gura-users", JSON.stringify(users.map((user) => user.id === userId ? { ...user, ...update } : user)));
  },
  listUsers,
  listAuditEvents,
  createAuditEvent,
  exportDomainData,
  resetDomainData,
};
