import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createAttachmentStore } from '../src/storage/attachments.ts';
import { validateAttachment } from '../src/shared/attachmentValidation.ts';
test('private attachment store writes under ticket directory and validates paths/content/size', async (t) => {
  const prefix = path.join(os.tmpdir(), 'a2z-conversation-');
  const root = await mkdtemp(prefix);
  t.after(async () => {
    if (!root.startsWith(prefix)) throw Error('Unexpected cleanup path');
    await rm(root, { recursive: true, force: true });
  });
  const store = createAttachmentStore(root);
  const file = await store.save(
    'ticket-1',
    { name: 'repair-notes.txt', base64: Buffer.from('Test notes').toString('base64') },
    'author',
  );
  assert.equal(file.name, 'repair-notes.txt');
  assert.ok(file.storagePath?.startsWith('tickets/ticket-1/'));
  assert.equal(await readFile(store.absolutePath(file), 'utf8'), 'Test notes');
  assert.throws(() => store.absolutePath({ storagePath: '../private.txt' }), /Invalid/);
  await assert.rejects(
    () => store.save('../escape', { name: 'notes.txt', base64: 'dGVzdA==' }, 'author'),
    /Invalid/,
  );
  assert.throws(() => validateAttachment({ name: 'fake.pdf', base64: 'dGVzdA==' }), /content/);
  assert.throws(() => validateAttachment({ name: 'run.exe', base64: 'dGVzdA==' }), /Use/);
  assert.throws(() => validateAttachment({ name: 'big.txt', base64: 'A'.repeat(3000000) }), /2 MB/);
  const docx = validateAttachment({
    name: 'notes.docx',
    base64: Buffer.from([80, 75, 3, 4, 0, 0]).toString('base64'),
  });
  assert.ok(docx.mime.includes('wordprocessingml'));
});
