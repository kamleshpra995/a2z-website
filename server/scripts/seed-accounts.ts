// Set a password for one account. Put ACCOUNT_EMAIL and ACCOUNT_PASSWORD in the server
// environment temporarily, run `npm run account:password -w server`, then remove them.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { connectWorkspaceStore } from '../src/storage/database.ts';
import { normalizeEmail, setPassword } from '../src/domain/auth.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
const { MONGODB_URI, MONGODB_DB, ACCOUNT_EMAIL, ACCOUNT_PASSWORD } = process.env;
if (!MONGODB_URI || !ACCOUNT_EMAIL || !ACCOUNT_PASSWORD)
  throw Error('Set MONGODB_URI, ACCOUNT_EMAIL and ACCOUNT_PASSWORD on the server.');
try {
  const store = await connectWorkspaceStore(MONGODB_URI, MONGODB_DB);
  if (!store.available) throw Error('Database is not configured.');
  const state = await store.load();
  const user = state.users.find(
    (item) => normalizeEmail(item.email) === normalizeEmail(ACCOUNT_EMAIL),
  );
  if (!user) throw Error('Account not found.');
  await setPassword(user, ACCOUNT_PASSWORD);
  state.sessions = (state.sessions || []).filter((session) => session.userId !== user.id);
  await store.save(state);
  console.log('Password saved. Existing sessions for this account were revoked.');
} finally {
  await mongoose.disconnect();
}
