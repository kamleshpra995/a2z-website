import { canAccessCustomerStore } from './ownership.ts';
import {
  isChannel,
  type Actor,
  type Attachment,
  type Contact,
  type ConversationEntry,
  type ConversationPermissions,
  type ConversationSnapshot,
  type Payload,
  type Person,
  type PublicAttachment,
  type Ticket,
  type WorkspaceState,
} from '../shared/types.ts';

const uuid = () => crypto.randomUUID();

export const CONVERSATION_ACTIONS = [
  'comment',
  'editComment',
  'reviewer',
  'resolve',
  'reopen',
  'followupDone',
] as const;
export type ConversationAction = (typeof CONVERSATION_ACTIONS)[number];
export const isConversationAction = (type: string): type is ConversationAction =>
  (CONVERSATION_ACTIONS as readonly string[]).includes(type);

export function readableTicket(
  state: WorkspaceState,
  user: Actor | null,
  ticketId: unknown,
): Ticket {
  const ticket = state.tickets.find((item) => item.id === ticketId);
  if (!ticket) throw Error('Ticket not found.');
  if (
    !user ||
    (user.role === 'Client' && !canAccessCustomerStore(state, user, ticket)) ||
    (user.role === 'Field Worker' && ticket.workerId !== user.id)
  )
    throw Error('You do not have access to this ticket.');
  return ticket;
}

export const isActiveTicket = (ticket: Pick<Ticket, 'status'>): boolean =>
  !['Resolved', 'Closed'].includes(ticket.status);

const person = (user: Person): Person => ({ id: user.id, name: user.name, role: user.role });

export function conversationPermissions(user: Actor, ticket: Ticket): ConversationPermissions {
  const reviewerId = ticket.reviewerId || ticket.assignedBy;
  const staff =
    user.role === 'Admin' ||
    (user.role === 'Supervisor' && (!reviewerId || reviewerId === user.id));
  const contributor =
    staff ||
    user.role === 'Client' ||
    (user.role === 'Field Worker' && ticket.workerId === user.id);
  return {
    canComment: isActiveTicket(ticket) && contributor,
    canTakeReview: user.role === 'Supervisor' && !reviewerId && isActiveTicket(ticket),
    canManageReviewer: user.role === 'Admin' && isActiveTicket(ticket),
    canResolve:
      isActiveTicket(ticket) && !!ticket.workerId && (staff || user.role === 'Field Worker'),
    canReopen: !isActiveTicket(ticket) && staff,
    canClose: staff && !!ticket.workerId && ticket.status !== 'Closed',
  };
}

export function recordActivity(
  ticket: Ticket,
  user: Person,
  text: string,
  details: Partial<ConversationEntry> = {},
): void {
  ticket.updatedAt = new Date().toISOString();
  (ticket.conversation ??= []).push({
    id: uuid(),
    kind: 'activity',
    text,
    author: person(user),
    createdAt: new Date().toISOString(),
    storeId: ticket.storeId,
    clientId: ticket.clientId,
    ...details,
  });
}

export function contactsForTicket(state: WorkspaceState, ticket: Ticket): Contact[] {
  const contacts: Contact[] = [];
  const store = state.stores.find((item) => item.id === ticket.storeId);
  const client = state.clients.find((item) => item.id === ticket.clientId);
  for (const user of state.users.filter(
    (item) =>
      item.id === ticket.workerId ||
      item.id === (ticket.reviewerId || ticket.assignedBy) ||
      (item.role === 'Client' && canAccessCustomerStore(state, item, ticket)),
  ))
    contacts.push({
      key: `user:${user.id}`,
      userId: user.id,
      name: user.name,
      role: user.role,
      phone: user.phone || '',
      storeId: ticket.storeId,
    });
  if (store?.manager)
    contacts.push({
      key: `store:${store.id}:manager`,
      name: store.manager,
      role: 'Store Manager',
      phone: store.phone || '',
      storeId: store.id,
    });
  if (store?.contactPerson)
    contacts.push({
      key: `store:${store.id}:contact`,
      name: store.contactPerson,
      role: 'Store Contact Person',
      phone: store.contactPhone || '',
      storeId: store.id,
    });
  if (client?.contact)
    contacts.push({
      key: `client:${client.id}:contact`,
      name: client.contact,
      role: 'Client Contact',
      phone: client.phone || '',
      storeId: ticket.storeId,
    });
  return contacts;
}

export function publicAttachment(ticketId: string, file: Attachment): PublicAttachment {
  return {
    id: file.id,
    name: file.name,
    mime: file.mime,
    size: file.size,
    createdBy: file.createdBy,
    createdAt: file.createdAt,
    url: `/api/tickets/${encodeURIComponent(ticketId)}/attachments/${encodeURIComponent(file.id)}`,
  };
}

