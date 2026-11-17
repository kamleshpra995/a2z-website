import { clientNameKey } from './clients.ts';
import type { User, WorkspaceState } from '../shared/types.ts';

/** An account to create at startup. Customer accounts name their company. */
export type ConfiguredAccount = User & { company?: string };

/** Idempotent account setup. Existing emails/passwords and all business records are preserved. */
export function seedAccounts(state: WorkspaceState, accounts: ConfiguredAccount[]): boolean {
  let changed = false;
  for (const configured of accounts) {
    if (state.users.some((user) => user.email?.toLowerCase() === configured.email.toLowerCase()))
      continue;
    // Never add another Admin when this workspace already has one with credentials.
    if (
      configured.role === 'Admin' &&
      state.users.some((user) => user.role === 'Admin' && user.passwordHash)
    )
      continue;
    const { company, ...user } = structuredClone(configured);
    if (user.role === 'Client') {
      let client = state.clients.find(
        (item) => clientNameKey(item.name) === clientNameKey(company),
      );
      if (!client) {
        client = {
          id: crypto.randomUUID(),
          name: String(company),
          contact: user.name,
          email: user.email,
          phone: '',
          address: '',
        };
        state.clients.push(client);
      }
      user.clientId = client.id;
    }
    if (user.role === 'Admin')
      state.users = state.users.filter((item) => !(item.id === 'admin' && !item.passwordHash));
    state.users.push(user);
    changed = true;
  }
  return changed;
}
