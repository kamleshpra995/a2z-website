/**
 * Email notifications for ticket changes. The API compares tickets before and after each change
 * (so every route that changes a ticket is covered the same way) and turns the differences into
 * emails here. Sending happens elsewhere, after the change is saved.
 */
import { canAccessCustomerStore } from './ownership.ts';
import { displayDate } from '../shared/dates.ts';
import {
  COMPANY,
  SUPPORT_PHONE,
  isEmail,
  statusLine,
  type TicketFacts,
} from '../shared/ticketMessages.ts';
import type { Store, Ticket, TicketStatus, User, WorkspaceState } from '../shared/types.ts';

export type TicketSnapshot = Map<string, { status: TicketStatus; workerId: string }>;

export type TicketEvent =
  | { kind: 'created'; ticketId: string }
  | { kind: 'assigned'; ticketId: string }
  | { kind: 'status'; ticketId: string; from: TicketStatus };

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailOptions {
  /** Public address of the portal, e.g. https://www.a2zpowersolution.in/portal/ */
  portalUrl?: string;
  supportEmail?: string;
}

export function snapshotTickets(state: WorkspaceState): TicketSnapshot {
  return new Map(
    state.tickets.map((ticket) => [
      ticket.id,
      { status: ticket.status, workerId: ticket.workerId },
    ]),
  );
}

/** What changed for each ticket since the snapshot. */
export function ticketEvents(before: TicketSnapshot, state: WorkspaceState): TicketEvent[] {
  const events: TicketEvent[] = [];
  for (const ticket of state.tickets) {
    const previous = before.get(ticket.id);
    if (!previous) {
      events.push({ kind: 'created', ticketId: ticket.id });
      if (ticket.workerId) events.push({ kind: 'assigned', ticketId: ticket.id });
      continue;
    }
    if (ticket.workerId && ticket.workerId !== previous.workerId)
      events.push({ kind: 'assigned', ticketId: ticket.id });
    // Pending → Assigned is already announced by the assignment email.
    const assignedOnly = previous.status === 'Pending' && ticket.status === 'Assigned';
    if (ticket.status !== previous.status && !assignedOnly)
      events.push({ kind: 'status', ticketId: ticket.id, from: previous.status });
  }
  return events;
}

const activeUser = (user: User | undefined): user is User =>
  !!user && user.accountStatus !== 'Pending' && !!user.passwordHash;

/** Customer logins that can see this ticket's store, plus the QR raiser's email if given. */
function customerRecipients(state: WorkspaceState, ticket: Ticket) {
  const recipients = state.users
    .filter(
      (user) =>
        user.role === 'Client' &&
        activeUser(user) &&
        isEmail(user.email) &&
        canAccessCustomerStore(state, user, ticket),
    )
    .map((user) => ({ email: user.email.trim(), name: user.name, hasLogin: true }));
  const raiser = ticket.raisedByContact;
  if (raiser && isEmail(raiser.contact))
    recipients.push({ email: raiser.contact.trim(), name: raiser.name, hasLogin: false });
  const seen = new Set<string>();
  return recipients.filter((item) => {
    const key = item.email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );

/** Plain text and a simple HTML version of the same lines (blank string = paragraph break). */
function compose(to: string, subject: string, lines: string[]): Email {
  const text = lines.join('\n');
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#1d2b24">${text
    .split('\n\n')
    .map(
      (block) =>
        `<p>${escape(block)
          .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
          .replace(/\n/g, '<br>')}</p>`,
    )
    .join('')}</div>`;
  return { to, subject, text, html };
}

function storeAddress(store: Store | undefined): string {
  if (!store) return '';
  return [
    store.addressLine1 || store.address,
    store.addressLine2,
    store.city,
    store.state,
    store.zip,
  ]
    .filter(Boolean)
    .join(', ');
}

/** The emails to send for these events. Each recipient gets their own message. */
export function ticketEmails(
  state: WorkspaceState,
  events: TicketEvent[],
  options: EmailOptions = {},
): Email[] {
  const emails: Email[] = [];
  const signature = [
    '',
    `— ${COMPANY}`,
    [SUPPORT_PHONE, options.supportEmail].filter(Boolean).join(' · '),
  ];
  for (const event of events) {
    const ticket = state.tickets.find((item) => item.id === event.ticketId);
    if (!ticket) continue;
    const store = state.stores.find((item) => item.id === ticket.storeId);
    const client = state.clients.find((item) => item.id === ticket.clientId);
    const worker = state.users.find((user) => user.id === ticket.workerId);
    const facts: TicketFacts = {
      number: ticket.number,
      status: ticket.status,
      service: ticket.serviceName || ticket.issue || 'Service request',
      store: store?.name || 'your store',
      client: client?.name || '',
      worker: worker ? { name: worker.name, phone: worker.phone } : null,
    };
    const details = [
      `Ticket: ${facts.number}`,
      `Service: ${facts.service}`,
      `Store: ${facts.store}${facts.client ? ` (${facts.client})` : ''}`,
      `Status: ${facts.status}`,
    ];

    if (event.kind === 'assigned' && activeUser(worker) && isEmail(worker.email)) {
      emails.push(
        compose(
          worker.email.trim(),
          `New job ${facts.number}: ${facts.service} at ${facts.store}`,
          [
            `Hello ${worker.name},`,
            '',
            `You have been assigned ticket ${facts.number}.`,
            '',
            ...details,
            `Priority: ${ticket.priority || '—'}`,
            `Due date: ${ticket.dueDate ? displayDate(ticket.dueDate) : '—'}`,
            `Address: ${storeAddress(store) || '—'}`,
            ...(store?.manager || store?.phone
              ? [`Store manager: ${[store.manager, store.phone].filter(Boolean).join(', ')}`]
              : []),
            ...(store?.contactPerson || store?.contactPhone
              ? [`Contact: ${[store.contactPerson, store.contactPhone].filter(Boolean).join(', ')}`]
              : []),
            ...(store?.mapLink ? [`Map: ${store.mapLink}`] : []),
            ...(ticket.description ? ['', `Problem: ${ticket.description}`] : []),
            ...(options.portalUrl ? ['', `Open the job in the portal: ${options.portalUrl}`] : []),
            ...signature,
          ],
        ),
      );
    }

    const headline =
      event.kind === 'created'
        ? `Ticket ${facts.number} received`
        : event.kind === 'assigned'
          ? `Technician assigned to ${facts.number}`
          : event.from === 'Resolved' || event.from === 'Closed'
            ? `Ticket ${facts.number} reopened`
            : `Ticket ${facts.number} ${facts.status.toLowerCase()}`;
    const summary =
      event.kind === 'status' && (event.from === 'Resolved' || event.from === 'Closed')
        ? 'This ticket has been reopened for follow-up. Our team will be in touch.'
        : statusLine(facts);
    for (const recipient of customerRecipients(state, ticket)) {
      emails.push(
        compose(recipient.email, `${headline} – ${facts.store}`, [
          `Hello ${recipient.name},`,
          '',
          summary,
          '',
          ...details,
          ...(event.kind === 'created' && ticket.description
            ? [`Problem: ${ticket.description}`]
            : []),
          ...(recipient.hasLogin && options.portalUrl
            ? ['', `Track this ticket: ${options.portalUrl}`]
            : []),
          ...signature,
        ]),
      );
    }
  }
  return emails;
}
