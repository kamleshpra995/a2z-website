import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadCoordinator } from './readCoordinator.ts';
import { indexWorkspace } from './workspaceIndex.ts';
// Relative path on purpose: Node runs this test directly and does not resolve the @shared alias.
import { summarizeTickets } from '../../../../server/src/shared/tickets.ts';
import type { TicketStatus } from '../../../../server/src/shared/types.ts';
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
test('overlapping reads share a request, but a post-save read fetches committed data', async () => {
  const first = deferred<string>();
  let calls = 0;
  const reader = createReadCoordinator(() =>
    ++calls === 1 ? first.promise : Promise.resolve('committed'),
  );
  const a = reader.read();
  const b = reader.read();
  await Promise.resolve();
  assert.equal(calls, 1);
  const afterSave = reader.read({ fresh: true });
  assert.equal(calls, 1);
  first.resolve('older');
  assert.equal(await a, 'older');
  assert.equal(await b, 'older');
  assert.equal(await afterSave, 'committed');
  assert.equal(calls, 2);
});
test('logout invalidation discards late responses and cannot erase the next login read', async () => {
  const older = deferred<string>();
  let calls = 0;
  const reader = createReadCoordinator(() =>
    ++calls === 1 ? older.promise : Promise.resolve('new-user-data'),
  );
  const previous = reader.read();
  await Promise.resolve();
  reader.invalidate();
  const next = reader.read();
  older.resolve('previous-user-private-data');
  assert.equal(await previous, undefined);
  assert.equal(await next, 'new-user-data');
});
test('failed reads can retry; late errors from previous sessions are ignored', async () => {
  let calls = 0;
  const reader = createReadCoordinator(() => {
    if (++calls === 1) throw Error('offline');
    return 'recovered';
  });
  await assert.rejects(() => reader.read(), /offline/);
  assert.equal(await reader.read(), 'recovered');
  const late = deferred<string>();
  const canceled = createReadCoordinator(() => late.promise);
  const result = canceled.read();
  await Promise.resolve();
  canceled.invalidate();
  late.reject(Error('old 401'));
  assert.equal(await result, undefined);
});
test('live indexes and summaries count added, edited, assigned and closed records without mutating inputs', () => {
  const data = {
    clients: [{ id: 'c1', name: 'Client' }],
    stores: [
      { id: 's1', clientId: 'c1', name: 'Branch' },
      { id: 's2', clientId: 'c1', name: 'Branch 2' },
    ],
    users: [{ id: 'w1', name: 'Worker' }],
    tickets: [
      { status: 'Pending' as TicketStatus },
      { status: 'Assigned' as TicketStatus, workerId: 'w1' },
      { status: 'Closed' as TicketStatus, workerId: 'w1' },
    ],
  };
  const before = JSON.stringify(data);
  const index = indexWorkspace(data);
  assert.equal(index.storeCounts.get('c1'), 2);
  assert.equal(index.assignedCounts.get('w1'), 1);
  assert.equal(index.userNames.get('w1'), 'Worker');
  assert.deepEqual(summarizeTickets(data.tickets), {
    All: 3,
    Open: 2,
    Pending: 1,
    Assigned: 1,
    Resolved: 0,
    Closed: 1,
  });
  assert.equal(JSON.stringify(data), before);
  data.tickets[1]!.status = 'Closed';
  data.stores[0]!.name = 'Updated';
  const updated = indexWorkspace(data);
  assert.equal(updated.storeNames.get('s1'), 'Updated');
  assert.equal(updated.assignedCounts.get('w1'), undefined);
  assert.equal(summarizeTickets(data.tickets).Closed, 2);
});
