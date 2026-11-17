import { createStorage, STORAGE_KEY } from './legacyStorageFixture.ts';
import { createAdmin } from '../src/domain/auth.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, loose } from './fixtures.ts';
import { applyAction } from '../src/domain/actions.ts';
import { verifyStoreCode, raisePublicTicket } from '../src/domain/publicTickets.ts';
import { viewState } from '../src/domain/auth.ts';
import { businessDate } from '../src/shared/dates.ts';
import type { StorageOptions, StoredFile } from './legacyStorageFixture.ts';
import type { Actor, User } from '../src/shared/types.ts';

function fixture() {
  const state = createState();
  const client = applyAction(state, 'client', { name: 'QR QA Client' });
  const store = applyAction(state, 'store', {
    clientId: client.id,
    name: 'QR QA Store',
    addressLine1: 'QA Road',
    manager: 'QA Manager',
    city: 'Jaipur',
    state: 'Rajasthan',
    zip: '302001',
    registeredOn: '2025-01-01',
  });
  state.users.push(
    loose<User>({
      id: 'supervisor',
      name: 'Reviewer',
      role: 'Supervisor',
      accountStatus: 'Active',
    }),
  );
  return { state, client, store };
}
test('Public verification reveals minimal store data; one-time grant binds ticket to verified store and notifies team', async () => {
  const { state, client, store } = fixture();
  await assert.rejects(
    verifyStoreCode(state, { storeId: store.id, code: 'WRONG' }),
    /verification failed/,
  );
  const verified = await verifyStoreCode(state, { storeId: store.id, code: store.storeCode });
  assert.equal((verified.store as Record<string, unknown>).storeCode, undefined);
  assert.equal((verified.client as Record<string, unknown>).id, undefined);
  const result = await raisePublicTicket(state, {
    token: verified.token,
    name: 'QR Guest',
    contact: 'qa@example.test',
    serviceId: 'test-service',
    dueDate: businessDate(),
    storeId: 'forged',
    clientId: 'forged',
    priority: 'High',
  });
  assert.equal(result.status, 'Pending');
  assert.equal(state.tickets[0].storeId, store.id);
  assert.equal(state.tickets[0].clientId, client.id);
  assert.equal(state.tickets[0].priority, 'Low');
  assert.equal(state.tickets[0]!.raisedByContact?.contact, 'qa@example.test');
  assert.ok(state.notifications.some((item) => item.userId === 'supervisor'));
  await assert.rejects(
    raisePublicTicket(state, { token: verified.token }),
    /expired or already used/,
  );
  const customer = loose<Actor>({ id: 'customer', role: 'Client', clientId: client.id });
  assert.equal(viewState(state, customer).stores[0].storeCode, undefined);
  assert.equal(viewState(state, customer).stores[0].hasStoreCode, true);
});
test('Expired grants, rotated Store Codes and archived/inactive stores cannot raise public tickets', async () => {
  const { state, store } = fixture();
  const first = await verifyStoreCode(state, { storeId: store.id, code: store.storeCode });
  state.publicGrants![0]!.expiresAt = 0;
  await assert.rejects(raisePublicTicket(state, { token: first.token }), /expired/);
  const second = await verifyStoreCode(state, { storeId: store.id, code: store.storeCode });
  applyAction(state, 'storeCode', { id: store.id });
  await assert.rejects(raisePublicTicket(state, { token: second.token }), /Code changed/);
  store.active = false;
  await assert.rejects(
    verifyStoreCode(state, { storeId: store.id, code: store.storeCode }),
    /unavailable/,
  );
});
test('Soft deletion preserves existing tickets and restores store metadata; inactive stores reject new jobs', () => {
  const { state, client, store } = fixture();
  const ticket = applyAction(state, 'ticket', {
    storeId: store.id,
    issue: 'QA job',
    dueDate: businessDate(),
  });
  applyAction(state, 'archive', { entity: 'store', id: store.id });
  assert.throws(
    () =>
      applyAction(state, 'ticket', { storeId: store.id, issue: 'New', dueDate: businessDate() }),
    /active store/,
  );
  assert.equal(state.tickets[0].id, ticket.id);
  assert.equal(state.stores.length, 1);
  applyAction(state, 'restore', { entity: 'store', id: store.id });
  assert.equal(store.city, 'Jaipur');
  assert.equal(store.registeredOn, '2025-01-01');
  applyAction(state, 'archive', { entity: 'client', id: client.id });
  assert.throws(
    () =>
      applyAction(state, 'ticket', { storeId: store.id, issue: 'New', dueDate: businessDate() }),
    /inactive/,
  );
  applyAction(state, 'restore', { entity: 'client', id: client.id });
  assert.equal(
    applyAction(state, 'ticket', { storeId: store.id, issue: 'New', dueDate: businessDate() })
      .priority,
    'Low',
  );
});

test('Local adapter persists verified public tickets and initial image references; failed image saves leave no ticket', async () => {
  const { state, store } = fixture();
  await createAdmin(state, {
    name: 'Owner',
    email: 'qa@example.test',
    password: 'test-only-password-123',
  });
  const values = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const files = new Map<string, StoredFile>();
  const options: StorageOptions & { fileStore: NonNullable<StorageOptions['fileStore']> } = {
    mode: 'local',
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
    fileStore: {
      put: async (file: StoredFile) => files.set(file.id, file),
      remove: async (id: string) => files.delete(id),
    },
  };
  const storage = createStorage(options);
  const verified = await storage.verifyStore({ storeId: store.id, code: store.storeCode });
  await storage.raisePublicTicket({
    token: verified.token,
    name: 'QA Guest',
    contact: 'qa@example.test',
    serviceId: 'test-service',
    dueDate: businessDate(),
  });
  await storage.login({ email: 'qa@example.test', password: 'test-only-password-123' });
  const png = {
    name: 'qa.png',
    base64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]).toString('base64'),
  };
  const created = await storage.action('ticket', {
    storeId: store.id,
    serviceId: 'test-service',
    dueDate: businessDate(),
    images: [png],
  });
  assert.equal(files.size, 1);
  const reloaded = createStorage(options);
  assert.equal((await reloaded.getState()).tickets.length, 2);
  const history = await reloaded.getConversation(created.result.id);
  assert.equal(
    history.messages.find((entry) => entry.kind === 'message')!.attachments[0].name,
    'qa.png',
  );
  const originalPut = options.fileStore.put;
  options.fileStore.put = async () => {
    throw Error('Disk full');
  };
  await assert.rejects(
    storage.action('ticket', {
      storeId: store.id,
      serviceId: 'test-service',
      dueDate: businessDate(),
      images: [png],
    }),
    /Disk full/,
  );
  assert.equal((await reloaded.getState()).tickets.length, 2);
  options.fileStore.put = originalPut;
});
