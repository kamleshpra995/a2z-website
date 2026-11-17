import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { connectWorkspaceStore } from '../src/storage/database.ts';
import { createState } from '../src/domain/state.ts';
import type { Client } from '../src/shared/types.ts';

const uri = process.env.TEST_MONGODB_URI;
test(
  'MongoDB migrates legacy workspace, preserves ordering and rejects stale writes',
  { skip: !uri && 'Set TEST_MONGODB_URI to run against an Atlas test cluster or replica set' },
  async (t) => {
    const db = `a2z_test_${randomUUID().replaceAll('-', '')}`;
    t.after(async () => {
      try {
        if (mongoose.connection.name === db && mongoose.connection.readyState === 1)
          await mongoose.connection.dropDatabase();
      } finally {
        await mongoose.disconnect();
      }
    });
    const store = await connectWorkspaceStore(uri, db);
    if (!store.available) throw Error('MongoDB store is unavailable.');
    const legacy = { ...createState(), clients: [{ id: 'existing', name: 'Legacy record' }] };
    await mongoose.connection
      .collection<{ _id: string; state: unknown }>('workspaces')
      .insertOne({ _id: 'main', state: legacy });
    const first = await store.load();
    const stale = await store.load();
    first.clients.unshift({ id: 'new', name: 'Newest first' });
    await store.save(first);
    assert.deepEqual(
      (await store.load()).clients.map((row: Client) => row.id),
      ['new', 'existing'],
    );
    stale.clients.push({ id: 'stale', name: 'Stale save' });
    await assert.rejects(store.save(stale), { status: 409 });
    assert.equal(await mongoose.connection.collection('a2z_clients').countDocuments(), 2);
    assert.equal(await mongoose.connection.collection('workspaces').countDocuments(), 1);
  },
);
