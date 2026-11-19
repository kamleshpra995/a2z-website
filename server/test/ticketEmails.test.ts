import test from 'node:test';
import assert from 'node:assert/strict';
import { assignTicket, closeTicket } from '../src/domain/workflow.ts';
import { snapshotTickets, ticketEmails, ticketEvents } from '../src/domain/ticketEmails.ts';
import { whatsappLink, whatsappNumber, whatsappText } from '../src/shared/ticketMessages.ts';
import { loose } from './fixtures.ts';
import type { WorkspaceState } from '../src/shared/types.ts';

const login = { passwordHash: 'x', accountStatus: 'Active' };
const setup = () =>
  loose<WorkspaceState>({
    tickets: [
      {
        id: 't1',
        number: 'A2Z-0001',
        dueDate: '2030-12-31',
        serviceName: 'Ice machine repair',
        issue: 'Ice machine repair',
        description: 'Not making ice',
        priority: 'High',
        status: 'Pending',
        workerId: '',
        clientId: 'c1',
        storeId: 's1',
        raisedByContact: { name: 'Walk-in', contact: 'walkin@example.com' },
      },
    ],
    users: [
      {
        id: 'w1',
        name: 'Amit',
        role: 'Field Worker',
        email: 'amit@a2z.test',
        phone: '9000000012',
        ...login,
      },
      { id: 'a1', name: 'Admin', role: 'Admin', email: 'admin@a2z.test', ...login },
      {
        id: 'u1',
        name: 'All stores',
        role: 'Client',
        clientId: 'c1',
        email: 'all@cafe.test',
        ...login,
      },
      {
        id: 'u2',
        name: 'Saket',
        role: 'Client',
        clientId: 'c1',
        managedStoreId: 's1',
        email: 'saket@cafe.test',
        ...login,
      },
      {
        id: 'u3',
        name: 'Noida',
        role: 'Client',
        clientId: 'c1',
        managedStoreId: 's2',
        email: 'noida@cafe.test',
        ...login,
      },
      { id: 'u4', name: 'Other', role: 'Client', clientId: 'c2', email: 'other@x.test', ...login },
      { id: 'u5', name: 'No login', role: 'Client', clientId: 'c1', email: 'nologin@cafe.test' },
    ],
    clients: [
      { id: 'c1', name: 'Cafe Chain' },
      { id: 'c2', name: 'Other Co' },
    ],
    stores: [
      {
        id: 's1',
        clientId: 'c1',
        name: 'Saket Store',
        addressLine1: 'Saket',
        city: 'Delhi',
        manager: 'Ravi',
        phone: '9000000002',
      },
      { id: 's2', clientId: 'c1', name: 'Noida Store' },
    ],
    notifications: [],
    invoices: [],
  });

test('a new ticket emails the customer logins that can see its store, and the QR raiser', () => {
  const state = setup();
  const before = snapshotTickets(state);
  const ticket = state.tickets.splice(0, 1)[0];
  const empty = snapshotTickets(state);
  state.tickets.push(ticket);
  assert.deepEqual(ticketEvents(before, state), []);
  const events = ticketEvents(empty, state);
  assert.deepEqual(events, [{ kind: 'created', ticketId: 't1' }]);
  const emails = ticketEmails(state, events, { portalUrl: 'https://a2z.test/portal/' });
  assert.deepEqual(
    emails.map((email) => email.to),
    ['all@cafe.test', 'saket@cafe.test', 'walkin@example.com'],
  );
  assert.match(emails[0].subject, /Ticket A2Z-0001 received – Saket Store/);
  assert.match(emails[0].text, /Track this ticket: https:\/\/a2z\.test\/portal\//);
  // The QR raiser has no login, so no portal link.
  assert.doesNotMatch(emails[2].text, /portal/);
});

test('assignment emails the worker the job details and tells the customer who is coming', () => {
  const state = setup();
  const before = snapshotTickets(state);
  assignTicket(state, 't1', 'w1');
  const events = ticketEvents(before, state);
  assert.deepEqual(events, [{ kind: 'assigned', ticketId: 't1' }]);
  const emails = ticketEmails(state, events);
  assert.equal(emails[0].to, 'amit@a2z.test');
  assert.match(emails[0].subject, /New job A2Z-0001/);
  assert.match(emails[0].text, /Store manager: Ravi, 9000000002/);
  assert.match(emails[0].text, /Problem: Not making ice/);
  const customer = emails.find((email) => email.to === 'all@cafe.test');
  assert.match(customer?.text ?? '', /Technician Amit \(9000000012\) has been assigned/);
});

test('closing, resolving and reopening email the customer; nothing for unchanged tickets', () => {
  const state = setup();
  assignTicket(state, 't1', 'w1');
  let before = snapshotTickets(state);
  closeTicket(state, 't1');
  let events = ticketEvents(before, state);
  assert.deepEqual(events, [{ kind: 'status', ticketId: 't1', from: 'Assigned' }]);
  let emails = ticketEmails(state, events);
  assert.ok(emails.every((email) => email.to !== 'amit@a2z.test'));
  assert.match(emails[0].subject, /Ticket A2Z-0001 closed/);

  before = snapshotTickets(state);
  state.tickets[0].status = 'Assigned';
  events = ticketEvents(before, state);
  emails = ticketEmails(state, events);
  assert.match(emails[0].subject, /reopened/);

  before = snapshotTickets(state);
  assert.deepEqual(ticketEvents(before, state), []);
});

test('email HTML escapes ticket text', () => {
  const state = setup();
  state.tickets[0].description = '<script>x</script>';
  const emails = ticketEmails(state, [{ kind: 'created', ticketId: 't1' }]);
  assert.doesNotMatch(emails[0].html, /<script>/);
});

test('WhatsApp numbers and links', () => {
  assert.equal(whatsappNumber('90000 00002'), '919000000002');
  assert.equal(whatsappNumber('+91-90000-00002'), '919000000002');
  assert.equal(whatsappNumber('09000000002'), '919000000002');
  assert.equal(whatsappNumber('0091 9000000002'), '919000000002');
  assert.equal(whatsappNumber('12345'), null);
  assert.equal(whatsappNumber('someone@example.com'), null);
  const text = whatsappText(
    { number: 'A2Z-0001', status: 'Resolved', service: 'AC', store: 'Saket', client: 'Cafe' },
    'Ravi',
  );
  assert.match(text, /^Hello Ravi,/);
  assert.match(text, /Status: Resolved/);
  assert.equal(whatsappLink('919000000002', 'a b&c'), 'https://wa.me/919000000002?text=a%20b%26c');
});
