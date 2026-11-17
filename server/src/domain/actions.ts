import { clientDetails, clientNameKey } from './clients.ts';
import { locationFields } from '../shared/stores.ts';
import { validateTicketDates } from '../shared/dates.ts';
import { assignTicket, closeTicket } from './workflow.ts';
import {
  isPriority,
  type Client,
  type Invoice,
  type Payload,
  type Service,
  type Store,
  type Ticket,
  type User,
  type WorkspaceState,
} from '../shared/types.ts';

const randomUUID = () => globalThis.crypto.randomUUID();

/** Business actions handled here. Account and conversation actions are handled in auth.ts. */
export type BusinessAction =
  | 'storeCode'
  | 'archive'
  | 'restore'
  | 'service'
  | 'client'
  | 'clientStatus'
  | 'store'
  | 'user'
  | 'ticket'
  | 'assign'
  | 'close'
  | 'read'
  | 'invoice';

export interface BusinessResults {
  storeCode: Store;
  archive: Client | Store;
  restore: Client | Store;
  service: Service;
  client: Client;
  clientStatus: Client;
  store: Store;
  user: User;
  ticket: Ticket;
  assign: Ticket;
  close: Ticket;
  read: undefined;
  invoice: Invoice;
}
export type BusinessResult = BusinessResults[BusinessAction];

export type ApplyAction = (
  state: WorkspaceState,
  type: string,
  payload?: Payload,
) => BusinessResult;

const required = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw Error(`${label} is required.`);
  return value.trim();
};

const newStoreCode = () => randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();

function archiveTarget(state: WorkspaceState, entity: unknown): (Client | Store)[] | null {
  return entity === 'client' ? state.clients : entity === 'store' ? state.stores : null;
}

