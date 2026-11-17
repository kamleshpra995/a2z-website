import { createApiClient } from '../../webapp/src/app/storage.ts';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { createAttachmentStore } from '../src/storage/attachments.ts';
import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { AddressInfo } from 'node:net';
import { createApiRouter } from '../src/http/api.ts';
import { createState } from './fixtures.ts';
import { createAdmin } from '../src/domain/auth.ts';
import type { AttachmentStore } from '../src/storage/attachments.ts';
import type { Payload } from '../src/shared/types.ts';
/** Parsed JSON response bodies: the tests check them field by field with assertions. */
type Json = any;
interface RequestOptions {
  body?: unknown;
  cookie?: string;
  headers?: Record<string, string>;
  method?: string;
}
interface ServeOptions {
  available?: boolean;
  attachmentStore?: AttachmentStore;
}
/** The session cookie (name=value) from a login response. */
const cookieOf = (response: { headers: Headers }): string =>
  (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

async function serve(t: TestContext, { available = true, attachmentStore }: ServeOptions = {}) {
  let state = createState();
  if (available)
    await createAdmin(state, {
      name: 'Owner',
      email: 'owner@test.com',
      password: 'api-test-password',
    });
  const app = express();
  app.use(express.json());
  app.use(
    '/api',
    createApiRouter({
      available,
      attachmentStore,
      load: async () => structuredClone(state),
      save: async (value) => {
        state = structuredClone(value);
      },
    }),
  );
  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) =>
    res.status(400).json({ error: error.message }),
  );
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  );
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = async (
    path: string,
    { body, cookie, headers = {}, method = body ? 'POST' : 'GET' }: RequestOptions = {},
  ): Promise<{ status: number; headers: Headers; body: Json }> => {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
  return { request, base, snapshot: () => structuredClone(state) };
}
test('HTTP login, protected writes, approval, customer isolation and logout keep the same API contract', async (t) => {
  const { request } = await serve(t);
  assert.equal((await request('/api/state')).status, 401);
  const auth = await request('/api/auth/login', {
    body: { email: 'owner@test.com', password: 'api-test-password' },
  });
  assert.equal(auth.status, 200);
  assert.match(auth.headers.get('set-cookie') ?? '', /HttpOnly/);
  assert.match(auth.headers.get('set-cookie') ?? '', /SameSite=Strict/);
  assert.equal(auth.body.user.passwordHash, undefined);
  assert.equal(auth.body.token, undefined);
  const adminCookie = cookieOf(auth);
  const company = await request('/api/action', {
    cookie: adminCookie,
    body: { type: 'client', payload: { name: 'Private Admin Company' } },
  });
  assert.equal(company.status, 200);
  const registered = await request('/api/auth/register', {
    body: {
      name: 'Customer',
      email: 'customer@test.com',
      password: 'customer-api-password',
      role: 'Client',
      company: 'Customer Company',
    },
  });
  assert.equal(registered.status, 201);
  const pendingLogin = await request('/api/auth/login', {
    body: { email: 'customer@test.com', password: 'customer-api-password' },
  });
  assert.equal(pendingLogin.status, 400);
  assert.equal(
    (
      await request('/api/action', {
        cookie: adminCookie,
        body: { type: 'approve', payload: { userId: registered.body.user.id } },
      })
    ).status,
    200,
  );
  const login = await request('/api/auth/login', {
    body: { email: 'customer@test.com', password: 'customer-api-password' },
  });
  const cookie = cookieOf(login);
  const view = await request('/api/state', { cookie });
  assert.equal(view.body.clients.length, 1);
  assert.equal(view.body.clients[0].name, 'Customer Company');
  assert.equal(JSON.stringify(view.body).includes('passwordHash'), false);
  const deniedClient = await request('/api/action', {
    cookie,
    body: { type: 'client', payload: { name: 'Forbidden Customer company' } },
  });
  assert.equal(deniedClient.status, 400);
  const store = await request('/api/action', {
    cookie: adminCookie,
    body: {
      type: 'store',
      payload: {
        clientId: view.body.clients[0].id,
        name: 'Branch',
        manager: 'Manager',
        address: 'Address',
      },
    },
  });
  assert.equal(store.status, 200);
  const deniedEdit = await request('/api/action', {
    cookie,
    body: { type: 'store', payload: { ...store.body.result, name: 'Forbidden edit' } },
  });
  assert.equal(deniedEdit.status, 400);
  const ticket = await request('/api/action', {
    cookie,
    body: {
      type: 'ticket',
      payload: {
        storeId: store.body.result.id,
        dueDate: '2030-12-31',
        serviceId: 'test-service',
        issue: 'API complaint',
      },
    },
  });
  assert.equal(ticket.status, 200);
  assert.equal(
    (
      await request('/api/action', {
        cookie,
        body: { type: 'client', payload: { id: company.body.result.id, name: 'Forbidden update' } },
      })
    ).status,
    400,
  );
  assert.equal(
    (await request('/api/state', { cookie: adminCookie })).body.notifications.some(
      (item: Json) => item.ticketId === ticket.body.result.id,
    ),
    true,
  );
  assert.equal((await request('/api/auth/logout', { cookie, body: {} })).status, 200);
  assert.equal((await request('/api/state', { cookie })).status, 401);
});
test('HTTP boundary preserves missing-database, origin and JSON checks', async (t) => {
  const disabled = await serve(t, { available: false });
  assert.equal((await disabled.request('/api/state')).status, 503);
  const { request } = await serve(t);
  assert.equal(
    (
      await request('/api/auth/login', {
        body: {},
        headers: { Origin: 'https://untrusted.example' },
      })
    ).status,
    403,
  );
  assert.equal((await request('/api/auth/login', { method: 'POST' })).status, 415);
});

