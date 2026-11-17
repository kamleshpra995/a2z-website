import test from 'node:test';
import assert from 'node:assert/strict';
import { actionRunner, createState, loose } from './fixtures.ts';
import { viewState } from '../src/domain/auth.ts';
import { getConversation } from '../src/domain/conversations.ts';
import { createStorage, STORAGE_KEY } from './legacyStorageFixture.ts';
import { setPassword } from '../src/domain/auth.ts';
import type { StoredFile } from './legacyStorageFixture.ts';
import type { Client, Store, User } from '../src/shared/types.ts';
function fixture() {
  const state = createState();
  state.clients = loose<Client[]>([
    { id: 'c1', name: 'Client', contact: 'Original Contact', phone: '111' },
    { id: 'c2', name: 'Private' },
  ]);
  state.stores = loose<Store[]>([
    { id: 's1', clientId: 'c1', name: 'Store', manager: 'Original Manager', phone: '222' },
  ]);
  state.users = loose<User[]>([
    { id: 'a', name: 'Admin', role: 'Admin', accountStatus: 'Active' },
    { id: 'r', name: 'Reviewer', role: 'Supervisor', accountStatus: 'Active' },
    { id: 'r2', name: 'Other Supervisor', role: 'Supervisor', accountStatus: 'Active' },
    { id: 'w', name: 'Worker', role: 'Field Worker', accountStatus: 'Active' },
    { id: 'customer', name: 'Customer', role: 'Client', clientId: 'c1', accountStatus: 'Active' },
    {
      id: 'other',
      name: 'Other customer',
      role: 'Client',
      clientId: 'c2',
      accountStatus: 'Active',
    },
  ]);
  const [admin, reviewer, otherReviewer, worker, customer, other] = state.users;
  const act = actionRunner(state);
  return { state, admin, reviewer, otherReviewer, worker, customer, other, act };
}
test('conversation snapshots contact and author, preserves revisions, isolates history and files', async () => {
  const { state, customer, other, admin, act } = fixture();
  const ticket = await act(customer, 'ticket', {
    storeId: 's1',
    dueDate: '2030-12-31',
    serviceId: 'test-service',
    issue: 'Cooling',
  });
  const message = await act(customer, 'comment', {
    ticketId: ticket.id,
    text: 'Called manager',
    channel: 'Phone',
    contactKey: 'store:s1:manager',
    nextFollowUpAt: '2030-01-01T10:00:00Z',
    author: { id: 'forged' },
  });
  assert.equal(message.author.id, customer.id);
  assert.equal(message.contact?.name, 'Original Manager');
  assert.equal(message.contact?.phone, '222');
  state.stores[0].manager = 'New Manager';
  await act(customer, 'editComment', {
    ticketId: ticket.id,
    messageId: message.id,
    text: 'Updated call notes',
    channel: 'Phone',
    contactKey: 'store:s1:manager',
  });
  assert.equal(message.contact?.name, 'Original Manager');
  assert.equal(message.revisions?.[0]?.text, 'Called manager');
  assert.equal(message.revisions?.[0]?.contact?.name, 'Original Manager');
  const history = getConversation(state, customer, ticket.id);
  assert.equal(history.messages.filter((entry) => entry.kind === 'message').length, 1);
  assert.equal(
    (viewState(state, customer).tickets[0] as unknown as Record<string, unknown>).conversation,
    undefined,
  );
  assert.throws(() => getConversation(state, other, ticket.id), /access/);
  await assert.rejects(
    () => act(other, 'comment', { ticketId: ticket.id, text: 'Forbidden' }),
    /access/,
  );
  await assert.rejects(
    () =>
      act(customer, 'comment', {
        ticketId: ticket.id,
        text: 'Wrong file',
        attachmentIds: ['not-uploaded'],
      }),
    /attachments/,
  );
  const adminMessage = await act(admin, 'comment', { ticketId: ticket.id, text: 'Admin note' });
  await assert.rejects(
    () =>
      act(customer, 'editComment', {
        ticketId: ticket.id,
        messageId: adminMessage.id,
        text: 'Rewrite',
      }),
    /own messages/,
  );
});
test('reviewer ownership, follow-ups, resolution, reopen and invoice idempotency', async () => {
  const { state, reviewer, otherReviewer, worker, customer, act } = fixture();
  const ticket = await act(customer, 'ticket', {
    storeId: 's1',
    dueDate: '2030-12-31',
    serviceId: 'test-service',
    issue: 'Cooling',
  });
  await act(reviewer, 'reviewer', { ticketId: ticket.id, reviewerId: reviewer.id });
  await assert.rejects(
    () => act(otherReviewer, 'reviewer', { ticketId: ticket.id, reviewerId: otherReviewer.id }),
    /Only Admin/,
  );
  await assert.rejects(
    () => act(otherReviewer, 'comment', { ticketId: ticket.id, text: 'Take over' }),
    /read-only/,
  );
  assert.equal(getConversation(state, otherReviewer, ticket.id).permissions.canComment, false);
  await act(reviewer, 'assign', { ticketId: ticket.id, workerId: worker.id });
  await assert.rejects(
    () => act(otherReviewer, 'assign', { ticketId: ticket.id, workerId: worker.id }),
    /permission/,
  );
  const followup = await act(customer, 'comment', {
    ticketId: ticket.id,
    text: 'Please confirm repair visit',
    nextFollowUpAt: '2030-01-01T10:00:00Z',
  });
  assert.equal(
    getConversation(state, reviewer, ticket.id).ticket.nextFollowUpAt,
    '2030-01-01T10:00:00.000Z',
  );
  await act(reviewer, 'followupDone', { ticketId: ticket.id, messageId: followup.id });
  assert.ok(followup.followUpCompletedAt);
  await act(worker, 'resolve', { ticketId: ticket.id });
  assert.equal(ticket.status, 'Resolved');
  assert.equal(getConversation(state, customer, ticket.id).permissions.canComment, false);
  await assert.rejects(
    () => act(customer, 'comment', { ticketId: ticket.id, text: 'After resolution' }),
    /read-only/,
  );
  await assert.rejects(
    () =>
      act(reviewer, 'editComment', {
        ticketId: ticket.id,
        messageId: followup.id,
        text: 'After resolution',
      }),
    /read-only/,
  );
  await assert.rejects(
    () => act(customer, 'reopen', { ticketId: ticket.id, reason: 'Need more work' }),
    /Only Admin/,
  );
  await act(reviewer, 'close', { ticketId: ticket.id });
  await act(reviewer, 'reopen', { ticketId: ticket.id, reason: 'Issue returned' });
  await act(customer, 'comment', { ticketId: ticket.id, text: 'Following up again' });
  await act(reviewer, 'close', { ticketId: ticket.id });
  assert.equal(state.invoices.length, 1);
  assert.ok(
    getConversation(state, customer, ticket.id).messages.some((entry) =>
      entry.text.includes('reopened'),
    ),
  );
});
test('Local mode persists conversations and file references, bytes stay in the injected file store', async () => {
  const { state, customer } = fixture();
  customer.email = 'customer@test.com';
  await setPassword(customer, 'local-test-password');
  const map = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const bytes = new Map();
  const localStorage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => map.set(key, value),
    removeItem: (key: string) => map.delete(key),
  };
  const files = {
    put: async (file: StoredFile) => bytes.set(file.id, file),
    get: async (id: string) => bytes.get(id),
    remove: async (id: string) => bytes.delete(id),
  };
  const storage = createStorage({ localStorage, fileStore: files });
  await storage.login({ email: customer.email, password: 'local-test-password' });
  const ticket = (
    await storage.action('ticket', {
      storeId: 's1',
      dueDate: '2030-12-31',
      serviceId: 'test-service',
      issue: 'Local job',
    })
  ).result;
  const base64 = Buffer.from('Conversation document').toString('base64');
  const uploaded = await storage.uploadAttachment(ticket.id, { name: 'notes.txt', base64 });
  await storage.action('comment', {
    ticketId: ticket.id,
    text: 'Document attached',
    attachmentIds: [uploaded.attachment.id],
  });
  const reloaded = createStorage({ localStorage, fileStore: files });
  const history = await reloaded.getConversation(ticket.id);
  assert.equal(
    history.messages.find((entry) => entry.kind === 'message')!.attachments[0].name,
    'notes.txt',
  );
  assert.equal(map.get(STORAGE_KEY)!.includes(base64), false);
  assert.equal(bytes.size, 1);
  const url = await reloaded.getAttachmentUrl(ticket.id, uploaded.attachment.id);
  assert.ok(url.startsWith('blob:'));
  URL.revokeObjectURL(url);
});