export function nextFollowUp(ticket: Pick<Ticket, 'status' | 'conversation'>): string | null {
  if (!isActiveTicket(ticket)) return null;
  return (
    (ticket.conversation || [])
      .filter(
        (entry) => entry.kind === 'message' && entry.nextFollowUpAt && !entry.followUpCompletedAt,
      )
      .map((entry) => entry.nextFollowUpAt as string)
      .sort()[0] || null
  );
}

export function getConversation(
  state: WorkspaceState,
  user: Actor,
  ticketId: unknown,
): ConversationSnapshot {
  const ticket = readableTicket(state, user, ticketId);
  const messages = (ticket.conversation || []).map((entry) => ({
    ...entry,
    attachments: (entry.attachmentIds || [])
      .map((id) => (ticket.attachments || []).find((file) => file.id === id))
      .filter((file): file is Attachment => Boolean(file))
      .map((file) => publicAttachment(ticket.id, file)),
  }));
  const reviewer = state.users.find(
    (account) => account.id === (ticket.reviewerId || ticket.assignedBy),
  );
  const due =
    messages
      .filter((entry) => entry.nextFollowUpAt && !entry.followUpCompletedAt)
      .map((entry) => entry.nextFollowUpAt as string)
      .sort()[0] || null;
  return {
    ticket: {
      id: ticket.id,
      number: ticket.number,
      status: ticket.status,
      storeId: ticket.storeId,
      clientId: ticket.clientId,
      reviewer: reviewer ? person(reviewer) : null,
      nextFollowUpAt: isActiveTicket(ticket) ? due : null,
    },
    messages,
    contacts: contactsForTicket(state, ticket),
    reviewers:
      user.role === 'Admin'
        ? state.users
            .filter(
              (account) =>
                ['Supervisor', 'Admin'].includes(account.role) &&
                account.accountStatus === 'Active',
            )
            .map(person)
        : [],
    permissions: conversationPermissions(user, ticket),
  };
}

function date(value: unknown, label: string): string | null {
  if (!value) return null;
  const parsed = new Date(value as string | number);
  if (!Number.isFinite(parsed.getTime())) throw Error(`${label} is invalid.`);
  return parsed.toISOString();
}

function noteFields(
  state: WorkspaceState,
  ticket: Ticket,
  payload: Payload,
  previous: ConversationEntry | null | undefined,
) {
  const text = String(payload.text || '').trim();
  if (!text || text.length > 8000) throw Error('Enter a message of 1–8000 characters.');
  const channel = payload.channel || 'Ticket';
  if (!isChannel(channel)) throw Error('Select a communication channel.');
  const occurredAt = date(payload.occurredAt, 'Conversation date') || new Date().toISOString();
  const nextFollowUpAt = date(payload.nextFollowUpAt, 'Follow-up date');
  if (nextFollowUpAt && nextFollowUpAt < occurredAt)
    throw Error('Next follow-up must be after the conversation time.');
  let contact: Contact | null = null;
  if (payload.contactKey === 'external') {
    const name = String(payload.contactName || '').trim();
    if (!name || name.length > 150) throw Error('Enter the contact name (up to 150 characters).');
    contact = {
      key: 'external',
      name,
      role: String(payload.contactRole || 'External contact').slice(0, 100),
      phone: String(payload.contactPhone || '').slice(0, 50),
      storeId: ticket.storeId,
    };
  } else if (payload.contactKey) {
    contact =
      (previous?.contact?.key === payload.contactKey
        ? structuredClone(previous.contact)
        : contactsForTicket(state, ticket).find((item) => item.key === payload.contactKey)) ?? null;
    if (!contact) throw Error('Selected contact is no longer available. Choose a current contact.');
  }
  return { text, channel, occurredAt, nextFollowUpAt, contact };
}

export function notifyTicket(
  state: WorkspaceState,
  ticket: Ticket,
  author: Person,
  text: string,
): void {
  ticket.updatedAt = new Date().toISOString();
  const recipients = state.users.filter(
    (user) =>
      user.id !== author.id &&
      user.accountStatus === 'Active' &&
      (user.role === 'Admin' ||
        (user.role === 'Supervisor' &&
          (ticket.reviewerId || ticket.assignedBy
            ? user.id === (ticket.reviewerId || ticket.assignedBy)
            : true)) ||
        user.id === ticket.workerId ||
        (user.role === 'Client' && canAccessCustomerStore(state, user, ticket))),
  );
  for (const user of recipients)
    state.notifications.unshift({
      id: uuid(),
      userId: user.id,
      ticketId: ticket.id,
      text: `${ticket.number}: ${text}`,
      read: false,
      createdAt: new Date().toISOString(),
    });
}

export function assertConversationWrite(
  state: WorkspaceState,
  user: Actor,
  ticketId: unknown,
): Ticket {
  const ticket = readableTicket(state, user, ticketId);
  if (!conversationPermissions(user, ticket).canComment)
    throw Error(
      'This ticket is read-only. Only its active participants/reviewer can follow up before resolution.',
    );
  return ticket;
}

