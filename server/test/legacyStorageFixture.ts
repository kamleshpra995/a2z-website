// Test-only: the original browser (LocalStorage) adapter, kept to exercise the domain rules
// end-to-end without HTTP. The live webapp always talks to the API.
import { saveTicketImages } from '../src/domain/ticketImages.ts';
import { verifyStoreCode, raisePublicTicket } from '../src/domain/publicTickets.ts';
import {
  getConversation,
  readableTicket,
  assertConversationWrite,
  publicAttachment,
} from '../src/domain/conversations.ts';
import { validateAttachment } from '../src/shared/attachmentValidation.ts';
import { createState } from '../src/domain/state.ts';
import { applyAction } from '../src/domain/actions.ts';
import { seedAccounts, type ConfiguredAccount } from '../src/domain/bootstrap.ts';
import {
  register,
  createAdmin,
  login,
  getUser,
  logout,
  viewState,
  authenticatedAction,
} from '../src/domain/auth.ts';
import type {
  ActionResults,
  ActionType,
  Attachment,
  Payload,
  PublicUser,
  WorkspaceState,
} from '../src/shared/types.ts';

export const STORAGE_KEY = 'a2z-service-desk:v1';
export const SESSION_KEY = 'a2z-service-desk:session';

export interface MemoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): unknown;
  removeItem?(key: string): unknown;
}
export interface StoredFile {
  id: string;
  base64: string;
  mime: string;
}
export interface FileStore {
  put(file: StoredFile): Promise<unknown>;
  get?(id: string): Promise<StoredFile | undefined>;
  remove(id: string): Promise<unknown>;
}
export interface StorageOptions {
  mode?: 'local' | 'api';
  localStorage: MemoryStorage;
  fetch?: unknown;
  bootstrapAdmin?: ConfiguredAccount;
  initialAccounts?: ConfiguredAccount[];
  fileStore?: FileStore;
}
type StatusError = Error & { status?: number };

/** In-memory LocalStorage stand-in. */
export const memoryStorage = (initial?: Iterable<[string, string]>) => {
  const items = new Map<string, string>(initial);
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => items.set(key, value),
    removeItem: (key: string) => items.delete(key),
  };
};

