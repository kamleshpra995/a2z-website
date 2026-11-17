import { canAccessCustomerStore } from './ownership.ts';
import type { Ticket, WorkspaceState } from '../shared/types.ts';

const randomUUID = () => globalThis.crypto.randomUUID();
type WorkflowState = Pick<
  WorkspaceState,
  'tickets' | 'users' | 'notifications' | 'invoices' | 'clients' | 'stores'
>;

/** Assignment updates the ticket and creates an in-app notification for the selected worker. */
export function assignTicket(state: WorkflowState, ticketId: unknown, workerId: unknown): Ticket {
  const ticket = state.tickets.find((t) => t.id === ticketId);
  const worker = state.users.find((u) => u.id === workerId && u.role === 'Field Worker');
  if (!ticket || !worker) throw Error('Select a valid ticket and field worker.');
  if (['Resolved', 'Closed'].includes(ticket.status))
    throw Error('Reopen the resolved/closed ticket before assigning it.');
  ticket.workerId = worker.id;
  ticket.status = 'Assigned';
  state.notifications.unshift({
    id: randomUUID(),
    userId: worker.id,
    ticketId: ticket.id,
    text: `${ticket.number} assigned to you: ${ticket.issue}`,
    read: false,
    createdAt: new Date().toISOString(),
  });
  for (const customer of state.users.filter(
    (user) =>
      user.role === 'Client' &&
      canAccessCustomerStore(state, user, ticket) &&
      user.accountStatus === 'Active',
  )) {
    state.notifications.unshift({
      id: randomUUID(),
      userId: customer.id,
      ticketId: ticket.id,
      text: `${ticket.number}: a field worker has been assigned to your request.`,
      read: false,
      createdAt: new Date().toISOString(),
    });
  }
  return ticket;
}

/** Closing an assigned job creates one invoice draft; repeated close calls do not duplicate it. */
export function closeTicket(state: WorkflowState, ticketId: unknown): Ticket {
  const ticket = state.tickets.find((t) => t.id === ticketId);
  if (!ticket) throw Error('Ticket not found.');
  if (!ticket.workerId) throw Error('Assign a field worker before closing the ticket.');
  if (ticket.status === 'Closed') return ticket;
  ticket.status = 'Closed';
  const closedAt = new Date().toISOString();
  ticket.closedAt = closedAt;
  if (!state.invoices.some((invoice) => invoice.ticketId === ticket.id))
    state.invoices.unshift({
      id: randomUUID(),
      number: `DRAFT-${ticket.number}`,
      ticketId: ticket.id,
      clientId: ticket.clientId,
      storeId: ticket.storeId,
      status: 'Draft',
      description: ticket.issue,
      amount: '',
      createdAt: closedAt,
    });
  for (const customer of state.users.filter(
    (user) =>
      user.role === 'Client' &&
      canAccessCustomerStore(state, user, ticket) &&
      user.accountStatus === 'Active',
  )) {
    state.notifications.unshift({
      id: randomUUID(),
      userId: customer.id,
      ticketId: ticket.id,
      text: `${ticket.number} is closed. Your invoice draft is ready to view.`,
      read: false,
      createdAt: new Date().toISOString(),
    });
  }
  return ticket;
}
