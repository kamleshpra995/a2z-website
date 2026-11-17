import { clientNameKey } from './clients.ts';
import {
  applyConversationAction,
  isConversationAction,
  nextFollowUp,
  readableTicket,
  recordActivity,
} from './conversations.ts';
import { canAccessCustomerStore, ownedClientIds } from './ownership.ts';
import type { ApplyAction } from './actions.ts';
import {
  isInternalRole,
  type ActionResults,
  type ActionType,
  type Actor,
  type Payload,
  type PublicUser,
  type Ticket,
  type User,
  type ViewUser,
  type WorkspaceState,
  type WorkspaceView,
} from '../shared/types.ts';

// Shared authentication rules. Web Crypto keeps the algorithm identical in Node and browsers.
const crypto = globalThis.crypto;
const hex = (bytes: ArrayBuffer | Uint8Array): string =>
  Array.from(new Uint8Array(bytes), (v) => v.toString(16).padStart(2, '0')).join('');
const unhex = (value: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(value.match(/../g) || [], (v) => parseInt(v, 16));

/** Strip credential fields before returning a user to UI/API callers. */
export const safeUser = ({ passwordHash: _hash, passwordSalt: _salt, ...user }: User): PublicUser =>
  user;

export const normalizeEmail = (value: unknown): string =>
  String(value || '')
    .trim()
    .toLowerCase();

/** Derive a password hash with Web Crypto; the same algorithm runs in Node and browsers. */
export async function passwordHash(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  return hex(
    await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: unhex(salt), iterations: 210000, hash: 'SHA-256' },
      key,
      256,
    ),
  );
}

export async function setPassword(
  user: Pick<User, 'passwordHash' | 'passwordSalt'>,
  password: unknown,
): Promise<void> {
  if (typeof password !== 'string' || password.length < 10 || password.length > 128)
    throw Error('Use a password with 10–128 characters.');
  user.passwordSalt = hex(crypto.getRandomValues(new Uint8Array(16)));
  user.passwordHash = await passwordHash(password, user.passwordSalt);
}

