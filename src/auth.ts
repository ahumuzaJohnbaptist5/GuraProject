import type { AuthAdapter, Credentials, User } from "./types";

const USERS_KEY = "gura-users";
const SESSION_KEY = "gura-session";

type StoredUser = User & { password: string };
const API_URL = import.meta.env.VITE_API_URL as string | undefined;
const useApi = Boolean(API_URL);

const readUsers = (): StoredUser[] => {
  const raw = localStorage.getItem(USERS_KEY);
  return raw ? (JSON.parse(raw) as StoredUser[]) : [];
};

const writeUsers = (users: StoredUser[]) => localStorage.setItem(USERS_KEY, JSON.stringify(users));
const saveSessionUser = (user: User | null) => {
  if (user) localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  else localStorage.removeItem(SESSION_KEY);
};
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

const localAuthAdapter: AuthAdapter = {
  async register(user, password) {
    if (useApi) {
      const result = await apiRequest<{ user: User }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name: user.name, email: user.email, password, role: user.role === "administrator" ? "customer" : user.role }),
      });
      saveSessionUser(result.user);
      return result.user;
    }
    const users = readUsers();
    if (users.some((entry) => entry.email.toLowerCase() === user.email.toLowerCase())) {
      throw new Error("An account with this email already exists.");
    }
    const stored = { ...user, password };
    writeUsers([...users, stored]);
    saveSessionUser(user);
    return user;
  },
  async login({ email, password }: Credentials) {
    if (useApi) {
      const result = await apiRequest<{ user: User }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      saveSessionUser(result.user);
      return result.user;
    }
    const match = readUsers().find(
      (entry) => entry.email.toLowerCase() === email.toLowerCase() && entry.password === password,
    );
    if (!match) throw new Error("Email or password is incorrect.");
    if (match.suspended) throw new Error("This account is suspended. Contact Gura support.");
    const { password: _password, ...user } = match;
    saveSessionUser(user);
    return user;
  },
  async logout() {
    if (useApi) {
      await apiRequest("/api/auth/logout", { method: "POST" });
      saveSessionUser(null);
      return;
    }
    localStorage.removeItem(SESSION_KEY);
  },
  getCurrentUser() {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  },
  async saveProfile(profile) {
    const current = localAuthAdapter.getCurrentUser();
    if (!current) throw new Error("You must be signed in.");
    if (useApi) {
      const result = await apiRequest<{ user: User }>("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify(profile),
      });
      saveSessionUser(result.user);
      return result.user;
    }
    const updated = { ...current, ...profile };
    const users = readUsers().map((entry) => (entry.id === current.id ? { ...entry, ...profile } : entry));
    writeUsers(users);
    saveSessionUser(updated);
    return updated;
  },
};

export default localAuthAdapter;
