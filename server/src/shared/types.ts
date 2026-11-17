/**
 * Domain types shared by the server and the webapp (imported there as `@shared/types.ts`).
 * This folder must stay browser-safe: no Node.js imports.
 */

export type Role = 'Admin' | 'Supervisor' | 'Field Worker' | 'Accounts' | 'Client';
export type InternalRole = 'Supervisor' | 'Field Worker' | 'Accounts';
export type AccountStatus = 'Active' | 'Pending';
export type TicketStatus = 'Pending' | 'Assigned' | 'Resolved' | 'Closed';
export type Priority = 'Low' | 'Medium' | 'High';
export type Channel = 'Ticket' | 'Phone' | 'WhatsApp' | 'Email' | 'Site visit';

export const ROLES: readonly Role[] = ['Admin', 'Supervisor', 'Field Worker', 'Accounts', 'Client'];
export const INTERNAL_ROLES: readonly InternalRole[] = ['Supervisor', 'Field Worker', 'Accounts'];
export const TICKET_STATUSES: readonly TicketStatus[] = [
  'Pending',
  'Assigned',
  'Resolved',
  'Closed',
];
export const PRIORITIES: readonly Priority[] = ['Low', 'Medium', 'High'];
export const CHANNELS: readonly Channel[] = ['Ticket', 'Phone', 'WhatsApp', 'Email', 'Site visit'];

/** Untrusted request body. Domain functions validate every field they read. */
export type Payload = Record<string, unknown>;

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  accountStatus?: AccountStatus;
  /** Company membership for Customer accounts. */
  clientId?: string;
  /** Narrows a Customer account to one store. `null` means a store manager without a store. */
  managedStoreId?: string | null;
  createdAt?: string;
  passwordHash?: string;
  passwordSalt?: string;
}

/** A user as returned to callers: credential fields are never included. */
export type PublicUser = Omit<User, 'passwordHash' | 'passwordSalt'>;

/** Minimal identity snapshot stored with history entries. */
export interface Person {
  id: string;
  name: string;
  role: Role;
}

/** The signed-in account performing an action (also used for public QR guests). */
export interface Actor extends Person {
  email?: string;
  accountStatus?: AccountStatus;
  clientId?: string;
  managedStoreId?: string | null;
}

/** Users visible to the current viewer. Customers only receive names and roles of other users. */
export type ViewUser = Person & Partial<Omit<PublicUser, 'id' | 'name' | 'role'>>;

export interface Client {
  id: string;
  name: string;
  contact?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  addedOn?: string;
  image?: string;
  city?: string;
  state?: string;
  active?: boolean;
  ownerUserId?: string;
  statusUpdatedAt?: string;
  deletedAt?: string | null;
}

export interface StoreLocation {
  city: string;
  state: string;
  zip: string;
  registeredOn: string;
  active: boolean;
  address: string;
  addressLine1: string;
  addressLine2: string;
  contactPerson: string;
  contactPhone: string;
  mapLink: string;
  latitude: number | null;
  longitude: number | null;
}

export interface Store extends Partial<StoreLocation> {
  id: string;
  clientId: string;
  name: string;
  manager?: string;
  phone?: string;
  storeCode?: string;
  image?: string;
  deletedAt?: string | null;
}

/** A store as returned to callers: only Admin receives the Store Code itself. */
export interface StoreView extends Omit<Store, 'storeCode'> {
  storeCode?: string;
  hasStoreCode: boolean;
}

export interface Service {
  id: string;
  name: string;
  description?: string;
  active?: boolean;
}

export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  /** Server-only relative path. Never returned to the browser. */
  storagePath?: string;
  createdBy: string;
  createdAt: string;
}

export interface PublicAttachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  createdBy: string;
  createdAt: string;
  url: string;
}

export interface Contact {
  key: string;
  userId?: string;
  name: string;
  role: string;
  phone: string;
  storeId: string;
}

export interface Revision {
  text: string;
  contact?: Contact | null;
  channel?: Channel;
  occurredAt?: string;
  nextFollowUpAt?: string | null;
  editedAt: string;
  editedBy: Person;
}

export interface ConversationEntry {
  id: string;
  kind: 'activity' | 'message';
  text: string;
  author: Person;
  createdAt: string;
  storeId: string;
  clientId: string;
  channel?: Channel;
  occurredAt?: string;
  nextFollowUpAt?: string | null;
  followUpCompletedAt?: string | null;
  contact?: Contact | null;
  attachmentIds?: string[];
  revisions?: Revision[];
  editedAt?: string;
  editedBy?: Person;
  messageId?: string;
  reviewer?: Person;
}

