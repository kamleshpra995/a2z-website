import { authenticatedAction } from './auth.ts';
import { applyAction } from './actions.ts';
import type {
  Actor,
  Payload,
  PublicTicketReceipt,
  VerifiedStore,
  WorkspaceState,
} from '../shared/types.ts';

const hash = async (value: string): Promise<string> =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');

function availableStore(state: WorkspaceState, id: unknown) {
  const store = state.stores.find(
    (item) => item.id === id && !item.deletedAt && item.active !== false,
  );
  const client =
    store &&
    state.clients.find(
      (item) => item.id === store.clientId && !item.deletedAt && item.active !== false,
    );
  if (!store || !client || !store.storeCode)
    throw Error('Store unavailable or verification failed.');
  return { store, client, storeCode: store.storeCode };
}

export async function verifyStoreCode(
  state: WorkspaceState,
  { storeId, code }: Payload,
): Promise<VerifiedStore> {
  const { store, client, storeCode } = availableStore(state, storeId);
  if (typeof code !== 'string' || code.trim().toUpperCase() !== storeCode)
    throw Error('Store unavailable or verification failed.');
  const token = crypto.randomUUID() + crypto.randomUUID();
  state.publicGrants = (state.publicGrants || []).filter((item) => item.expiresAt > Date.now());
  state.publicGrants.push({
    hash: await hash(token),
    storeId: store.id,
    codeHash: await hash(storeCode),
    expiresAt: Date.now() + 15 * 60 * 1000,
  });
  return {
    token,
    expiresIn: 900,
    store: {
      id: store.id,
      name: store.name,
      addressLine1: store.addressLine1 || store.address,
      addressLine2: store.addressLine2,
      city: store.city,
      state: store.state,
      zip: store.zip,
      manager: store.manager,
      phone: store.phone,
      contactPerson: store.contactPerson,
      contactPhone: store.contactPhone,
      mapLink: store.mapLink,
      latitude: store.latitude,
      longitude: store.longitude,
      active: store.active !== false,
      registeredOn: store.registeredOn,
    },
    client: { name: client.name },
    services: (state.services || [])
      .filter((item) => item.active !== false)
      .map(({ id, name }) => ({ id, name })),
  };
}

export async function raisePublicTicket(
  state: WorkspaceState,
  payload: Payload,
): Promise<PublicTicketReceipt> {
  if (typeof payload.token !== 'string') throw Error('Verify the Store Code again.');
  const tokenHash = await hash(payload.token);
  const grant = (state.publicGrants || []).find(
    (item) => item.hash === tokenHash && item.expiresAt > Date.now(),
  );
  if (!grant) throw Error('Verification expired or already used. Verify the Store Code again.');
  const { store, client, storeCode } = availableStore(state, grant.storeId);
  if (grant.codeHash !== (await hash(storeCode))) throw Error('Store Code changed. Verify again.');
  const name = String(payload.name || '').trim();
  const contact = String(payload.contact || '').trim();
  if (!name || name.length > 100 || !contact || contact.length > 150)
    throw Error('Enter your name and contact number/email.');
  const description = String(payload.description || '').trim();
  if (description.length > 4000) throw Error('Description must be 4000 characters or fewer.');
  if (!payload.serviceId) throw Error('Select a service.');
  const guest: Actor = {
    id: `guest:${crypto.randomUUID()}`,
    name,
    role: 'Client',
    clientId: client.id,
  };
  const ticket = await authenticatedAction(
    state,
    guest,
    'ticket',
    {
      storeId: store.id,
      serviceId: payload.serviceId,
      dueDate: payload.dueDate,
      priority: 'Low',
      description,
    },
    applyAction,
  );
  ticket.source = 'Store QR';
  ticket.raisedByContact = { name, contact };
  state.publicGrants = (state.publicGrants || []).filter((item) => item.hash !== tokenHash);
  return { number: ticket.number, status: ticket.status };
}
