import { createHash } from 'node:crypto';
import { normalizeEmail } from '../domain/auth.ts';
import { clientDetails, clientNameKey } from '../domain/clients.ts';
import { locationFields } from '../shared/stores.ts';
import { validateAttachment } from '../shared/attachmentValidation.ts';
import type { AttachmentStore } from '../storage/attachments.ts';
import type {
  Attachment,
  Client,
  FileUpload,
  Invoice,
  Notification,
  Service,
  Store,
  Ticket,
  User,
  WorkspaceState,
} from '../shared/types.ts';

const entities = [
  'clients',
  'stores',
  'services',
  'users',
  'tickets',
  'invoices',
  'notifications',
] as const;
type Entity = (typeof entities)[number];

/** Records as read from an untrusted export file, before validation. */
type Row = Record<string, unknown> & { id: string };

export interface ImportData {
  clients: Client[];
  stores: Store[];
  services: Service[];
  users: User[];
  tickets: Ticket[];
  invoices: Invoice[];
  notifications: Notification[];
}
export interface ImportPlan {
  data: ImportData;
  files: { ticket: Ticket; legacy: Attachment; input: FileUpload }[];
  digest: string;
}

function unique<T>(
  records: readonly T[],
  key: (record: T) => unknown,
  label: string,
): Set<unknown> {
  const seen = new Set<unknown>();
  for (const record of records) {
    const value = key(record);
    if (!value || seen.has(value)) throw Error(`Invalid or duplicate ${label}.`);
    seen.add(value);
  }
  return seen;
}

