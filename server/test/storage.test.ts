import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorage } from './legacyStorageFixture.ts';
const memory = () => {
  const items = new Map();
  return {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => items.set(k, v),
    removeItem: (k: string) => items.delete(k),
  };
};
test('local data persists across adapters; complete workflow never calls API', async () => {
  const localStorage = memory();
  const options = {
    localStorage,
    fetch: () => {
      throw Error('Unexpected API call');
    },
  };
  const s = createStorage(options);
  await s.setup({ name: 'Admin', email: 'admin@test.com', password: 'password12345' });
  await s.login({ email: 'admin@test.com', password: 'password12345' });
  assert.equal((await s.getState()).clients.length, 0);
  const client = (await s.action('client', { name: 'Test client' })).result;
  const store = (
    await s.action('store', {
      clientId: client.id,
      name: 'Store',
      manager: 'Manager',
      address: 'Address',
    })
  ).result;
  const user = (
    await s.action('user', {
      name: 'Worker',
      role: 'Field Worker',
      email: 'worker@test.com',
      password: 'password12345',
    })
  ).result;
  const ticket = (
    await s.action('ticket', {
      storeId: store.id,
      dueDate: '2030-12-31',
      issue: 'Repair',
    })
  ).result;
  await s.action('assign', { ticketId: ticket.id, workerId: user.id });
  await s.action('close', { ticketId: ticket.id });
  await s.action('close', { ticketId: ticket.id });
  const saved = await createStorage(options).getState();
  assert.equal(saved.clients[0].id, client.id);
  assert.equal(saved.tickets[0].status, 'Closed');
  await s.logout();
  await s.login({ email: 'worker@test.com', password: 'password12345' });
  assert.equal((await s.getState()).notifications[0].userId, user.id);
  assert.equal(saved.invoices.length, 1);
});
test('storage quota errors are reported instead of silently losing data', async () => {
  const broken = createStorage({
    localStorage: {
      getItem: () => null,
      setItem: () => {
        throw Error('Quota');
      },
    },
  });
  await assert.rejects(
    () => broken.setup({ name: 'Admin', email: 'admin@test.com', password: 'password12345' }),
    /Data was not saved/,
  );
});
