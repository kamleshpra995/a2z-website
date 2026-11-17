import test from 'node:test';
import assert from 'node:assert/strict';
import { businessDate, validateTicketDates, displayDate } from '../src/shared/dates.ts';
import { actionRunner, createState, loose } from './fixtures.ts';
import type { User } from '../src/shared/types.ts';
test('Raised On uses India business date and validates requested resolution deadline', () => {
  assert.equal(businessDate('2026-11-02T20:00:00Z'), '2026-11-03');
  const dates = validateTicketDates({ dueDate: '2030-12-31' });
  assert.equal(dates.raisedOn, businessDate());
  assert.equal(dates.dueDate, '2030-12-31');
  assert.throws(() => validateTicketDates({}), /Due Date/);
  assert.throws(() => validateTicketDates({ dueDate: '2030-02-31' }), /valid/);
  assert.throws(() => validateTicketDates({ dueDate: '2000-01-01' }), /before/);
  assert.throws(
    () => validateTicketDates({ raisedOn: '2000-01-01', dueDate: '2030-12-31' }),
    /today/,
  );
  assert.equal(displayDate('2026-11-03'), '03/11/2026');
});
test('assigning Supervisor/Admin is automatically persisted as the reviewer', async () => {
  const state = createState();
  state.clients = [{ id: 'c', name: 'Client' }];
  state.stores = [{ id: 's', clientId: 'c', name: 'Store' }];
  state.users = loose<User[]>([
    { id: 'a', role: 'Admin', name: 'Admin Name', accountStatus: 'Active' },
    { id: 'r', role: 'Supervisor', name: 'Supervisor Name', accountStatus: 'Active' },
    { id: 'w', role: 'Field Worker', name: 'Worker', accountStatus: 'Active' },
  ]);
  const [admin, supervisor, worker] = state.users;
  const act = actionRunner(state);
  const ticket = await act(admin, 'ticket', {
    storeId: 's',
    serviceId: 'test-service',
    issue: 'Test',
    dueDate: '2030-12-31',
  });
  await act(supervisor, 'assign', { ticketId: ticket.id, workerId: worker.id });
  assert.equal(ticket.reviewerId, supervisor.id);
  assert.equal(ticket.reviewerName, supervisor.name);
  assert.equal(ticket.reviewerRole, 'Supervisor');
  await act(admin, 'assign', { ticketId: ticket.id, workerId: worker.id });
  assert.equal(ticket.reviewerId, admin.id);
  assert.equal(ticket.reviewerName, admin.name);
  assert.equal(ticket.reviewerRole, 'Admin');
  assert.equal(ticket.dueDate, '2030-12-31');
});
