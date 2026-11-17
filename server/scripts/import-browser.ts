// Import an offline export made by scripts/export-browser.js into an empty workspace.
// Usage: npm run import:browser -w server -- <export.json> [--apply]
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { connectWorkspaceStore } from '../src/storage/database.ts';
import { createAttachmentStore } from '../src/storage/attachments.ts';
import { planBrowserImport, applyBrowserImport } from '../src/migration/browserImport.ts';
import type { Attachment } from '../src/shared/types.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
const [file, apply] = process.argv.slice(2);
if (!file || !process.env.MONGODB_URI)
  throw Error('Set MONGODB_URI and pass the export path. Add --apply to commit.');
const attachments = createAttachmentStore(process.env.UPLOAD_DIR || path.join(root, 'uploads'));
const saved: Attachment[] = [];
try {
  const store = await connectWorkspaceStore(process.env.MONGODB_URI, process.env.MONGODB_DB);
  if (!store.available) throw Error('Database is not configured.');
  const state = await store.load();
  const plan = planBrowserImport(state, await readFile(file, 'utf8'));
  if (!plan) console.log('This export was already imported. No records changed.');
  else {
    console.log(
      Object.fromEntries(Object.entries(plan.data).map(([key, rows]) => [key, rows.length])),
    );
    console.log(`Attachments: ${plan.files.length}`);
    if (apply === '--apply') {
      await applyBrowserImport(state, plan, attachments, saved);
      await store.save(state);
      console.log('Import completed. Provision new passwords for imported accounts.');
    } else console.log('Dry run only. Add --apply to commit.');
  }
} catch (error) {
  await Promise.allSettled(saved.map((item) => attachments.remove(item)));
  throw error;
} finally {
  await mongoose.disconnect();
}
