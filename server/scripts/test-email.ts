/**
 * Check the SMTP settings in server/.env by logging in and sending one test email.
 *   npm run email:test -w server -- you@example.com
 * Without an address, the test goes to SMTP_USER itself.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch {
  console.error('server/.env not found. Copy server/.env.example to server/.env first.');
  process.exit(1);
}
const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;
if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
  console.error('Set SMTP_HOST, SMTP_USER and SMTP_PASS in server/.env first.');
  process.exit(1);
}
const to = process.argv[2] || SMTP_USER;
const port = Number(SMTP_PORT) || 465;
const transport = nodemailer.createTransport({
  host: SMTP_HOST,
  port,
  secure: port === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});
console.log(`Connecting to ${SMTP_HOST}:${port} as ${SMTP_USER} …`);
try {
  await transport.verify();
  console.log('Login OK.');
  await transport.sendMail({
    from: MAIL_FROM || `A2Z Power Solution <${SMTP_USER}>`,
    to,
    subject: 'A2Z Service Desk – test email',
    text: 'This is a test from the A2Z Service Desk. Ticket emails are set up correctly.',
  });
  console.log(`Test email sent to ${to}. Check the inbox (and spam folder).`);
} catch (error) {
  const message = (error as Error).message;
  console.error(`Failed: ${message}`);
  if (/535|auth/i.test(message))
    console.error(
      'Hint: wrong username/password. Use the full email address and a Zoho App Password; check that SMTP access is allowed for this mailbox and plan.',
    );
  else if (/553|relay|sender/i.test(message))
    console.error('Hint: MAIL_FROM must use the same address as SMTP_USER (or an alias of it).');
  else if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ESOCKET/i.test(message))
    console.error(
      'Hint: check SMTP_HOST/SMTP_PORT (smtppro.zoho.in, 465) and that your network allows it.',
    );
  process.exit(1);
}
