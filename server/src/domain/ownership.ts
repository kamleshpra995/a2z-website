import type { WorkspaceState } from '../shared/types.ts';

/** The parts of an account that decide which customer records it may see. */
export interface CustomerScope {
  id: string;
  clientId?: string;
  managedStoreId?: string | null;
}

/** Support Customer-owned client masters while retaining legacy company membership. */
export function ownedClientIds(state: Pick<WorkspaceState, 'clients'>, user: CustomerScope) {
  return new Set(
    state.clients
      .filter((client) => client.ownerUserId === user.id || client.id === user.clientId)
      .map((client) => client.id),
  );
}

/** A store assignment narrows existing customer ownership to a single location. */
export function canAccessCustomerStore(
  state: Pick<WorkspaceState, 'clients' | 'stores'>,
  user: CustomerScope,
  { clientId, storeId }: { clientId: string; storeId: string },
): boolean {
  if (!ownedClientIds(state, user).has(clientId)) return false;
  if (!Object.hasOwn(user, 'managedStoreId')) return true;
  return Boolean(
    user.managedStoreId &&
    user.managedStoreId === storeId &&
    state.stores.some(
      (store) => store.id === storeId && store.clientId === clientId && !store.deletedAt,
    ),
  );
}
