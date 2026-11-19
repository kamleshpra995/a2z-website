import { readableTicket } from '../src/domain/conversations.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { addAccount, createState, loose } from './fixtures.ts';
import type { Actor, Client, Invoice, Notification, Store, Ticket } from '../src/shared/types.ts';
import {
  createAdmin,
  login,
  getUser,
  logout,
  viewState,
  authenticatedAction,
  authorize,
} from '../src/domain/auth.ts';
import { applyAction } from '../src/domain/actions.ts';
const account = { name: 'Owner', email: 'owner@test.com', password: 'a-long-password' };
test('passwords hashed; login persists a hashed expiring session; logout revokes it', async () => {
  const s = createState();
  await createAdmin(s, account);
  assert.notEqual(s.users[0].passwordHash, account.password);
  assert.equal((s.users[0] as unknown as Record<string, unknown>).password, undefined);
  await assert.rejects(() => login(s, { ...account, password: 'wrong' }), /incorrect/);
  const session = await login(s, account);
  assert.equal((session.user as Record<string, unknown>).passwordHash, undefined);
  assert.notEqual(s.sessions![0]!.hash, session.token);
  assert.equal((await getUser(s, session.token))?.role, 'Admin');
  s.sessions![0]!.expiresAt = 0;
  assert.equal(await getUser(s, session.token), null);
  const next = await login(s, account);
  await logout(s, next.token);
  assert.equal(await getUser(s, next.token), null);
  await assert.rejects(
    () => createAdmin(s, { ...account, email: 'another@test.com' }),
    /already configured/,
  );
});
test('there is no self sign-up: only Admin creates logins, including customer logins', async () => {
  const s = createState();
  const admin = await createAdmin(s, account);
  const supervisor = await addAccount(s, admin, {
    ...account,
    email: 'supervisor@test.com',
    role: 'Supervisor',
  });
  assert.equal((await login(s, { ...account, email: supervisor.email })).user.role, 'Supervisor');
  await assert.rejects(
    () => addAccount(s, admin, { ...account, email: 'SUPERVISOR@test.com', role: 'Supervisor' }),
    /already exists/,
  );
  await assert.rejects(
    () => addAccount(s, admin, { ...account, email: 'admin2@test.com', role: 'Admin' }),
    /Select a role/,
  );
  await assert.rejects(
    () => addAccount(s, admin, { ...account, email: 'nocompany@test.com', role: 'Client' }),
    /client company/,
  );
  const customer = await addAccount(s, admin, {
    ...account,
    email: 'customer@test.com',
    role: 'Client',
    company: 'Customer company',
  });
  assert.equal(
    (await login(s, { ...account, email: customer.email })).user.clientId,
    customer.clientId,
  );
  await assert.rejects(
    () =>
      authenticatedAction(
        s,
        loose<Actor>({ ...supervisor }),
        'user',
        { ...account, email: 'sneaky@test.com', role: 'Client', clientId: customer.clientId },
        applyAction,
      ),
    /permission/,
  );
});
test('clients cannot read another client data or mutate other stores; supervisors cannot grant access', async () => {
  const s = createState();
  const admin = await createAdmin(s, account);
  const c1 = await addAccount(s, admin, {
    ...account,
    email: 'c1@test.com',
    role: 'Client',
    company: 'Company 1',
  });
  const c2 = await addAccount(s, admin, {
    ...account,
    email: 'c2@test.com',
    role: 'Client',
    company: 'Company 2',
  });
  const store1 = applyAction(s, 'store', {
    clientId: c1.clientId,
    name: 'Store 1',
    manager: 'Manager',
    address: 'Address',
  });
  const store2 = applyAction(s, 'store', {
    clientId: c2.clientId,
    name: 'Store 2',
    manager: 'Manager',
    address: 'Address',
  });
  const user = (await login(s, { ...account, email: c1.email })).user;
  await authenticatedAction(
    s,
    user,
    'ticket',
    { storeId: store1.id, dueDate: '2030-12-31', serviceId: 'test-service', issue: 'Own issue' },
    applyAction,
  );
  applyAction(s, 'ticket', {
    storeId: store2.id,
    dueDate: '2030-12-31',
    serviceId: 'test-service',
    issue: 'Private issue',
  });
  const view = viewState(s, user);
  assert.equal(view.clients.length, 1);
  assert.equal(view.stores.length, 1);
  assert.equal(view.tickets.length, 1);
  assert.equal(view.users.length, 1);
  assert.equal(JSON.stringify(view).includes('passwordHash'), false);
  assert.equal(JSON.stringify(view).includes('Private issue'), false);
  await assert.rejects(
    () =>
      authenticatedAction(
        s,
        user,
        'ticket',
        {
          storeId: store2.id,
          dueDate: '2030-12-31',
          serviceId: 'test-service',
          issue: 'Other issue',
        },
        applyAction,
      ),
    /permission/,
  );
  await assert.rejects(
    () =>
      authenticatedAction(
        s,
        loose<Actor>({ id: 'supervisor', role: 'Supervisor' }),
        'approve',
        { userId: c2.id },
        applyAction,
      ),
    /permission/,
  );
  await assert.rejects(
    () => authenticatedAction(s, user, 'user', { role: 'Admin' }, applyAction),
    /permission/,
  );
  assert.equal(viewState(s, admin).tickets.length, 2);
});
test('a store login is limited to a store of its own client company', async () => {
  const s = createState();
  const admin = await createAdmin(s, account);
  const company = applyAction(s, 'client', { name: 'Existing company' });
  const other = applyAction(s, 'client', { name: 'Other company' });
  const store = applyAction(s, 'store', {
    clientId: company.id,
    name: 'Branch',
    manager: 'Manager',
    address: 'Address',
  });
  const otherStore = applyAction(s, 'store', {
    clientId: other.id,
    name: 'Other branch',
    manager: 'Manager',
    address: 'Address',
  });
  const base = { ...account, email: 'store@test.com', role: 'Client', clientId: company.id };
  await assert.rejects(
    () =>
      authenticatedAction(
        s,
        admin,
        'user',
        { ...base, managedStoreId: otherStore.id },
        applyAction,
      ),
    /store of this client/,
  );
  const manager = await authenticatedAction(
    s,
    admin,
    'user',
    { ...base, managedStoreId: store.id },
    applyAction,
  );
  assert.equal(manager.managedStoreId, store.id);
  const widened = await authenticatedAction(
    s,
    admin,
    'user',
    { ...base, id: manager.id, password: '' },
    applyAction,
  );
  assert.equal(Object.hasOwn(widened, 'managedStoreId'), false);
  assert.equal(
    Object.hasOwn(
      s.users.find((user) => user.id === manager.id)!,
      'managedStoreId',
    ),
    false,
  );
});

