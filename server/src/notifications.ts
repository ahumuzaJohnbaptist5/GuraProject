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
  if (mailer && notification) {
    try {
      await mailer.sendMail({
        from: config.email.from,
        to: notification.email,
        subject: `Gura: ${title}`,
        text: body,
      });
    } catch (error) {
      console.error("Unable to send notification email", error);
    }
  }
  return notification;
};
