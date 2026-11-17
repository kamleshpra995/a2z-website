import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createAttachmentStore } from './storage/attachments.ts';
import { connectWorkspaceStore } from './storage/database.ts';
import { createAdmin } from './domain/auth.ts';
import { createApiRouter } from './http/api.ts';

// 1. Load server-only environment values (server/.env) and connect to MongoDB when configured.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
const env = process.env;
const store = await connectWorkspaceStore(env.MONGODB_URI, env.MONGODB_DB);
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
      })
    : createApiRouter({
        available: false,
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
//    dashboard single-page app under "/app/". In development, Vite serves the webapp.
if (env.NODE_ENV === 'production') {
  const dist = path.resolve(env.WEBAPP_DIST || path.join(root, '..', 'webapp', 'dist'));
  app.use(express.static(dist));
  app.get('/app/{*path}', (_req, res) => res.sendFile(path.join(dist, 'app', 'index.html')));
}

const port = Number(env.PORT) || 4173;
app.listen(port, env.HOST || '127.0.0.1', () =>
  console.log(
    `A2Z server: http://127.0.0.1:${port} (${store.available ? 'MongoDB API ready' : 'API unavailable: set MONGODB_URI'}; authentication enabled)`,
  ),
);
