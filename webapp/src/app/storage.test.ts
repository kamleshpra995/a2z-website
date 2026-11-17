import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient, type Fetcher } from './storage.ts';

test('the API client calls same-origin endpoints and sends typed actions', async () => {
  const calls: Parameters<Fetcher>[] = [];
  const client = createApiClient(async (...args) => {
    calls.push(args);
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  });
  await client.getState();
  await client.action('client', { name: 'Client' });
  assert.equal(calls[0]?.[0], '/api/state');
  assert.equal(calls[1]?.[0], '/api/action');
  assert.equal(JSON.parse(String(calls[1]?.[1].body)).type, 'client');
  assert.equal(calls[1]?.[1].credentials, 'same-origin');
});

test('database errors surface to the UI and never fall back to local data', async () => {
  const client = createApiClient(async () => ({
    ok: false,
    status: 503,
    json: async () => ({ error: 'Database unavailable' }),
  }));
  await assert.rejects(() => client.action('client', { name: 'Client' }), /Database unavailable/);
  await assert.rejects(
    () => client.getState(),
    (error: Error & { status?: number }) => error.status === 503,
  );
});