export function validateAccount(
  state: WorkspaceState,
  payload: Payload,
  excludeId?: string,
): string {
  if (!String(payload.name || '').trim()) throw Error('Full name is required.');
  const email = normalizeEmail(payload.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error('Enter a valid email address.');
  if (state.users.some((u) => u.id !== excludeId && normalizeEmail(u.email) === email))
    throw Error('An account with this email already exists.');
  return email;
}

/** Register Client/Supervisor as Pending. Admin approval is needed before login. */
export async function register(state: WorkspaceState, payload: Payload): Promise<PublicUser> {
  if (payload.role !== 'Client' && payload.role !== 'Supervisor')
    throw Error('Registration is available for Clients and Supervisors only.');
  const email = validateAccount(state, payload);
  const user: User = {
    id: crypto.randomUUID(),
    name: String(payload.name).trim(),
    email,
    phone: String(payload.phone || ''),
    role: payload.role,
    accountStatus: 'Pending',
    createdAt: new Date().toISOString(),
  };
  await setPassword(user, payload.password);
  if (payload.role === 'Client') {
    const name = String(payload.company || '').trim();
    if (!name) throw Error('Company name is required.');
    const existing = state.clients.find((c) => clientNameKey(c.name) === clientNameKey(name));
    const clientId = existing?.id || crypto.randomUUID();
    user.clientId = clientId;
    if (!existing)
      state.clients.push({
        id: clientId,
        name,
        contact: user.name,
        email,
        phone: user.phone,
        address: '',
      });
  }
  state.users.push(user);
  for (const admin of state.users.filter(
    (account) => account.role === 'Admin' && account.accountStatus === 'Active',
  )) {
    state.notifications.unshift({
      id: crypto.randomUUID(),
      userId: admin.id,
      text: `New ${user.role === 'Client' ? 'Customer' : user.role} registration: ${user.name}. Review under Internal users.`,
      read: false,
      createdAt: new Date().toISOString(),
    });
  }
  return safeUser(user);
}

export async function createAdmin(state: WorkspaceState, payload: Payload): Promise<PublicUser> {
  if (state.users.some((u) => u.role === 'Admin' && u.passwordHash))
    throw Error('Admin account is already configured.');
  const email = validateAccount(state, payload);
  const user: User = {
    id: crypto.randomUUID(),
    name: String(payload.name).trim(),
    email,
    role: 'Admin',
    accountStatus: 'Active',
    createdAt: new Date().toISOString(),
  };
  await setPassword(user, payload.password);
  state.users = state.users.filter((u) => !(u.id === 'admin' && !u.passwordHash));
  state.users.push(user);
  return safeUser(user);
}

async function tokenHash(token: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
}

/** Verify credentials and issue an 8-hour session. Only the token hash is stored in state. */
export async function login(
  state: WorkspaceState,
  payload: Payload,
): Promise<{ token: string; user: PublicUser }> {
  const user = state.users.find(
    (u) => normalizeEmail(u.email) === normalizeEmail(payload.email) && u.passwordHash,
  );
  const hash = await passwordHash(
    String(payload.password || ''),
    user?.passwordSalt || '00'.repeat(16),
  );
  if (!user || hash !== user.passwordHash) throw Error('Email or password is incorrect.');
  if (user.accountStatus !== 'Active') throw Error('Your registration is awaiting Admin approval.');
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  state.sessions = (state.sessions || []).filter((s) => s.expiresAt > Date.now());
  state.sessions.push({
    hash: await tokenHash(token),
    userId: user.id,
    expiresAt: Date.now() + 8 * 60 * 60 * 1000,
  });
  return { token, user: safeUser(user) };
}

export async function getUser(
  state: WorkspaceState,
  token: string | null | undefined,
): Promise<PublicUser | null> {
  if (!token) return null;
  const hash = await tokenHash(token);
  const session = (state.sessions || []).find((s) => s.hash === hash && s.expiresAt > Date.now());
  const user =
    session && state.users.find((u) => u.id === session.userId && u.accountStatus === 'Active');
  return user ? safeUser(user) : null;
}

export async function logout(
  state: WorkspaceState,
  token: string | null | undefined,
): Promise<void> {
  const hash = await tokenHash(token || '');
  state.sessions = (state.sessions || []).filter((s) => s.hash !== hash);
}

/** Return the part of the workspace this user can read, excluding password/session records. */
export function viewState(state: WorkspaceState, user: Actor): WorkspaceView {
  const customer = user.role === 'Client';
  const worker = user.role === 'Field Worker';
  const ownedIds = ownedClientIds(state, user);
  const tickets = state.tickets.filter((ticket) =>
    customer
      ? canAccessCustomerStore(state, user, ticket)
      : worker
        ? ticket.workerId === user.id
        : true,
  );
  const visibleTicketIds = new Set(tickets.map((ticket) => ticket.id));
  const storeIds = new Set(tickets.map((ticket) => ticket.storeId));
  const clientIds = new Set(tickets.map((ticket) => ticket.clientId));
  const reviewerIds = new Set(
    tickets.map((ticket) => ticket.reviewerId || ticket.assignedBy).filter(Boolean),
  );
  const assignedWorkers = new Set(tickets.map((ticket) => ticket.workerId).filter(Boolean));
  let users: ViewUser[];
  if (user.role === 'Admin') users = state.users.map(safeUser);
  else if (customer)
    users = state.users
      .filter(
        (account) =>
          account.id === user.id || assignedWorkers.has(account.id) || reviewerIds.has(account.id),
      )
      .map((account) =>
        account.id === user.id
          ? safeUser(account)
          : { id: account.id, name: account.name, role: account.role },
      );
  else
    users = state.users
      .filter(
        (account) =>
          account.id === user.id ||
          (!worker && ['Field Worker', 'Supervisor'].includes(account.role)),
      )
      .map(safeUser);
  const reviewerOf = (ticket: Ticket) =>
    state.users.find((account) => account.id === (ticket.reviewerId || ticket.assignedBy));
  return {
    services: (state.services || []).filter(
      (service) => ['Admin', 'Supervisor'].includes(user.role) || service.active !== false,
    ),
    clients: state.clients.filter((client) =>
      customer ? ownedIds.has(client.id) : worker ? clientIds.has(client.id) : true,
    ),
    stores: state.stores
      .filter((store) =>
        customer
          ? canAccessCustomerStore(state, user, { clientId: store.clientId, storeId: store.id })
          : worker
            ? storeIds.has(store.id)
            : true,
      )
      .map(({ storeCode, ...store }) => ({
        ...store,
        hasStoreCode: Boolean(storeCode),
        ...(user.role === 'Admin' ? { storeCode } : {}),
      })),
    users,
    tickets: tickets.map(({ conversation, attachments: _attachments, ...ticket }) => ({
      ...ticket,
      conversationCount: (conversation || []).filter((entry) => entry.kind === 'message').length,
      reviewerId: ticket.reviewerId || ticket.assignedBy,
      reviewerName: ticket.reviewerName || reviewerOf(ticket)?.name,
      reviewerRole: ticket.reviewerRole || reviewerOf(ticket)?.role,
      nextFollowUpAt: nextFollowUp({ ...ticket, conversation }),
    })),
    notifications: state.notifications.filter(
      (notification) =>
        notification.userId === user.id &&
        (!customer ||
          !Object.hasOwn(user, 'managedStoreId') ||
          !notification.ticketId ||
          visibleTicketIds.has(notification.ticketId)),
    ),
    invoices: state.invoices.filter((invoice) =>
      customer
        ? Object.hasOwn(user, 'managedStoreId')
          ? visibleTicketIds.has(invoice.ticketId)
          : ownedIds.has(invoice.clientId)
        : ['Admin', 'Accounts'].includes(user.role),
    ),
  };
}

/** Check write permission before any business data is changed. UI visibility alone is insufficient. */
export function authorize(
  state: WorkspaceState,
  user: Actor | null,
  type: string,
  payload: Payload,
): void {
  if (!user) throw Error('Please log in.');
  if (isConversationAction(type)) {
    readableTicket(state, user, payload.ticketId);
    return;
  }
  if (user.role === 'Admin') return;
  const ticket = state.tickets.find((item) => item.id === payload.ticketId);
  if (type === 'read' && payload.userId === user.id) return;
  if (user.role === 'Supervisor') {
    if (type === 'service') return;
    const reviewerId = ticket?.reviewerId || ticket?.assignedBy;
    if (
      type === 'ticket' ||
      (['assign', 'close'].includes(type) && (!reviewerId || reviewerId === user.id))
    )
      return;
    if (
      type === 'user' &&
      payload.role === 'Field Worker' &&
      (!payload.id ||
        state.users.some((account) => account.id === payload.id && account.role === 'Field Worker'))
    )
      return;
  }
  if (user.role === 'Client') {
    if (
      type === 'ticket' &&
      state.stores.some(
        (store) =>
          store.id === payload.storeId &&
          canAccessCustomerStore(state, user, { clientId: store.clientId, storeId: store.id }),
      )
    )
      return;
  }
  if (user.role === 'Field Worker' && type === 'close' && ticket?.workerId === user.id) return;
  if (user.role === 'Accounts' && type === 'invoice') return;
  throw Error('You do not have permission for this action.');
}

/** Handle account actions here, then delegate business actions to actions.ts. */
export async function authenticatedAction<T extends ActionType>(
  state: WorkspaceState,
  user: Actor,
  type: T,
  payload: Payload,
  applyAction: ApplyAction,
): Promise<ActionResults[T]>;
export async function authenticatedAction(
  state: WorkspaceState,
  user: Actor,
  type: string,
  payload: Payload,
  applyAction: ApplyAction,
): Promise<unknown>;
export async function authenticatedAction(
  state: WorkspaceState,
  user: Actor,
  type: string,
  input: Payload,
  applyAction: ApplyAction,
): Promise<unknown> {
  let payload = input;
  authorize(state, user, type, payload);
  if (type === 'ticket' && user.role === 'Client') {
    if (!payload.serviceId) throw Error('Select a service from the service master.');
    payload = { ...payload, priority: payload.priority || 'Low' };
  }
  if (isConversationAction(type)) {
    const result = applyConversationAction(state, user, type, payload);
    return ['reviewer', 'resolve', 'reopen'].includes(type) && 'status' in result
      ? { id: result.id, status: result.status, reviewerId: result.reviewerId }
      : result;
  }
  if (type === 'approve') {
    const target = state.users.find(
      (u) => u.id === payload.userId && u.accountStatus === 'Pending',
    );
    if (!target) throw Error('Pending registration not found.');
    target.accountStatus = 'Active';
    state.notifications.unshift({
      id: crypto.randomUUID(),
      userId: target.id,
      text: 'Your account has been approved by Admin.',
      read: false,
      createdAt: new Date().toISOString(),
    });
    return safeUser(target);
  }
  if (type === 'user') {
    if (!isInternalRole(payload.role)) throw Error('Select an internal role.');
    const existing = payload.id
      ? state.users.find((account) => account.id === payload.id)
      : undefined;
    if (payload.id && !existing) throw Error('User not found.');
    if (existing && !isInternalRole(existing.role))
      throw Error('This account cannot be updated from the worker master.');
    if (existing && existing.role !== payload.role)
      throw Error('Role changes are not available in this master.');
    const email = validateAccount(state, payload, existing?.id);
    const result: User = existing
      ? structuredClone(existing)
      : {
          id: crypto.randomUUID(),
          name: '',
          email: '',
          role: payload.role,
          accountStatus: 'Active',
        };
    Object.assign(result, {
      name: String(payload.name).trim(),
      email,
      phone: String(payload.phone || ''),
    });
    if (!existing || payload.password) await setPassword(result, payload.password);
    if (existing) Object.assign(existing, result);
    else state.users.push(result);
    return safeUser(result);
  }
  const previousTicket = state.tickets.find((ticket) => ticket.id === payload.ticketId);
  const previousStatus = previousTicket?.status;
  const result = applyAction(state, type, payload);
  const ticketResult = ['ticket', 'assign', 'close'].includes(type) ? (result as Ticket) : null;
  if (ticketResult && type === 'ticket') recordActivity(ticketResult, user, 'Complaint raised.');
  if (ticketResult && type === 'assign') {
    if (['Admin', 'Supervisor'].includes(user.role)) {
      ticketResult.reviewerId = user.id;
      ticketResult.reviewerName = user.name;
      ticketResult.reviewerRole = user.role;
      recordActivity(ticketResult, user, `Reviewer assigned: ${user.name}`);
    }
    recordActivity(
      ticketResult,
      user,
      `Assigned to ${state.users.find((worker) => worker.id === ticketResult.workerId)?.name || 'field worker'}.`,
    );
  }
  if (ticketResult && type === 'close' && previousStatus !== 'Closed')
    recordActivity(ticketResult, user, 'Ticket closed; invoice draft available.');
  if (ticketResult && type === 'ticket') {
    ticketResult.createdBy = user.id;
    for (const account of state.users.filter(
      (account) =>
        ['Admin', 'Supervisor'].includes(account.role) && account.accountStatus === 'Active',
    )) {
      state.notifications.unshift({
        id: crypto.randomUUID(),
        userId: account.id,
        ticketId: ticketResult.id,
        text: `New service request ${ticketResult.number}: ${ticketResult.issue}`,
        read: false,
        createdAt: new Date().toISOString(),
      });
    }
  }
  if (ticketResult && type === 'assign') ticketResult.assignedBy = user.id;
  if (ticketResult && type === 'close') ticketResult.closedBy ||= user.id;
  return result;
}
