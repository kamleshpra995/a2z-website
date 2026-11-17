import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction } from '../src/domain/actions.ts';
import { createState } from './fixtures.ts';

test('Client details preserve business start date and image across edits; duplicates normalize spaces/case', () => {
  const state = createState();
  const client = applyAction(state, 'client', {
    name: 'QA Company',
    city: 'Jaipur',
    state: 'Rajasthan',
    website: 'https://example.com',
    addedOn: '2025-01-01',
    image: 'data:image/png;base64,aGVsbG8=',
    active: false,
  });
  applyAction(state, 'client', { id: client.id, name: 'QA Company', contact: 'Updated' });
  assert.equal(client.city, 'Jaipur');
  assert.equal(client.addedOn, '2025-01-01');
  assert.equal(client.active, false);
  assert.equal(client.image, 'data:image/png;base64,aGVsbG8=');
  assert.throws(() => applyAction(state, 'client', { name: '  qa   COMPANY ' }), /already exists/);
  assert.throws(
    () => applyAction(state, 'client', { name: 'Other', website: 'javascript:alert(1)' }),
    /HTTP/,
  );
  assert.throws(
    () => applyAction(state, 'client', { name: 'Other', addedOn: '2025-02-30' }),
    /valid date/,
  );
  assert.throws(
    () => applyAction(state, 'client', { name: 'Other', addedOn: '2099-01-01' }),
    /valid date/,
  );
});
