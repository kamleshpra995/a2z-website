import { actionRunner, loose } from './fixtures.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/domain/state.ts';
import { viewState } from '../src/domain/auth.ts';
import { getRolePages } from '../src/shared/dashboard.ts';
import type { Store, User } from '../src/shared/types.ts';
test('Supervisor service master powers Customer dropdown; snapshots/default priority and read-only access are enforced', async () => {
  const state = createState();
  assert.deepEqual(state.services, []);
  const supervisor = loose<User>({
    id: 'r',
    name: 'Supervisor',
    role: 'Supervisor',
    accountStatus: 'Active',
  });
  const customer = loose<User>({
    id: 'c',
    name: 'Customer',
    role: 'Client',
    clientId: 'company',
    accountStatus: 'Active',
  });
  state.users = [supervisor, customer];
  state.clients = [{ id: 'company', name: 'Company' }];
  state.stores = loose<Store[]>([{ id: 'store', clientId: 'company', name: 'Store' }]);
  const act = actionRunner(state);
  const service = await act(supervisor, 'service', {
    name: 'Refrigerator repair',
    description: 'Cooling equipment',
  });
  assert.equal(viewState(state, customer).services[0].name, 'Refrigerator repair');
  await assert.rejects(() => act(customer, 'service', { name: 'Unauthorized' }), /permission/);
  await assert.rejects(
    () => act(customer, 'ticket', { storeId: 'store', issue: 'Free text', dueDate: '2030-12-31' }),
    /Select a service/,
  );
  const ticket = await act(customer, 'ticket', {
    storeId: 'store',
    serviceId: service.id,
    dueDate: '2030-12-31',
  });
  assert.equal(ticket.issue, 'Refrigerator repair');
  assert.equal(ticket.serviceName, 'Refrigerator repair');
  assert.equal(ticket.priority, 'Low');
  await act(supervisor, 'service', { ...service, name: 'Updated repair service' });
  assert.equal(ticket.issue, 'Refrigerator repair');
  assert.equal(viewState(state, customer).services[0].name, 'Updated repair service');
  await act(supervisor, 'service', { ...service, active: false });
  assert.equal(viewState(state, customer).services.length, 0);
  assert.equal(viewState(state, supervisor).services.length, 1);
  await assert.rejects(
    () =>
      act(customer, 'ticket', { storeId: 'store', serviceId: service.id, dueDate: '2030-12-31' }),
    /active service/,
  );
  assert.ok(getRolePages('Supervisor').includes('Services'));
  assert.equal(getRolePages('Client').includes('Services'), false);
});