/** One interface for tests: local mode runs the domain rules against browser-like storage. */
export function createStorage({
  mode = 'local',
  localStorage,
  bootstrapAdmin,
  initialAccounts,
  fileStore,
}: StorageOptions) {
  if (!['local', 'api'].includes(mode)) throw Error('VITE_STORAGE_MODE must be local or api.');
  const save = (state: WorkspaceState) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      throw Error(
        'Browser storage is full or unavailable. Data was not saved; remove large images or switch to API mode.',
      );
    }
  };
  // Bootstrap only the initial local Admin; preserve an Admin that already has credentials.
  const load = (): WorkspaceState => {
    const raw = localStorage.getItem(STORAGE_KEY);
    const state = raw === null ? createState() : (JSON.parse(raw) as WorkspaceState);
    if (bootstrapAdmin && !state.users.some((u) => u.role === 'Admin' && u.passwordHash)) {
      state.users = state.users.filter((u) => !(u.id === 'admin' && !u.passwordHash));
      state.users.push(structuredClone(bootstrapAdmin));
      save(state);
    }
    if (initialAccounts && seedAccounts(state, initialAccounts)) save(state);
    return state;
  };
  // Serialize writes in this adapter instance so overlapping actions do not overwrite each other.
  let queue: Promise<unknown> = Promise.resolve();
  const mutate = <T>(fn: (state: WorkspaceState) => T | Promise<T>): Promise<T> => {
    const next = queue.then(async () => {
      const state = load();
      const result = await fn(state);
      save(state);
      return result;
    });
    queue = next.catch(() => {});
    return next;
  };
  const token = () => localStorage.getItem(SESSION_KEY);
  const requireUser = async (state: WorkspaceState): Promise<PublicUser> => {
    const user = await getUser(state, token());
    if (!user) {
      const error: StatusError = Error('Please log in.');
      error.status = 401;
      throw error;
    }
    return user;
  };
  const requireFiles = (): FileStore => {
    if (!fileStore) throw Error('Browser attachment storage is not configured.');
    return fileStore;
  };
  const publicAttempts = new Map<unknown, { count: number; until: number }>();
  return {
    async verifyStore(payload: Payload) {
      const previous = publicAttempts.get(payload.storeId);
      const attempt =
        previous && previous.until > Date.now()
          ? previous
          : { count: 0, until: Date.now() + 15 * 60 * 1000 };
      publicAttempts.set(payload.storeId, attempt);
      if (++attempt.count > 10) throw Error('Too many attempts. Try again after 15 minutes.');
      return mutate((state) => verifyStoreCode(state, payload));
    },
    async raisePublicTicket(payload: Payload) {
      return mutate((state) => raisePublicTicket(state, payload));
    },
    async session() {
      const state = load();
      return {
        user: await getUser(state, token()),
        mode,
        needsSetup: !state.users.some((u) => u.role === 'Admin' && u.passwordHash),
      };
    },
    async register(payload: Payload) {
      return mutate(async (state) => ({ user: await register(state, payload) }));
    },
    async setup(payload: Payload) {
      return mutate(async (state) => ({ user: await createAdmin(state, payload) }));
    },
    async login(payload: Payload) {
      const result = await mutate((state) => login(state, payload));
      try {
        localStorage.setItem(SESSION_KEY, result.token);
      } catch {
        throw Error('Browser storage is unavailable.');
      }
      return { user: result.user };
    },
    async logout() {
      await mutate((state) => logout(state, token()));
      localStorage.removeItem?.(SESSION_KEY);
    },
    async getConversation(ticketId: string) {
      const state = load();
      return getConversation(state, await requireUser(state), ticketId);
    },
    async uploadAttachment(ticketId: string, file: { name: string; base64: string }) {
      let savedId: string | undefined;
      try {
        return await mutate(async (state) => {
          const user = await requireUser(state);
          const ticket = assertConversationWrite(state, user, ticketId);
          const validated = validateAttachment(file);
          const files = requireFiles();
          const metadata: Attachment = {
            id: crypto.randomUUID(),
            name: validated.name,
            mime: validated.mime,
            size: validated.size,
            createdBy: user.id,
            createdAt: new Date().toISOString(),
          };
          savedId = metadata.id;
          await files.put({ id: metadata.id, base64: file.base64, mime: metadata.mime });
          (ticket.attachments ??= []).push(metadata);
          return { attachment: publicAttachment(ticket.id, metadata) };
        });
      } catch (error) {
        if (savedId) await fileStore?.remove(savedId).catch(() => {});
        throw error;
      }
    },
    async getAttachmentUrl(ticketId: string, attachmentId: string) {
      const state = load();
      const ticket = readableTicket(state, await requireUser(state), ticketId);
      if (!(ticket.attachments || []).some((file) => file.id === attachmentId))
        throw Error('Attachment not found.');
      const saved = await fileStore?.get?.(attachmentId);
      if (!saved) throw Error('Attachment file is missing from this browser.');
      const bytes = Uint8Array.from(atob(saved.base64), (char) => char.charCodeAt(0));
      return URL.createObjectURL(new Blob([bytes], { type: saved.mime }));
    },
    async getState() {
      const state = load();
      const user = await requireUser(state);
      return { ...viewState(state, user), storage: 'LocalStorage', currentUser: user };
    },
    async action<T extends ActionType>(
      type: T,
      payload: Payload,
    ): Promise<{ ok: true; result: ActionResults[T] }> {
      const saved: Attachment[] = [];
      try {
        return await mutate(async (state) => {
          const user = await requireUser(state);
          const result = await authenticatedAction(state, user, type, payload, applyAction);
          if (type === 'ticket')
            await saveTicketImages(
              state,
              user,
              result as ActionResults['ticket'],
              payload.images,
              async (_ticketId, file, userId, validated) => {
                const files = requireFiles();
                const metadata: Attachment = {
                  id: crypto.randomUUID(),
                  name: validated.name,
                  mime: validated.mime,
                  size: validated.size,
                  createdBy: userId,
                  createdAt: new Date().toISOString(),
                };
                await files.put({ id: metadata.id, base64: file.base64, mime: metadata.mime });
                return metadata;
              },
              saved,
            );
          return { ok: true as const, result };
        });
      } catch (error) {
        await Promise.all(saved.map((file) => fileStore?.remove(file.id).catch(() => {})));
        throw error;
      }
    },
  };
}
