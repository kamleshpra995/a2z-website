import type { Client, Store, TicketStatus } from '@shared/types.ts';

export interface WorkspaceIndexInput {
  clients: readonly Pick<Client, 'id' | 'name'>[];
  stores: readonly (Pick<Store, 'id' | 'clientId' | 'name'> & { deletedAt?: string | null })[];
  users: readonly { id: string; name: string }[];
  tickets: readonly { status: TicketStatus; workerId?: string }[];
}

export interface WorkspaceIndex {
  clientNames: Map<string, string>;
  storeNames: Map<string, string>;
  userNames: Map<string, string>;
  storeCounts: Map<string, number>;
  assignedCounts: Map<string, number>;
}

/** Build once per workspace snapshot, instead of searching full arrays for every table cell. */
export function indexWorkspace(data: WorkspaceIndexInput): WorkspaceIndex {
  const clientNames = new Map(data.clients.map((client) => [client.id, client.name]));
  const storeNames = new Map(data.stores.map((store) => [store.id, store.name]));
  const userNames = new Map(data.users.map((user) => [user.id, user.name]));
  const storeCounts = new Map<string, number>();
  const assignedCounts = new Map<string, number>();
  for (const store of data.stores)
    if (!store.deletedAt)
      storeCounts.set(store.clientId, (storeCounts.get(store.clientId) || 0) + 1);
  for (const ticket of data.tickets)
    if (ticket.status === 'Assigned' && ticket.workerId)
      assignedCounts.set(ticket.workerId, (assignedCounts.get(ticket.workerId) || 0) + 1);
  return { clientNames, storeNames, userNames, storeCounts, assignedCounts };
}
