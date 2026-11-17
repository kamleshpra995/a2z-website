import type { TicketStatus } from './types.ts';

export type TicketFilter = 'All' | 'Open' | TicketStatus;
export type TicketCounts = Record<TicketFilter, number>;

/** Count statuses in one pass. Inputs are never mutated. */
export function summarizeTickets(tickets: readonly { status: TicketStatus }[]): TicketCounts {
  const counts: TicketCounts = {
    All: tickets.length,
    Open: 0,
    Pending: 0,
    Assigned: 0,
    Resolved: 0,
    Closed: 0,
  };
  for (const ticket of tickets) {
    if (!['Resolved', 'Closed'].includes(ticket.status)) counts.Open++;
    if (['Pending', 'Assigned', 'Resolved', 'Closed'].includes(ticket.status))
      counts[ticket.status]++;
  }
  return counts;
}
