import type {
  ActionResults,
  ActionType,
  FileUpload,
  Payload,
  Priority,
  Role,
  TicketStatus,
} from '@shared/types.ts';
import type { Page } from '@shared/dashboard.ts';
import type { TicketFilter } from '@shared/tickets.ts';

export type ModalType =
  | 'service'
  | 'client'
  | 'store'
  | 'storeQr'
  | 'user'
  | 'ticket'
  | 'assign'
  | 'close'
  | 'invoice'
  | 'detail';

/**
 * Values edited in the workspace dialogs. One shape serves every dialog because a dialog opens
 * pre-filled with the record it edits (a ticket, store, client, user, service or invoice).
 */
export interface FormState {
  id?: string;
  name?: string;
  description?: string;
  active?: boolean;
  // Client
  contact?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  addedOn?: string;
  image?: string;
  // Store
  clientId?: string;
  storeCode?: string;
  hasStoreCode?: boolean;
  addressLine1?: string;
  addressLine2?: string;
  zip?: string;
  registeredOn?: string;
  manager?: string;
  contactPerson?: string;
  contactPhone?: string;
  mapLink?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  // User
  role?: Role;
  password?: string;
  accountStatus?: string;
  returnTicketId?: string;
  /** Customer login limited to one store; empty means all stores of the client. */
  managedStoreId?: string | null;
  // Ticket
  number?: string;
  storeId?: string;
  serviceId?: string | null;
  issue?: string;
  priority?: Priority;
  status?: TicketStatus | 'Draft';
  raisedOn?: string;
  dueDate?: string;
  createdAt?: string;
  workerId?: string;
  reviewerId?: string;
  raisedByContact?: { name: string; contact: string };
  images?: FileUpload[];
  focusConversation?: boolean;
  // Assign / close
  ticketId?: string;
  // Invoice
  amount?: number | string;
}

export type OpenDialog = (type: ModalType, initial?: FormState) => void;

/** Run a workspace action, refresh, and show a toast. Resolves to whether it succeeded. */
export type RunAction = <T extends ActionType>(
  type: T,
  payload: Payload,
  message?: string,
) => Promise<boolean>;

export type ActionResponse<T extends ActionType> = { ok: true; result: ActionResults[T] };

export type Navigate = (page: Page, filter?: TicketFilter) => void;

/** Name lookups resolved from the current workspace snapshot. */
export type NameLookup = (id: string | null | undefined) => string;

/** Payloads are plain records; dialogs submit their form state as-is. */
export const asPayload = (value: object): Payload => ({ ...value }) as Payload;
