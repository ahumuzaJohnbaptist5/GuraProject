import "dotenv/config";

const required = (name: string, fallback?: string) => {
  const value = process.env[name] || fallback;
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
};

const normalizeOrigin = (value: string) => {
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withProtocol.replace(/\/+$/, "");
};

export const config = {
  port: Number(process.env.PORT || 8787),
  databaseUrl: required("DATABASE_URL"),
  webOrigin: normalizeOrigin(required("WEB_ORIGIN", "http://127.0.0.1:5173")),
  sessionDays: Number(process.env.SESSION_DAYS || 7),
  production: process.env.NODE_ENV === "production",
  email: {
    resendApiKey: process.env.RESEND_API_KEY || "",
    resendFrom: process.env.RESEND_FROM || "",
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 465),
    user: process.env.SMTP_USER || "",
    password: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || process.env.SMTP_USER || "",
  },
};
