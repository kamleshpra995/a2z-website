/** Outgoing email over SMTP (Zoho Mail by default). */
import nodemailer from 'nodemailer';
import type { Email } from '../domain/ticketEmails.ts';

export interface MailSettings {
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  MAIL_FROM?: string;
}

export type SendEmails = (emails: Email[]) => Promise<void>;

/** A sender for the configured SMTP account, or null when email is not configured. */
export function createMailer(env: MailSettings): SendEmails | null {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) return null;
  const port = Number(env.SMTP_PORT) || 465;
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  const from = env.MAIL_FROM || `A2Z Power Solution <${env.SMTP_USER}>`;
  // One at a time: Zoho limits bursts, and a failed email must not stop the others.
  return async (emails) => {
    for (const email of emails) {
      try {
        await transport.sendMail({ from, ...email });
      } catch (error) {
        console.error(`Email to ${email.to} failed: ${(error as Error).message}`);
      }
    }
  };
}
