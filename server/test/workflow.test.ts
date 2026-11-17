import test from 'node:test';
import assert from 'node:assert/strict';
import { assignTicket, closeTicket } from '../src/domain/workflow.ts';
import { loose } from './fixtures.ts';
import type { WorkspaceState } from '../src/shared/types.ts';
const setup = () =>
  loose<WorkspaceState>({
    tickets: [
      {
        id: 't1',
        number: 'A2Z-0001',
        dueDate: '2030-12-31',
        serviceId: 'test-service',
        issue: 'Cooling issue',
        status: 'Pending',
        clientId: 'c1',
        storeId: 's1',
      },
    ],
    users: [
      { id: 'w1', role: 'Field Worker' },
      { id: 'a1', role: 'Admin' },
    ],
    notifications: [],
    invoices: [],
    clients: [],
    stores: [],
  });
test('assignment notifies only the selected field worker', () => {
  const s = setup();
  assignTicket(s, 't1', 'w1');
  assert.equal(s.tickets[0].status, 'Assigned');
  assert.equal(s.notifications.length, 1);
  assert.equal(s.notifications[0].userId, 'w1');
  assert.equal(s.notifications[0].ticketId, 't1');
  assert.equal(s.notifications[0].read, false);
});
test('closing creates exactly one linked invoice draft, including repeated close requests', () => {
  const s = setup();
  assignTicket(s, 't1', 'w1');
  closeTicket(s, 't1');
  closeTicket(s, 't1');
  assert.equal(s.tickets[0].status, 'Closed');
  assert.equal(s.invoices.length, 1);
  assert.equal(s.invoices[0].ticketId, 't1');
  assert.equal(s.invoices[0].storeId, 's1');
  assert.equal(s.invoices[0].status, 'Draft');
});
test('unassigned jobs cannot close; admin cannot be assigned as worker', () => {
  const s = setup();
  assert.throws(() => closeTicket(s, 't1'));
  assert.throws(() => assignTicket(s, 't1', 'a1'));
  assert.equal(s.invoices.length, 0);
  assert.equal(s.notifications.length, 0);
});
test('closed ticket cannot be reassigned', () => {
  const s = setup();
  assignTicket(s, 't1', 'w1');
  closeTicket(s, 't1');
  assert.throws(() => assignTicket(s, 't1', 'w1'));
  assert.equal(s.notifications.length, 1);
});