test('HTTP conversation and attachment routes persist references and require ticket authorization', async (t) => {
  const prefix = path.join(os.tmpdir(), 'a2z-conversation-api-');
  const root = await mkdtemp(prefix);
  t.after(async () => {
    if (!root.startsWith(prefix)) throw Error('Unexpected cleanup target');
    await rm(root, { recursive: true, force: true });
  });
  const disk = createAttachmentStore(root);
  const { request, base, snapshot } = await serve(t, { attachmentStore: disk });
  const signedIn = await request('/api/auth/login', {
    body: { email: 'owner@test.com', password: 'api-test-password' },
  });
  const cookie = cookieOf(signedIn);
  const company = (
    await request('/api/action', {
      cookie,
      body: { type: 'client', payload: { name: 'Files client' } },
    })
  ).body.result;
  const store = (
    await request('/api/action', {
      cookie,
      body: {
        type: 'store',
        payload: {
          clientId: company.id,
          name: 'Files store',
          manager: 'Manager',
          address: 'Address',
        },
      },
    })
  ).body.result;
  const ticket = (
    await request('/api/action', {
      cookie,
      body: {
        type: 'ticket',
        payload: {
          storeId: store.id,
          dueDate: '2030-12-31',
          serviceId: 'test-service',
          issue: 'File and discussion test',
        },
      },
    })
  ).body.result;
  const pathBase = `/api/tickets/${ticket.id}`;
  assert.equal((await request(`${pathBase}/conversation`)).status, 401);
  const uploaded = await request(`${pathBase}/attachments`, {
    cookie,
    body: {
      name: 'visit-notes.txt',
      base64: Buffer.from('Visit report contents').toString('base64'),
    },
  });
  assert.equal(uploaded.status, 201);
  assert.equal(uploaded.body.attachment.storagePath, undefined);
  const id = uploaded.body.attachment.id;
  const file = snapshot().tickets.find((item) => item.id === ticket.id)!.attachments![0]!;
  assert.ok(file.storagePath?.startsWith(`tickets/${ticket.id}/`));
  assert.equal(await readFile(disk.absolutePath(file), 'utf8'), 'Visit report contents');
  const posted = await request('/api/action', {
    cookie,
    body: {
      type: 'comment',
      payload: {
        ticketId: ticket.id,
        text: 'Spoke with manager',
        contactKey: `store:${store.id}:manager`,
        channel: 'Phone',
        nextFollowUpAt: '2030-01-01T10:00:00Z',
        attachmentIds: [id],
      },
    },
  });
  assert.equal(posted.status, 200);
  const history = await request(`${pathBase}/conversation`, { cookie });
  assert.equal(history.status, 200);
  const message = history.body.messages.find((item: Json) => item.kind === 'message');
  assert.equal(message.contact.name, 'Manager');
  assert.equal(message.attachments[0].id, id);
  assert.equal(JSON.stringify(history.body).includes('storagePath'), false);
  const summary = (await request('/api/state', { cookie })).body.tickets[0];
  assert.equal(summary.conversation, undefined);
  assert.equal(summary.attachments, undefined);
  assert.equal(summary.nextFollowUpAt, '2030-01-01T10:00:00.000Z');
  const url = base + uploaded.body.attachment.url;
  assert.equal((await fetch(url)).status, 401);
  const downloaded = await fetch(url, { headers: { Cookie: cookie } });
  assert.equal(downloaded.status, 200);
  assert.match(downloaded.headers.get('content-disposition') ?? '', /attachment/);
  assert.equal(downloaded.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(await downloaded.text(), 'Visit report contents');
  const outsider = await request('/api/auth/register', {
    body: {
      name: 'Other customer',
      email: 'outsider@test.com',
      password: 'outsider-password',
      role: 'Client',
      company: 'Other company',
    },
  });
  await request('/api/action', {
    cookie,
    body: { type: 'approve', payload: { userId: outsider.body.user.id } },
  });
  const outsiderLogin = await request('/api/auth/login', {
    body: { email: 'outsider@test.com', password: 'outsider-password' },
  });
  const outsiderCookie = cookieOf(outsiderLogin);
  assert.equal((await fetch(url, { headers: { Cookie: outsiderCookie } })).status, 400);
  assert.equal((await request(`${pathBase}/conversation`, { cookie: outsiderCookie })).status, 400);
});

test('HTTP Store Code verification is public, store-bound and rate limited; initial ticket images use private storage', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'a2z-initial-images-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const { request, snapshot } = await serve(t, {
    attachmentStore: createAttachmentStore(directory),
  });
  const login = await request('/api/auth/login', {
    body: { email: 'owner@test.com', password: 'api-test-password' },
  });
  const cookie = cookieOf(login);
  const create = (type: string, payload: Payload) =>
    request('/api/action', { cookie, body: { type, payload } });
  const client = (await create('client', { name: 'QR Public Client' })).body.result;
  const store = (
    await create('store', {
      clientId: client.id,
      name: 'QR Public Store',
      address: 'QA Road',
      manager: 'Manager',
    })
  ).body.result;
  assert.equal(
    (await request('/api/public/verify', { body: { storeId: store.id, code: 'wrong' } })).status,
    400,
  );
  const verified = await request('/api/public/verify', {
    body: { storeId: store.id, code: store.storeCode },
  });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.store.storeCode, undefined);
  const payload = {
    token: verified.body.token,
    name: 'Guest',
    contact: 'guest@example.test',
    serviceId: 'test-service',
    dueDate: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
  };
  assert.equal((await request('/api/public/tickets', { body: payload })).status, 201);
  assert.equal((await request('/api/public/tickets', { body: payload })).status, 400);
  const png = {
    name: 'qa.png',
    base64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]).toString('base64'),
  };
  const ticket = await create('ticket', {
    storeId: store.id,
    serviceId: 'test-service',
    dueDate: payload.dueDate,
    images: [png],
  });
  assert.equal(ticket.status, 200);
  const saved = snapshot().tickets.find((item) => item.id === ticket.body.result.id)!;
  assert.equal(saved.attachments?.length, 1);
  assert.equal(
    saved.conversation?.find((entry) => entry.kind === 'message')?.attachmentIds?.[0],
    saved.attachments?.[0]?.id,
  );
  const imagePath = (
    await request(`/api/tickets/${saved.id}/conversation`, { cookie })
  ).body.messages.find((entry: Json) => entry.kind === 'message')!.attachments[0].url;
  assert.equal((await request(imagePath)).status, 401);
  const before = snapshot().tickets.length;
  assert.equal(
    (
      await create('ticket', {
        storeId: store.id,
        serviceId: 'test-service',
        dueDate: payload.dueDate,
        images: [{ name: 'bad.png', base64: 'aGVsbG8=' }],
      })
    ).status,
    400,
  );
  assert.equal(snapshot().tickets.length, before);
  let limited;
  for (let i = 0; i < 31; i++)
    limited = await request('/api/public/verify', { body: { storeId: store.id, code: 'wrong' } });
  assert.equal(limited?.status, 429);
});