/** Validate a business action and mutate the loaded workspace. The storage adapter saves it. */
export function applyAction<T extends BusinessAction>(
  state: WorkspaceState,
  type: T,
  payload?: Payload,
): BusinessResults[T];
export function applyAction(state: WorkspaceState, type: string, payload?: Payload): BusinessResult;
export function applyAction(
  state: WorkspaceState,
  type: string,
  payload: Payload = {},
): BusinessResult {
  switch (type) {
    case 'storeCode': {
      const result = state.stores.find((item) => item.id === payload.id && !item.deletedAt);
      if (!result) throw Error('Store not found.');
      result.storeCode = newStoreCode();
      return result;
    }
    case 'archive': {
      const collection = archiveTarget(state, payload.entity);
      if (!collection) throw Error('Select a client or store.');
      const result = collection.find((item) => item.id === payload.id);
      if (!result) throw Error('Record not found.');
      result.deletedAt = new Date().toISOString();
      return result;
    }
    case 'restore': {
      const result = archiveTarget(state, payload.entity)?.find((item) => item.id === payload.id);
      if (!result) throw Error('Record not found.');
      result.deletedAt = null;
      return result;
    }
    case 'service': {
      const services = (state.services ??= []);
      const current = payload.id
        ? services.find((service) => service.id === payload.id)
        : undefined;
      if (payload.id && !current) throw Error('Service not found.');
      const name = required(payload.name, 'Service name');
      if (
        services.some(
          (service) =>
            service.id !== payload.id && service.name.toLowerCase() === name.toLowerCase(),
        )
      )
        throw Error('Service name already exists.');
      const result: Service = {
        id: current?.id || randomUUID(),
        name,
        description: String(payload.description || ''),
        active: payload.active !== false,
      };
      if (current) Object.assign(current, result);
      else services.push(result);
      return result;
    }
    case 'client': {
      const name = required(payload.name, 'Client name');
      if (
        state.clients.some(
          (c) => clientNameKey(c.name) === clientNameKey(name) && c.id !== payload.id,
        )
      )
        throw Error('Client already exists.');
      const current = payload.id ? state.clients.find((c) => c.id === payload.id) : undefined;
      if (payload.id && !current) throw Error('Client not found.');
      const result: Client = {
        id: current?.id || randomUUID(),
        name,
        ...clientDetails(payload, current || {}),
        active: payload.active === undefined ? current?.active !== false : payload.active === true,
        contact: String(payload.contact || ''),
        email: String(payload.email || ''),
        phone: String(payload.phone || ''),
        address: String(payload.address || ''),
      };
      if (current) Object.assign(current, result);
      else state.clients.push(result);
      return result;
    }
    case 'clientStatus': {
      const result = state.clients.find((client) => client.id === payload.id);
      if (!result) throw Error('Client not found.');
      if (typeof payload.active !== 'boolean')
        throw Error('Client status must be Active or Inactive.');
      result.active = payload.active;
      result.statusUpdatedAt = new Date().toISOString();
      return result;
    }
    case 'store': {
      const current = payload.id
        ? state.stores.find((store) => store.id === payload.id)
        : undefined;
      if (payload.id && !current) throw Error('Store not found.');
      if (current?.deletedAt) throw Error('Restore this store before editing it.');
      const selectedClient = state.clients.find((client) => client.id === payload.clientId);
      if (!selectedClient) throw Error('Select a client.');
      if (
        (selectedClient.deletedAt || selectedClient.active === false) &&
        (!current || current.clientId !== payload.clientId)
      )
        throw Error('Enable this client before adding a store.');
      if (
        current &&
        current.clientId !== payload.clientId &&
        state.tickets.some((ticket) => ticket.storeId === current.id)
      )
        throw Error('A store with service history cannot be moved to another client.');
      if (payload.image) clientDetails({ image: payload.image });
      const name = required(payload.name, 'Store name');
      if (
        state.stores.some(
          (store) =>
            store.clientId === payload.clientId &&
            store.id !== payload.id &&
            store.name.toLowerCase() === name.toLowerCase(),
        )
      )
        throw Error('This store name already exists for the selected client.');
      const result: Store = {
        id: current?.id || randomUUID(),
        clientId: selectedClient.id,
        storeCode: current?.storeCode || newStoreCode(),
        name,
        manager: required(payload.manager, 'Store manager'),
        phone: String(payload.phone || ''),
        ...locationFields(payload, current),
        image: String(payload.image ?? current?.image ?? ''),
      };
      if (current) Object.assign(current, result);
      else state.stores.push(result);
      return result;
    }
    case 'user': {
      if (
        typeof payload.role !== 'string' ||
        !['Admin', 'Supervisor', 'Field Worker', 'Accounts'].includes(payload.role)
      )
        throw Error('Select a role.');
      const result: User = {
        id: randomUUID(),
        name: required(payload.name, 'User name'),
        role: payload.role as User['role'],
        email: String(payload.email || ''),
        phone: String(payload.phone || ''),
      };
      state.users.push(result);
      return result;
    }
    case 'ticket': {
      const store = state.stores.find((s) => s.id === payload.storeId);
      if (!store || store.deletedAt || store.active === false)
        throw Error('Select an active store.');
      if (
        state.clients.some(
          (client) => client.id === store.clientId && (client.deletedAt || client.active === false),
        )
      )
        throw Error(
          'This client is inactive. New complaints cannot be raised until Admin enables it.',
        );
      const service = payload.serviceId
        ? (state.services || []).find(
            (item) => item.id === payload.serviceId && item.active !== false,
          )
        : undefined;
      if (payload.serviceId && !service) throw Error('Select an active service from the master.');
      const next =
        state.tickets.reduce(
          (max, ticket) => Math.max(max, Number(ticket.number?.match(/^A2Z-(\d+)$/)?.[1]) || 0),
          0,
        ) + 1;
      const now = new Date().toISOString();
      const result: Ticket = {
        id: randomUUID(),
        number: `A2Z-${String(next).padStart(4, '0')}`,
        ...validateTicketDates(payload),
        clientId: store.clientId,
        storeId: store.id,
        issue: service?.name || required(payload.issue, 'Issue'),
        serviceId: service?.id || null,
        serviceName: service?.name || null,
        description: String(payload.description || ''),
        priority: isPriority(payload.priority) ? payload.priority : 'Low',
        status: 'Pending',
        workerId: '',
        createdAt: now,
        updatedAt: now,
      };
      state.tickets.unshift(result);
      return result;
    }
    case 'assign':
      return assignTicket(state, payload.ticketId, payload.workerId);
    case 'close':
      return closeTicket(state, payload.ticketId);
    case 'read':
      state.notifications
        .filter(
          (n) =>
            n.userId === payload.userId &&
            (!payload.notificationId || n.id === payload.notificationId),
        )
        .forEach((n) => (n.read = true));
      return undefined;
    case 'invoice': {
      const result = state.invoices.find((i) => i.id === payload.id);
      if (!result) throw Error('Invoice not found.');
      const amount = Number(payload.amount);
      if (!Number.isFinite(amount) || amount < 0 || payload.amount === '')
        throw Error('Enter a valid amount.');
      result.amount = amount;
      result.description = required(payload.description, 'Description');
      return result;
    }
    default:
      throw Error('Unknown action.');
  }
}
