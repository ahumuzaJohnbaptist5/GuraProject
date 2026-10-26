import "dotenv/config";

const required = (name: string, fallback?: string) => {
  const value = process.env[name] || fallback;
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
};

const webOrigins = (process.env.WEB_ORIGIN || (process.env.NODE_ENV === "production"
  ? "https://gura-web-bkid.onrender.com" : "http://127.0.0.1:5173"))
  .split(",").map((origin) => new URL(origin.trim()).origin);
// Existing Render services may still have the original localhost WEB_ORIGIN.
if (process.env.NODE_ENV === "production" && !webOrigins.includes("https://gura-web-bkid.onrender.com")) {
  webOrigins.push("https://gura-web-bkid.onrender.com");
}

export const config = {
  port: Number(process.env.PORT || 8787),
  databaseUrl: required("DATABASE_URL"),
  webOrigin: webOrigins[0],
  webOrigins,
  sessionDays: Number(process.env.SESSION_DAYS || 7),
  production: process.env.NODE_ENV === "production",
  email: {
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 465),
    user: process.env.SMTP_USER || "",
    password: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || process.env.SMTP_USER || "",
  },
};