export interface ConversationMessage extends ConversationEntry {
  attachments: PublicAttachment[];
}

export interface Ticket {
  id: string;
  number: string;
  raisedOn: string;
  dueDate: string;
  clientId: string;
  storeId: string;
  issue: string;
  serviceId: string | null;
  serviceName: string | null;
  description: string;
  priority: Priority;
  status: TicketStatus;
  workerId: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  assignedBy?: string;
  reviewerId?: string;
  reviewerName?: string;
  reviewerRole?: Role;
  closedAt?: string;
  closedBy?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  source?: string;
  raisedByContact?: { name: string; contact: string };
  conversation?: ConversationEntry[];
  attachments?: Attachment[];
}

/** Ticket list entry: history and files are loaded separately per ticket. */
export interface TicketSummary extends Omit<Ticket, 'conversation' | 'attachments'> {
  conversationCount: number;
  nextFollowUpAt: string | null;
}

export interface Invoice {
  id: string;
  number: string;
  ticketId: string;
  clientId: string;
  storeId: string;
  status: 'Draft';
  description: string;
  amount: number | '';
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  ticketId?: string;
  text: string;
  read: boolean;
  createdAt: string;
}

export interface Session {
  hash: string;
  userId: string;
  expiresAt: number;
}

export interface PublicGrant {
  hash: string;
  storeId: string;
  codeHash: string;
  expiresAt: number;
}

/** The complete business workspace as held by the storage adapter. */
export interface WorkspaceState {
  clients: Client[];
  services: Service[];
  stores: Store[];
  users: User[];
  tickets: Ticket[];
  notifications: Notification[];
  invoices: Invoice[];
  sessions?: Session[];
  publicGrants?: PublicGrant[];
  browserImport?: { digest: string; importedAt: string };
}

/** The role-filtered snapshot sent to the webapp. */
export interface WorkspaceView {
  services: Service[];
  clients: Client[];
  stores: StoreView[];
  users: ViewUser[];
  tickets: TicketSummary[];
  notifications: Notification[];
  invoices: Invoice[];
  storage?: string;
  currentUser?: PublicUser;
}

export interface ConversationPermissions {
  canComment: boolean;
  canTakeReview: boolean;
  canManageReviewer: boolean;
  canResolve: boolean;
  canReopen: boolean;
  canClose: boolean;
}

export interface ConversationSnapshot {
  ticket: {
    id: string;
    number: string;
    status: TicketStatus;
    storeId: string;
    clientId: string;
    reviewer: Person | null;
    nextFollowUpAt: string | null;
  };
  messages: ConversationMessage[];
  contacts: Contact[];
  reviewers: Person[];
  permissions: ConversationPermissions;
}

export interface TicketStatusResult {
  id: string;
  status: TicketStatus;
  reviewerId?: string;
}

/** The value each `/api/action` type returns as `result`. */
export interface ActionResults {
  storeCode: Store;
  archive: Client | Store;
  restore: Client | Store;
  service: Service;
  client: Client;
  clientStatus: Client;
  store: Store;
  user: PublicUser;
  approve: PublicUser;
  ticket: Ticket;
  assign: Ticket;
  close: Ticket;
  read: undefined;
  invoice: Invoice;
  comment: ConversationEntry;
  editComment: ConversationEntry;
  followupDone: ConversationEntry;
  reviewer: TicketStatusResult;
  resolve: TicketStatusResult;
  reopen: TicketStatusResult;
}

export type ActionType = keyof ActionResults;

export interface SessionInfo {
  user: PublicUser | null;
  mode: string;
  needsSetup: boolean;
}

export interface FileUpload {
  name: string;
  base64: string;
}

export interface VerifiedStore {
  token: string;
  expiresIn: number;
  store: {
    id: string;
    name: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    zip?: string;
    manager?: string;
    phone?: string;
    contactPerson?: string;
    contactPhone?: string;
    mapLink?: string;
    latitude?: number | null;
    longitude?: number | null;
    active: boolean;
    registeredOn?: string;
  };
  client: { name: string };
  services: { id: string; name: string }[];
}

export interface PublicTicketReceipt {
  number: string;
  status: TicketStatus;
}

export const isRole = (value: unknown): value is Role => ROLES.includes(value as Role);
export const isInternalRole = (value: unknown): value is InternalRole =>
  INTERNAL_ROLES.includes(value as InternalRole);
export const isPriority = (value: unknown): value is Priority =>
  PRIORITIES.includes(value as Priority);
export const isChannel = (value: unknown): value is Channel => CHANNELS.includes(value as Channel);

/** Narrow an unknown error to a message string. */
export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
