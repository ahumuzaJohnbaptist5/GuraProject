import "dotenv/config";

const required = (name: string, fallback?: string) => {
  const value = process.env[name] || fallback;
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
};

export const config = {
  port: Number(process.env.PORT || 8787),
  databaseUrl: required("DATABASE_URL"),
  webOrigin: required("WEB_ORIGIN", "http://127.0.0.1:5173"),
  sessionDays: Number(process.env.SESSION_DAYS || 7),
  production: process.env.NODE_ENV === "production",
};