test('React API client completes master setup, confirmed status write, assignment, close and invoice across sessions', async (t) => {
  const { base } = await serve(t);
  let cookie: string | undefined;
  const api = createApiClient(async (path, options) => {
    const response = await fetch(base + path, {
      ...options,
      headers: {
        ...(options.headers as Record<string, string>),
        ...(cookie ? { Cookie: cookie } : {}),
      },
    });
    const set = response.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return response;
  });
  await api.login({ email: 'owner@test.com', password: 'api-test-password' });
  assert.equal((await api.session()).user?.role, 'Admin');
  const { result: client } = await api.action('client', { name: 'Adapter QA Client' });
  const { result: store } = await api.action('store', {
    name: 'Adapter QA Store',
    clientId: client.id,
    manager: 'QA Manager',
    addressLine1: 'QA Road',
  });
  const { result: service } = await api.action('service', { name: 'Repair service' });
  const { result: worker } = await api.action('user', {
    role: 'Field Worker',
    name: 'Worker',
    email: 'api-worker@test.com',
    password: 'test-worker-password',
  });
  await api.action('clientStatus', { id: client.id, active: false });
  const draft = { storeId: store.id, serviceId: service.id, dueDate: '2030-12-31' };
  await assert.rejects(api.action('ticket', draft), /inactive/);
  await api.action('clientStatus', { id: client.id, active: true });
  const { result: ticket } = await api.action('ticket', draft);
  await api.action('assign', { ticketId: ticket.id, workerId: worker.id });
  await api.logout();
  await api.login({ email: 'api-worker@test.com', password: 'test-worker-password' });
  const assigned = await api.getState();
  assert.equal(assigned.tickets[0].id, ticket.id);
  await api.action('read', { userId: worker.id, notificationId: assigned.notifications[0].id });
  await api.action('comment', { ticketId: ticket.id, text: 'Work complete' });
  await api.action('close', { ticketId: ticket.id });
  await api.logout();
  await api.login({ email: 'owner@test.com', password: 'api-test-password' });
  const finished = await api.getState();
  assert.equal(finished.tickets[0].status, 'Closed');
  assert.equal(finished.invoices.length, 1);
  await api.action('invoice', { id: finished.invoices[0].id, amount: 1000, description: 'Repair' });
  assert.equal((await api.getState()).invoices[0].amount, 1000);
  assert.ok(
    (await api.getConversation(ticket.id)).messages.some(
      (message) => message.text === 'Work complete',
    ),
  );
});
