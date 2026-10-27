import nodemailer from "nodemailer";
import { config } from "./config.js";
import { query } from "./db.js";

const mailer = config.email.user && config.email.password
  ? nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.port === 465,
      auth: { user: config.email.user, pass: config.email.password },
    })
  : null;

const sendWithResend = async (to: string, subject: string, text: string) => {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.email.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: config.email.resendFrom, to: [to], subject, text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend returned ${response.status}: ${detail.slice(0, 300)}`);
  }
};

const sendEmail = async (to: string, subject: string, text: string) => {
  if (config.email.resendApiKey && config.email.resendFrom) {
    await sendWithResend(to, subject, text);
    return;
  }
  if (mailer) {
    await mailer.sendMail({ from: config.email.from, to, subject, text });
  }
};

export const createNotification = async (userId: string, title: string, body: string) => {
  const result = await query<{ id: string; email: string }>(
    `WITH inserted AS (
       INSERT INTO notifications (user_id, title, body)
       VALUES ($1, $2, $3)
       RETURNING id, user_id
     )
     SELECT inserted.id, users.email
     FROM inserted JOIN users ON users.id = inserted.user_id`,
    [userId, title, body],
  );
  const notification = result.rows[0];
  if (notification && ((config.email.resendApiKey && config.email.resendFrom) || mailer)) {
    try {
      await sendEmail(notification.email, `Gura: ${title}`, body);
    } catch (error) {
      console.error("Unable to send notification email", error);
    }
  }
  return notification;
};
