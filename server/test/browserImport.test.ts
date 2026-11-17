import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/domain/state.ts';
import { createAdmin } from '../src/domain/auth.ts';
import { planBrowserImport, applyBrowserImport } from '../src/migration/browserImport.ts';
import type { Attachment, FileUpload } from '../src/shared/types.ts';

test('Browser import preserves ownership and attachments without credentials or duplicate writes', async () => {
  const target = createState();
  const admin = await createAdmin(target, {
    name: 'Admin',
    email: 'new@example.test',
    password: 'server-only-password',
  });
  const source = {
    format: 'a2z-browser-v1',
    state: {
      ...createState(),
      users: [
        { id: 'oldAdmin', role: 'Admin' },
        {
          id: 'customer',
          role: 'Client',
          accountStatus: 'Active',
          name: 'Customer',
          email: 'customer@example.test',
          clientId: 'client',
          passwordHash: 'old-hash',
        },
      ],
      sessions: [{ hash: 'old-session' }],
      clients: [{ id: 'client', name: 'Customer company' }],
      stores: [
        { id: 'store', clientId: 'client', name: 'Branch', address: 'QA Road', manager: 'Manager' },
      ],
      tickets: [
        {
          id: 'ticket',
          number: 'A2Z-0003',
          clientId: 'client',
          storeId: 'store',
          priority: 'Low',
          status: 'Closed',
          reviewerId: 'oldAdmin',
          attachments: [{ id: 'file', name: 'note.txt', createdBy: 'oldAdmin' }],
          conversation: [{ author: { id: 'oldAdmin' }, attachmentIds: ['file'] }],
        },
      ],
      invoices: [{ id: 'invoice', clientId: 'client', ticketId: 'ticket' }],
    },
    files: [{ id: 'file', base64: 'aGVsbG8=' }],
  };
  const raw = JSON.stringify(source);
  const plan = planBrowserImport(target, raw);
  assert.ok(plan);
  assert.equal(target.clients.length, 0);
  const saved: Attachment[] = [];
  await applyBrowserImport(
    target,
    plan,
    {
      save: async (ticketId: string, input: unknown, userId: string) => ({
        id: 'new-file',
        name: (input as FileUpload).name,
        mime: 'text/plain',
        size: 5,
        createdBy: userId,
        createdAt: new Date().toISOString(),
        storagePath: `tickets/${ticketId}/new-file.txt`,
      }),
    },
    saved,
  );
  const [ticket] = target.tickets;
  assert.equal(ticket?.reviewerId, admin.id);
  assert.equal(ticket?.attachments?.[0]?.createdBy, admin.id);
  assert.deepEqual(ticket?.conversation?.[0]?.attachmentIds, ['new-file']);
  assert.equal(target.users.find((user) => user.id === 'customer')?.passwordHash, undefined);
  assert.equal(target.sessions, undefined);
  assert.equal(planBrowserImport(target, raw), null);
  assert.throws(() => planBrowserImport(target, raw + ' '), /empty|no business/);
  assert.equal(target.tickets.length, 1);
});
