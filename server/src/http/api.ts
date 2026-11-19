import express, { type NextFunction, type Request, type Response } from 'express';
import { validateFields } from './requestValidation.ts';
import { saveTicketImages } from '../domain/ticketImages.ts';
import { verifyStoreCode, raisePublicTicket } from '../domain/publicTickets.ts';
import {
  getConversation,
  readableTicket,
  assertConversationWrite,
  publicAttachment,
} from '../domain/conversations.ts';
import { applyAction } from '../domain/actions.ts';
import { login, getUser, logout, viewState, authenticatedAction } from '../domain/auth.ts';
import { snapshotTickets, ticketEvents, type TicketEvent } from '../domain/ticketEmails.ts';
import type { AttachmentStore } from '../storage/attachments.ts';
import type { Attachment, Payload, PublicUser, Ticket, WorkspaceState } from '../shared/types.ts';

export interface ApiOptions {
  load: () => Promise<WorkspaceState>;
  save: (state: WorkspaceState) => Promise<void>;
  available?: boolean;
  /** Shown to API callers when the database is not available. */
  unavailableMessage?: string;
  cookieSecure?: boolean;
  attachmentStore?: AttachmentStore;
  /** Called after a saved change created, assigned or changed the status of tickets. */
  onTicketEvents?: (state: WorkspaceState, events: TicketEvent[]) => void;
}

type MutationHandler = (state: WorkspaceState, req: Request, res: Response) => Promise<void>;

/** The JSON body as an untrusted record (validated by the router middleware for POST). */
const body = (req: Request): Payload => req.body as Payload;