export function applyConversationAction(
  state: WorkspaceState,
  user: Actor,
  type: ConversationAction,
  payload: Payload,
): Ticket | ConversationEntry {
  const ticket = readableTicket(state, user, payload.ticketId);
  const permissions = conversationPermissions(user, ticket);
  if (type === 'reviewer') {
    if (
      !permissions.canManageReviewer &&
      !(permissions.canTakeReview && payload.reviewerId === user.id)
    )
      throw Error(
        'Only Admin can reassign the reviewer; a Supervisor may take an unclaimed ticket.',
      );
    const reviewer = state.users.find(
      (account) =>
        account.id === payload.reviewerId &&
        ['Supervisor', 'Admin'].includes(account.role) &&
        account.accountStatus === 'Active',
    );
    if (!reviewer) throw Error('Select an active Supervisor or Admin.');
    if (ticket.reviewerId !== reviewer.id) {
      ticket.reviewerId = reviewer.id;
      ticket.reviewerName = reviewer.name;
      ticket.reviewerRole = reviewer.role;
      recordActivity(ticket, user, `Reviewer assigned: ${reviewer.name}`, {
        reviewer: person(reviewer),
      });
      notifyTicket(state, ticket, user, `Reviewer assigned: ${reviewer.name}`);
    }
    return ticket;
  }
  if (type === 'resolve') {
    if (!permissions.canResolve)
      throw Error('Only the assigned worker, reviewer or Admin can resolve an assigned ticket.');
    ticket.status = 'Resolved';
    ticket.resolvedAt = new Date().toISOString();
    ticket.resolvedBy = user.id;
    recordActivity(ticket, user, 'Ticket marked Resolved. Follow-up discussion is now read-only.');
    notifyTicket(
      state,
      ticket,
      user,
      'Service resolved. Conversation history is available to read.',
    );
    return ticket;
  }
  if (type === 'reopen') {
    if (!permissions.canReopen)
      throw Error('Only Admin or the ticket reviewer can reopen a resolved/closed ticket.');
    const reason = String(payload.reason || '').trim();
    if (!reason || reason.length > 2000)
      throw Error('Enter a reopening reason (up to 2000 characters).');
    ticket.status = ticket.workerId ? 'Assigned' : 'Pending';
    recordActivity(ticket, user, `Ticket reopened: ${reason}`);
    notifyTicket(state, ticket, user, 'Ticket reopened for further follow-up.');
    return ticket;
  }
  assertConversationWrite(state, user, ticket.id);
  const existing = (ticket.conversation || []).find(
    (entry) => entry.id === payload.messageId && entry.kind === 'message',
  );
  if (type === 'followupDone') {
    if (!existing?.nextFollowUpAt) throw Error('Follow-up not found.');
    if (user.role !== 'Admin' && existing.author.id !== user.id && ticket.reviewerId !== user.id)
      throw Error('Only the author or reviewer can complete this follow-up.');
    if (!existing.followUpCompletedAt) {
      existing.followUpCompletedAt = new Date().toISOString();
      recordActivity(ticket, user, 'Scheduled follow-up completed.', { messageId: existing.id });
    }
    return existing;
  }
  const fields = noteFields(state, ticket, payload, type === 'editComment' ? existing : null);
  if (type === 'editComment') {
    if (!existing) throw Error('Message not found.');
    if (existing.author.id !== user.id && user.role !== 'Admin')
      throw Error('You can edit only your own messages.');
    (existing.revisions ??= []).push({
      text: existing.text,
      contact: existing.contact,
      channel: existing.channel,
      occurredAt: existing.occurredAt,
      nextFollowUpAt: existing.nextFollowUpAt,
      editedAt: new Date().toISOString(),
      editedBy: person(user),
    });
    Object.assign(existing, fields, {
      editedAt: new Date().toISOString(),
      editedBy: person(user),
      followUpCompletedAt: null,
    });
    notifyTicket(state, ticket, user, `${user.name} updated a conversation entry.`);
    return existing;
  }
  const requested = Array.isArray(payload.attachmentIds) ? payload.attachmentIds : [];
  const ids = [...new Set(requested)];
  if (
    ids.length > 5 ||
    ids.some((id) => !(ticket.attachments || []).some((file) => file.id === id))
  )
    throw Error('Select up to five attachments uploaded to this ticket.');
  const entry: ConversationEntry = {
    id: uuid(),
    kind: 'message',
    author: person(user),
    createdAt: new Date().toISOString(),
    storeId: ticket.storeId,
    clientId: ticket.clientId,
    ...fields,
    attachmentIds: ids as string[],
    revisions: [],
  };
  (ticket.conversation ??= []).push(entry);
  notifyTicket(state, ticket, user, `${user.name} added a conversation/follow-up update.`);
  return entry;
}
