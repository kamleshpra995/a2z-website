import test from 'node:test';
import assert from 'node:assert/strict';
import { actionRunner, addAccount, createState } from './fixtures.ts';
import { createAdmin, login, viewState } from '../src/domain/auth.ts';
const password = 'master-test-password';
async function fixture() {
  const state = createState();
  const admin = await createAdmin(state, { name: 'Admin', email: 'admin@test.com', password });
  const c1 = await addAccount(state, admin, {
    name: 'Customer 1',
    email: 'customer1@test.com',
    password,
    role: 'Client',
    company: 'Primary 1',
  });
  const c2 = await addAccount(state, admin, {
    name: 'Customer 2',
    email: 'customer2@test.com',
    password,
    role: 'Client',
    company: 'Primary 2',
  });
  const supervisor = await addAccount(state, admin, {
    name: 'Supervisor',
    email: 'supervisor@test.com',
    password,
    role: 'Supervisor',
  });
  return {
    state,
    admin,
    c1,
    c2,
    supervisor,
    act: actionRunner(state),
  };
}
test('Customer reads own clients/stores and raises tickets, but cannot create/update master records', async () => {
  const { state, admin, c1, c2, act } = await fixture();
  const client = await act(admin, 'client', { name: 'Additional client' });
  client.ownerUserId = c1.id;
  const store = await act(admin, 'store', {
    clientId: client.id,
    name: 'Branch',
    manager: 'Manager',
    address: 'Address',
  });
  assert.equal(viewState(state, c1).clients.length, 2);
  assert.equal(viewState(state, c1).stores.length, 1);
  assert.equal(viewState(state, c2).stores.length, 0);
  for (const payload of [{ name: 'Forbidden' }, { id: client.id, name: 'Forbidden edit' }])
    await assert.rejects(() => act(c1, 'client', payload), /permission/);
  for (const payload of [
    { clientId: client.id, name: 'New', manager: 'Manager', address: 'Address' },
    { ...store, name: 'Forbidden edit' },
  ])
    await assert.rejects(() => act(c1, 'store', payload), /permission/);
  const ticket = await act(c1, 'ticket', {
    storeId: store.id,
    dueDate: '2030-12-31',
    serviceId: 'test-service',
    issue: 'Allowed complaint',
  });
  assert.equal(ticket.status, 'Pending');
  await assert.rejects(
    () =>
      act(c2, 'ticket', {
        storeId: store.id,
        dueDate: '2030-12-31',
        serviceId: 'test-service',
        issue: 'Other customer complaint',
      }),
    /permission/,
  );
  await assert.rejects(
    () => act(c1, 'assign', { ticketId: ticket.id, workerId: 'worker' }),
    /permission/,
  );
  await assert.rejects(() => act(c1, 'close', { ticketId: ticket.id }), /permission/);
  assert.equal(state.stores.length, 1);
});
test('Supervisor creates/updates Field Workers without losing password or escalating roles', async () => {
  const { state, supervisor, admin, act } = await fixture();
  const worker = await act(supervisor, 'user', {
    name: 'Worker',
    email: 'worker@test.com',
    password,
    phone: '123',
    role: 'Field Worker',
  });
  const original = state.users.find((user) => user.id === worker.id)!.passwordHash;
  await act(supervisor, 'user', {
    id: worker.id,
    name: 'Updated worker',
    email: 'worker@test.com',
    phone: '456',
    role: 'Field Worker',
    password: '',
  });
  assert.equal(state.users.find((user) => user.id === worker.id)!.passwordHash, original);
  assert.equal(
    (await login(state, { email: 'worker@test.com', password })).user.name,
    'Updated worker',
  );
  await assert.rejects(
    () =>
      act(supervisor, 'user', {
        id: admin.id,
        name: 'Hijack',
        email: admin.email,
        role: 'Field Worker',
        password,
      }),
    /permission/,
  );
  await assert.rejects(
    () =>
      act(supervisor, 'user', {
        name: 'New supervisor',
        email: 'new@test.com',
        role: 'Supervisor',
        password,
      }),
    /permission/,
  );
  await assert.rejects(
    () =>
      act(supervisor, 'user', {
        id: worker.id,
        name: 'Promote',
        email: worker.email,
        role: 'Admin',
        password,
      }),
    /permission/,
  );
});
test('Complaint for additional owned client reaches both bell queues and assignment/closure notifications reach Customer', async () => {
  const { state, admin, c1, supervisor, act } = await fixture();
  const client = await act(admin, 'client', { name: 'Additional client' });
  client.ownerUserId = c1.id;
  const store = await act(admin, 'store', {
    clientId: client.id,
    name: 'Branch',
    manager: 'Manager',
    address: 'Address',
  });
  const ticket = await act(c1, 'ticket', {
    storeId: store.id,
    dueDate: '2030-12-31',
    serviceId: 'test-service',
    issue: 'Cooling fault',
  });
  for (const user of [admin, supervisor])
    assert.ok(
      viewState(state, user).notifications.some(
        (item) => item.ticketId === ticket.id && !item.read,
      ),
    );
  const supervisorNotice = viewState(state, supervisor).notifications.find(
    (item) => item.ticketId === ticket.id,
  )!;
  await act(supervisor, 'read', { userId: supervisor.id, notificationId: supervisorNotice.id });
  assert.equal(state.notifications.find((item) => item.id === supervisorNotice.id)!.read, true);
  assert.ok(
    viewState(state, admin).notifications.some((item) => item.ticketId === ticket.id && !item.read),
  );
  const worker = await act(supervisor, 'user', {
    name: 'Worker',
    email: 'worker@test.com',
    password,
    role: 'Field Worker',
  });
  await act(supervisor, 'assign', { ticketId: ticket.id, workerId: worker.id });
  assert.ok(
    viewState(state, c1).notifications.some(
      (item) => item.ticketId === ticket.id && item.text.includes('assigned'),
    ),
  );
  await act(supervisor, 'close', { ticketId: ticket.id });
  assert.equal(viewState(state, c1).invoices.length, 1);
  assert.ok(
    viewState(state, c1).notifications.some(
      (item) => item.ticketId === ticket.id && item.text.includes('invoice draft'),
    ),
  );
  await assert.rejects(() => act(admin, 'store', { ...store, clientId: c1.clientId }), /history/);
});
