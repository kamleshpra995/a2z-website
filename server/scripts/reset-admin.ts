// Create the Super Admin, or reset its email and password, from ADMIN_NAME / ADMIN_EMAIL /
// ADMIN_PASSWORD in server/.env. Run: npm run admin:reset -w server
// Existing Admin sessions are signed out. Business records are not touched.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { connectWorkspaceStore } from '../src/storage/database.ts';
import { createAdmin, normalizeEmail, setPassword, validateAccount } from '../src/domain/auth.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
const { MONGODB_URI, MONGODB_DB, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!MONGODB_URI || !ADMIN_EMAIL || !ADMIN_PASSWORD)
  throw Error('Set MONGODB_URI, ADMIN_EMAIL and ADMIN_PASSWORD in server/.env first.');
try {
  const store = await connectWorkspaceStore(MONGODB_URI, MONGODB_DB);
  if (!store.available) throw Error('Database is not configured.');
  const state = await store.load();
  const admin = state.users.find((user) => user.role === 'Admin' && user.passwordHash);
  const name = ADMIN_NAME || admin?.name || 'A2Z Admin';
  if (!admin) {
    await createAdmin(state, { name, email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    console.log(`Super Admin created: ${normalizeEmail(ADMIN_EMAIL)}`);
  } else {
    const email = validateAccount(state, { name, email: ADMIN_EMAIL }, admin.id);
    const previous = admin.email;
    Object.assign(admin, { name, email, accountStatus: 'Active' });
    await setPassword(admin, ADMIN_PASSWORD);
    state.sessions = (state.sessions || []).filter((session) => session.userId !== admin.id);
    console.log(
      `Super Admin updated: ${previous === email ? email : `${previous} → ${email}`}. Password reset.`,
    );
  }
  await store.save(state);
  console.log('Sign in at /portal/ with ADMIN_EMAIL and ADMIN_PASSWORD from server/.env.');
} finally {
  await mongoose.disconnect();
}