/** HTTP transport only. Business validation and permissions run in the domain layer. */
export function createApiRouter({
  load,
  save,
  available = true,
  unavailableMessage = 'Database is not configured. Set MONGODB_URI on the server.',
  cookieSecure = false,
  attachmentStore,
  onTicketEvents,
}: ApiOptions): express.Router {
  const router = express.Router();
  router.use((req, res, next) => {
    if (!available) {
      res.status(503).json({ error: unavailableMessage });
      return;
    }
    res.set('Cache-Control', 'no-store');
    if (req.method === 'POST') {
      const origin = req.get('origin');
      if (origin && origin !== `${req.protocol}://${req.get('host')}`) {
        res.status(403).json({ error: 'Invalid request origin.' });
        return;
      }
      if (!req.is('application/json')) {
        res.status(415).json({ error: 'JSON body required.' });
        return;
      }
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        res.status(400).json({ error: 'Send a JSON object.' });
        return;
      }
    }
    next();
  });
  // The browser receives the session token in an HttpOnly cookie; state stores its hash.
  const cookieName = 'a2z_session';
  const readSessionToken = (req: Request): string => {
    const match = (req.headers.cookie || '')
      .split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(cookieName + '='));
    return match ? match.slice(cookieName.length + 1) : '';
  };
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: cookieSecure,
    path: '/',
    maxAge: 8 * 60 * 60 * 1000,
  };
  // Serialize mutations within this Node process. This is not a multi-server database transaction.
  let queue: Promise<void> = Promise.resolve();
  function serializeMutation(handler: MutationHandler) {
    return (req: Request, res: Response, next: NextFunction) => {
      const operation = queue.then(async () => {
        const state = await load();
        const before = snapshotTickets(state);
        await handler(state, req, res);
        // Handlers save before responding; a failed change throws and never reaches this point.
        const events = res.statusCode < 400 ? ticketEvents(before, state) : [];
        if (events.length && onTicketEvents) {
          try {
            onTicketEvents(state, events);
          } catch (error) {
            console.error(`Ticket notifications failed: ${(error as Error).message}`);
          }
        }
      });
      queue = operation.catch(() => {});
      operation.catch(next);
    };
  }
  const attempts = new Map<string, { count: number; until: number }>();
  function limitAuthAttempts(req: Request, res: Response, next: NextFunction) {
    const now = Date.now();
    for (const [key, item] of attempts) if (item.until <= now) attempts.delete(key);
    const key = req.ip ?? '';
    const entry = attempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
    entry.count++;
    attempts.set(key, entry);
    if (entry.count > 30) {
      res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
      return;
    }
    next();
  }
  async function requireSession(
    state: WorkspaceState,
    req: Request,
    res: Response,
  ): Promise<PublicUser | null> {
    const user = await getUser(state, readSessionToken(req));
    if (!user) res.status(401).json({ error: 'Please log in.' });
    return user;
  }
  function requireAttachmentStore(): AttachmentStore {
    if (!attachmentStore) throw Error('Attachment storage is not configured.');
    return attachmentStore;
  }

  // Auth routes: restore session, log in and log out. There is no public sign-up: Admin
  // creates every account from the Users screen.
  router.get('/auth/session', async (req, res, next) => {
    try {
      const state = await load();
      res.json({
        user: await getUser(state, readSessionToken(req)),
        mode: 'api',
        needsSetup: !state.users.some((u) => u.role === 'Admin' && u.passwordHash),
      });
    } catch (e) {
      next(e);
    }
  });
  router.post(
    '/auth/login',
    limitAuthAttempts,
    serializeMutation(async (state, req, res) => {
      validateFields(body(req));
      const result = await login(state, body(req));
      await save(state);
      res.cookie(cookieName, result.token, cookieOptions).json({ user: result.user });
    }),
  );
  router.post(
    '/auth/logout',
    serializeMutation(async (state, req, res) => {
      await logout(state, readSessionToken(req));
      await save(state);
      res.clearCookie(cookieName, { ...cookieOptions, maxAge: undefined }).json({ ok: true });
    }),
  );

  // Protected data routes: authenticate -> authorize/filter -> persist -> respond.
  router.get('/state', async (req, res, next) => {
    try {
      const state = await load();
      const user = await requireSession(state, req, res);
      if (!user) return;
      res.json({ ...viewState(state, user), storage: 'MongoDB', currentUser: user });
    } catch (e) {
      next(e);
    }
  });
  router.post(
    '/action',
    serializeMutation(async (state, req, res) => {
      const user = await requireSession(state, req, res);
      if (!user) return;
      const { type, payload = {} } = body(req);
      if (
        typeof type !== 'string' ||
        !payload ||
        typeof payload !== 'object' ||
        Array.isArray(payload)
      ) {
        res.status(400).json({ error: 'Invalid action payload.' });
        return;
      }
      const input = payload as Payload;
      validateFields(input);
      const result = await authenticatedAction(state, user, type, input, applyAction);
      const saved: Attachment[] = [];
      try {
        if (type === 'ticket')
          await saveTicketImages(
            state,
            user,
            result as Ticket,
            input.images,
            async (ticketId, file, userId) => requireAttachmentStore().save(ticketId, file, userId),
            saved,
          );
        await save(state);
      } catch (error) {
        await Promise.all(
          saved.map((file) =>
            requireAttachmentStore()
              .remove(file)
              .catch(() => {}),
          ),
        );
        throw error;
      }
      res.json({ ok: true, result });
    }),
  );

  router.get('/tickets/:ticketId/conversation', async (req, res, next) => {
    try {
      const state = await load();
      const user = await requireSession(state, req, res);
      if (!user) return;
      res.json(getConversation(state, user, req.params.ticketId));
    } catch (error) {
      next(error);
    }
  });
  router.post(
    '/tickets/:ticketId/attachments',
    serializeMutation(async (state, req, res) => {
      const user = await requireSession(state, req, res);
      if (!user) return;
      const ticket = assertConversationWrite(state, user, req.params.ticketId);
      const files = requireAttachmentStore();
      const metadata = await files.save(ticket.id, req.body, user.id);
      try {
        (ticket.attachments ??= []).push(metadata);
        await save(state);
      } catch (error) {
        await files.remove(metadata);
        throw error;
      }
      res.status(201).json({ attachment: publicAttachment(ticket.id, metadata) });
    }),
  );
  router.get('/tickets/:ticketId/attachments/:attachmentId', async (req, res, next) => {
    try {
      const state = await load();
      const user = await requireSession(state, req, res);
      if (!user) return;
      const ticket = readableTicket(state, user, req.params.ticketId);
      const metadata = (ticket.attachments || []).find(
        (file) => file.id === req.params.attachmentId,
      );
      if (!metadata) {
        res.status(404).json({ error: 'Attachment not found.' });
        return;
      }
      const files = requireAttachmentStore();
      res.set('X-Content-Type-Options', 'nosniff');
      res.set('Cache-Control', 'private, no-store');
      res.download(files.absolutePath(metadata), metadata.name, (error) => {
        if (error && !res.headersSent) next(error);
      });
    } catch (error) {
      next(error);
    }
  });

  // Public Store QR intake.
  router.post(
    '/public/verify',
    limitAuthAttempts,
    serializeMutation(async (state, req, res) => {
      validateFields(body(req));
      const result = await verifyStoreCode(state, body(req));
      await save(state);
      res.set('Cache-Control', 'no-store').json(result);
    }),
  );
  router.post(
    '/public/tickets',
    limitAuthAttempts,
    serializeMutation(async (state, req, res) => {
      validateFields(body(req));
      const result = await raisePublicTicket(state, body(req));
      await save(state);
      res.status(201).set('Cache-Control', 'no-store').json(result);
    }),
  );
  return router;
}