test('a store manager cannot view or act on another store of the same client', () => {
  const state = createState();
  const manager: Actor = {
    id: 'manager',
    name: 'Manager',
    role: 'Client',
    clientId: 'client',
    managedStoreId: 'assigned',
  };
  state.clients = loose<Client[]>([{ id: 'client' }]);
  state.stores = loose<Store[]>(['assigned', 'other'].map((id) => ({ id, clientId: 'client' })));
  state.tickets = loose<Ticket[]>(
    state.stores.map(({ id, clientId }) => ({ id, clientId, storeId: id })),
  );
  state.invoices = loose<Invoice[]>(
    state.tickets.map(({ id, clientId }) => ({ ticketId: id, clientId })),
  );
  state.notifications = loose<Notification[]>(
    state.tickets.map(({ id }) => ({ ticketId: id, userId: manager.id })),
  );

  const view = viewState(state, manager);
  assert.deepEqual(
    view.stores.map(({ id }) => id),
    ['assigned'],
  );
  assert.deepEqual(
    view.tickets.map(({ id }) => id),
    ['assigned'],
  );
  assert.deepEqual(
    view.invoices.map(({ ticketId }) => ticketId),
    ['assigned'],
  );
  assert.deepEqual(
    view.notifications.map(({ ticketId }) => ticketId),
    ['assigned'],
  );
  assert.doesNotThrow(() => authorize(state, manager, 'ticket', { storeId: 'assigned' }));
  assert.throws(() => authorize(state, manager, 'ticket', { storeId: 'other' }), /permission/);
  assert.throws(() => readableTicket(state, manager, 'other'));
});
