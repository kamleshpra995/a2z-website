import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createAttachmentStore } from './storage/attachments.ts';
import { connectWorkspaceStore, type ConnectedStore } from './storage/database.ts';
import { createAdmin } from './domain/auth.ts';
import { createApiRouter } from './http/api.ts';
import { ticketEmails } from './domain/ticketEmails.ts';
import { createMailer } from './storage/mailer.ts';

// 1. Load server-only environment values (server/.env) and connect to MongoDB when configured.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
const env = process.env;
// A connection failure must not crash the server: keep serving and explain the problem instead.
let store: ConnectedStore = { available: false };
let unavailableMessage = 'Database is not configured. Set MONGODB_URI in server/.env.';
try {
  store = await connectWorkspaceStore(env.MONGODB_URI, env.MONGODB_DB);
} catch (error) {
  unavailableMessage =
    'Cannot reach MongoDB. Check MONGODB_URI in server/.env and that this computer’s IP address is allowed in Atlas Network Access.';
  console.error(`MongoDB connection failed: ${(error as Error).message}\n${unavailableMessage}`);
}
// Ticket emails go out after each saved change, in the background, when SMTP is configured.
const sendEmails = createMailer(env);
const emailOptions = { portalUrl: env.PORTAL_URL, supportEmail: env.SUPPORT_EMAIL };
const app = express();
if (env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.use(express.json({ limit: '4mb' }));

// 2. JSON API.
app.use(
  '/api',
  store.available
    ? createApiRouter({
        load: store.load,
        save: store.save,
        cookieSecure: env.COOKIE_SECURE === 'true',
        attachmentStore: createAttachmentStore(env.UPLOAD_DIR || path.join(root, 'uploads')),
        onTicketEvents: sendEmails
          ? (state, events) => void sendEmails(ticketEmails(state, events, emailOptions))
          : undefined,
      })
    : createApiRouter({
        available: false,
        unavailableMessage,
        load: () => Promise.reject(Error('Database is not configured.')),
        save: () => Promise.reject(Error('Database is not configured.')),
      }),
);

// 3. The first Admin is configured on the server, never by public registration.
if (store.available) {
  const state = await store.load();
  if (
    !state.users.some((user) => user.role === 'Admin' && user.passwordHash) &&
    env.ADMIN_EMAIL &&
    env.ADMIN_PASSWORD
  ) {
    await createAdmin(state, {
      name: env.ADMIN_NAME || 'A2Z Admin',
      email: env.ADMIN_EMAIL,
      password: env.ADMIN_PASSWORD,
    });
    await store.save(state);
  }
}

// 4. API errors: database failures are reported generically, domain errors keep their message.
app.use((error: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const internal = error.name?.startsWith('Mongo') || error.name === 'MongooseError';
  const status = internal ? 503 : error.status || 400;
  res
    .status(status)
    .json({ error: internal ? 'Database unavailable. Please retry.' : error.message });
});

// 5. In production, serve the built webapp: the pre-rendered website at "/" and the
//    portal single-page app under "/portal/". In development, Vite serves the webapp.
if (env.NODE_ENV === 'production') {
  const dist = path.resolve(env.WEBAPP_DIST || path.join(root, '..', 'webapp', 'dist'));
  app.use(express.static(dist));
  app.get('/portal/{*path}', (_req, res) => res.sendFile(path.join(dist, 'portal', 'index.html')));
  // The portal used to live at /app/.
  app.get(['/app', '/app/{*path}'], (req, res) =>
    res.redirect(301, '/portal/' + (req.url.split('?')[1] ? '?' + req.url.split('?')[1] : '')),
  );
}

const port = Number(env.PORT) || 4173;
app.listen(port, env.HOST || '127.0.0.1', () =>
  console.log(
    `A2Z server: http://127.0.0.1:${port} (${store.available ? 'MongoDB API ready' : `API unavailable: ${unavailableMessage}`}; ticket emails ${sendEmails ? 'on' : 'off: set SMTP_HOST, SMTP_USER and SMTP_PASS'})`,
  ),
);