/** Only import into an empty business workspace. IDs and references survive the cutover. */
export function planBrowserImport(target: WorkspaceState, raw: string): ImportPlan | null {
  const digest = createHash('sha256').update(raw).digest('hex');
  if (target.browserImport?.digest === digest) return null;
  if (
    entities.some((key) =>
      (target[key] as { role?: string }[] | undefined)?.some(
        (row) => key !== 'users' || row.role !== 'Admin',
      ),
    ) ||
    target.browserImport
  )
    throw Error(
      'Import requires a workspace with no business records or non-Admin accounts. Existing data was not changed.',
    );
  const admin = target.users.find((user) => user.role === 'Admin' && user.passwordHash);
  if (!admin) throw Error('Start the server once to configure its Admin before importing.');
  const bundle = JSON.parse(raw) as {
    format?: unknown;
    state?: Partial<Record<Entity, unknown>>;
    files?: unknown;
  };
  if (bundle.format !== 'a2z-browser-v1' || !bundle.state || !Array.isArray(bundle.files))
    throw Error('Invalid browser export.');
  const state = bundle.state;
  const rows = {} as Record<Entity, Row[]>;
  for (const key of entities) {
    const list = state[key] ?? (key === 'services' ? [] : null);
    if (!Array.isArray(list)) throw Error(`Missing ${key} records.`);
    unique(
      list as Row[],
      (row) => typeof row?.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(row.id) && row.id,
      `${key} ID`,
    );
    rows[key] = list as Row[];
  }
  const data = rows as unknown as ImportData;
  const sourceAdmins = new Set(
    data.users.filter((user) => user.role === 'Admin').map((user) => user.id),
  );
  const userId = (id: string) => (sourceAdmins.has(id) ? admin.id : id);
  data.users = data.users
    .filter((user) => user.role !== 'Admin')
    .map((user) => {
      if (
        !['Client', 'Supervisor', 'Field Worker', 'Accounts'].includes(user.role) ||
        !['Active', 'Pending'].includes(user.accountStatus ?? '')
      )
        throw Error('Invalid imported user role/status.');
      const { id, name, email, role, accountStatus, phone, clientId, createdAt } = user;
      if (
        typeof name !== 'string' ||
        !name.trim() ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email))
      )
        throw Error('Invalid imported account.');
      return {
        id,
        name,
        email: normalizeEmail(email),
        role,
        accountStatus,
        phone,
        clientId,
        createdAt,
      };
    });
  unique([...target.users, ...data.users], (user) => user.id, 'user ID');
  unique([...target.users, ...data.users], (user) => normalizeEmail(user.email), 'account email');
  const clientIds = new Set(data.clients.map((row) => row.id));
  const stores = new Map(data.stores.map((row) => [row.id, row]));
  const tickets = new Map(data.tickets.map((row) => [row.id, row]));
  const services = new Set(data.services.map((row) => row.id));
  unique(data.clients, (row) => clientNameKey(row.name), 'client name');
  unique(
    data.stores,
    (row) => row.name && `${row.clientId}:${clientNameKey(row.name)}`,
    'store name',
  );
  unique(data.services, (row) => clientNameKey(row.name), 'service name');
  unique(data.tickets, (row) => /^A2Z-\d+$/.test(row.number) && row.number, 'ticket number');
  unique(data.invoices, (row) => row.ticketId, 'invoice ticket');
  for (const row of data.clients) {
    Object.assign(row, clientDetails(row));
    if (row.ownerUserId) row.ownerUserId = userId(row.ownerUserId);
  }
  for (const row of data.users)
    if (row.role === 'Client' && !clientIds.has(row.clientId ?? ''))
      throw Error('Imported customer has no linked client.');
  for (const row of data.stores) {
    if (!clientIds.has(row.clientId)) throw Error('Imported store has no linked client.');
    Object.assign(row, locationFields(row));
    if (row.image) clientDetails({ image: row.image });
    if (row.storeCode && !/^[0-9A-F]{10}$/.test(row.storeCode))
      throw Error('Invalid imported Store Code.');
  }
  const bundleFiles = bundle.files as { id: string; base64: string }[];
  const blobs = new Map(bundleFiles.map((file) => [file.id, file.base64]));
  if (blobs.size !== bundleFiles.length) throw Error('Duplicate attachment file ID.');
  const files: ImportPlan['files'] = [];
  for (const row of data.tickets) {
    if (
      stores.get(row.storeId)?.clientId !== row.clientId ||
      (row.serviceId && !services.has(row.serviceId))
    )
      throw Error('Imported ticket has invalid store or service references.');
    if (
      !['Pending', 'Assigned', 'Resolved', 'Closed'].includes(row.status) ||
      !['Low', 'Medium', 'High'].includes(row.priority)
    )
      throw Error('Invalid imported ticket status or priority.');
    for (const key of [
      'workerId',
      'reviewerId',
      'assignedBy',
      'closedBy',
      'resolvedBy',
      'createdBy',
    ] as const) {
      const value = row[key];
      if (value) row[key] = userId(value);
    }
    const attachments = row.attachments || [];
    const ids = unique(attachments, (file) => file.id, 'ticket attachment ID');
    for (const entry of row.conversation || []) {
      if (entry.author?.id) entry.author.id = userId(entry.author.id);
      if ((entry.attachmentIds || []).some((id) => !ids.has(id)))
        throw Error('Conversation references an unknown attachment.');
    }
    for (const file of attachments) {
      const input = { name: file.name, base64: blobs.get(file.id) ?? '' };
      validateAttachment(input);
      files.push({ ticket: row, legacy: { ...file, createdBy: userId(file.createdBy) }, input });
    }
    row.attachments = [];
  }
  for (const row of data.invoices) {
    const ticket = tickets.get(row.ticketId);
    if (!ticket || ticket.clientId !== row.clientId)
      throw Error('Imported invoice has no matching ticket.');
  }
  for (const row of data.notifications) row.userId = userId(row.userId);
  return { data, files, digest };
}

export async function applyBrowserImport(
  target: WorkspaceState,
  plan: ImportPlan,
  attachmentStore: Pick<AttachmentStore, 'save'>,
  saved: Attachment[],
): Promise<void> {
  const remaps = new Map<string, Map<string, string>>();
  for (const { ticket, legacy, input } of plan.files) {
    const file = await attachmentStore.save(ticket.id, input, legacy.createdBy);
    saved.push(file);
    (ticket.attachments ??= []).push({ ...file, createdAt: legacy.createdAt || file.createdAt });
    if (!remaps.has(ticket.id)) remaps.set(ticket.id, new Map());
    remaps.get(ticket.id)!.set(legacy.id, file.id);
  }
  for (const ticket of plan.data.tickets)
    for (const entry of ticket.conversation || [])
      if (entry.attachmentIds)
        entry.attachmentIds = entry.attachmentIds.map(
          (id) => remaps.get(ticket.id)?.get(id) as string,
        );
  Object.assign(target, plan.data, {
    users: [...target.users, ...plan.data.users],
    browserImport: { digest: plan.digest, importedAt: new Date().toISOString() },
  });
}
