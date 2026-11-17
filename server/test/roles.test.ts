import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorage, STORAGE_KEY } from './legacyStorageFixture.ts';
import { createState } from './fixtures.ts';
import { seedAccounts } from '../src/domain/bootstrap.ts';
import { setPassword } from '../src/domain/auth.ts';
import { getDashboard, getRolePages } from '../src/shared/dashboard.ts';
import type { ConfiguredAccount } from '../src/domain/bootstrap.ts';
import type { Role } from '../src/shared/types.ts';
const password = 'test-password-123';
async function accounts() {
  const users: ConfiguredAccount[] = [
    { id: 'a', name: 'Admin', email: 'a@test.com', role: 'Admin' },
    { id: 's', name: 'Supervisor', email: 's@test.com', role: 'Supervisor' },
    { id: 'c', name: 'Customer', email: 'c@test.com', role: 'Client', company: 'Bikaner' },
  ];
  for (const user of users) {
    user.accountStatus = 'Active';
    await setPassword(user, password);
  }
  return users;
}
const memory = () => {
  const map = new Map([[STORAGE_KEY, JSON.stringify(createState())]]);
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => map.set(key, value),
    removeItem: (key: string) => map.delete(key),
  };
};
test('account initialization is idempotent and never overwrites existing passwords or seeds jobs', async () => {
  const state = createState();
  const users = await accounts();
  assert.equal(seedAccounts(state, users), true);
  const original = state.users.find((user) => user.id === 'c')!.passwordHash;
  users[2]!.passwordHash = 'changed';
  assert.equal(seedAccounts(state, users), false);
  assert.equal(state.users.find((user) => user.id === 'c')!.passwordHash, original);
  assert.equal(state.clients.length, 1);
  assert.equal(state.users.length, 3);
  assert.equal(state.stores.length, 0);
  assert.equal(state.tickets.length, 0);
});
test('Customer -> Supervisor -> Worker -> invoice flow with role-specific dashboards and notifications', async () => {
  const users = await accounts();
  const storage = createStorage({ localStorage: memory(), initialAccounts: users });
  const signIn = async (email: string) => {
    await storage.logout();
    await storage.login({ email, password });
  };
  await storage.login({ email: 'a@test.com', password });
  let admin = await storage.getState();
  const company = admin.clients[0];
  const ownStore = (
    await storage.action('store', {
      clientId: company.id,
      name: 'Bikaner Store',
      manager: 'Manager',
      address: 'Address',
    })
  ).result;
  const other = (await storage.action('client', { name: 'Other customer' })).result;
  const otherStore = (
    await storage.action('store', {
      clientId: other.id,
      name: 'Private store',
      manager: 'Manager',
      address: 'Address',
    })
  ).result;
  await storage.action('ticket', {
    storeId: otherStore.id,
    dueDate: '2030-12-31',
    serviceId: 'test-service',
    issue: 'Private request',
  });
  const worker = (
    await storage.action('user', {
      name: 'Worker',
      email: 'w@test.com',
      password,
      role: 'Field Worker',
    })
  ).result;
  await signIn('c@test.com');
  const customerData = await storage.getState();
  assert.equal(customerData.stores.length, 1);
  assert.equal(customerData.tickets.length, 0);
  const job = (
    await storage.action('ticket', {
      storeId: ownStore.id,
      dueDate: '2030-12-31',
      serviceId: 'test-service',
      issue: 'Cooling problem',
      priority: 'High',
    })
  ).result;
  await assert.rejects(
    () => storage.action('assign', { ticketId: job.id, workerId: worker.id }),
    /permission/,
  );
  await assert.rejects(
    () =>
      storage.action('ticket', {
        storeId: otherStore.id,
        dueDate: '2030-12-31',
        serviceId: 'test-service',
        issue: 'Forbidden',
      }),
    /permission/,
  );
  assert.equal(
    getDashboard('Client', await storage.getState()).stats.find(
      (stat) => stat.label === 'Open requests',
    )!.count,
    1,
  );
  await signIn('s@test.com');
  let supervisor = await storage.getState();
  assert.equal(
    supervisor.notifications.some((item) => item.ticketId === job.id),
    true,
  );
  assert.equal(supervisor.invoices.length, 0);
  assert.equal(getDashboard('Supervisor', supervisor).stats[0].count, 2);
  await storage.action('assign', { ticketId: job.id, workerId: worker.id });
  await assert.rejects(() => storage.action('approve', { userId: 'c' }), /permission/);
  await signIn('c@test.com');
  const assigned = await storage.getState();
  assert.equal(
    assigned.notifications.some((item) => item.ticketId === job.id),
    true,
  );
  const publicWorker = assigned.users.find((user) => user.id === worker.id)!;
  assert.equal(publicWorker.name, 'Worker');
  assert.equal(publicWorker.email, undefined);
  assert.equal((publicWorker as unknown as Record<string, unknown>).passwordHash, undefined);
  await signIn('w@test.com');
  const work = await storage.getState();
  assert.equal(work.tickets.length, 1);
  assert.equal(work.stores.length, 1);
  assert.equal(work.clients.length, 1);
  assert.equal(
    work.notifications.some((item) => item.ticketId === job.id),
    true,
  );
  await storage.action('close', { ticketId: job.id });
  await signIn('c@test.com');
  const finished = await storage.getState();
  assert.equal(finished.invoices.length, 1);
  assert.equal(finished.tickets[0].status, 'Closed');
  assert.equal(
    finished.notifications.some((item) => item.text.includes('invoice draft')),
    true,
  );
  await assert.rejects(
    () =>
      storage.action('invoice', {
        id: finished.invoices[0].id,
        amount: 100,
        description: 'Forbidden',
      }),
    /permission/,
  );
  await signIn('a@test.com');
  admin = await storage.getState();
  assert.equal(admin.tickets.length, 2);
  assert.equal(admin.invoices.length, 1);
  assert.equal(admin.tickets.find((ticket) => ticket.id === job.id)!.closedBy, worker.id);
  const summary = getDashboard('Admin', admin);
  assert.equal(summary.stats.find((stat) => stat.label === 'Customers')!.count, 2);
});
test('dashboard links match role navigation permissions', () => {
  const data = { clients: [], stores: [], users: [], tickets: [], invoices: [] };
  const roles: Role[] = ['Admin', 'Client', 'Supervisor', 'Field Worker', 'Accounts'];
  for (const role of roles)
    for (const stat of getDashboard(role, data).stats)
      assert.ok(getRolePages(role).includes(stat.page));
  assert.equal(getRolePages('Client').includes('Internal users'), false);
  assert.equal(getRolePages('Supervisor').includes('Invoices'), false);
});
