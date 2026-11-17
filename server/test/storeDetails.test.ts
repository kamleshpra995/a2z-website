import test from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import jsQRImport from 'jsqr';
import { actionRunner, createState, loose } from './fixtures.ts';
import { applyAction } from '../src/domain/actions.ts';
import { locationFields, storeQrText } from '../src/shared/stores.ts';
import { createStorage } from './legacyStorageFixture.ts';
import type { User } from '../src/shared/types.ts';
// jsqr ships CommonJS: at runtime the default import is the decoder function itself.
const jsQR = jsQRImport as unknown as typeof import('jsqr').default;
function fixture() {
  const state = createState();
  const admin = loose<User>({ id: 'admin', name: 'Admin', role: 'Admin', accountStatus: 'Active' });
  const customer = loose<User>({
    id: 'customer',
    name: 'Customer',
    role: 'Client',
    accountStatus: 'Active',
  });
  state.users = [admin, customer];
  const act = actionRunner(state);
  return { state, admin, customer, act };
}
test('Admin client status blocks new stores/tickets but preserves history and active follow-ups', async () => {
  const { state, admin, customer, act } = fixture();
  const client = await act(admin, 'client', { name: 'Client' });
  customer.clientId = client.id;
  assert.equal(client.active, true);
  const store = await act(admin, 'store', {
    clientId: client.id,
    name: 'Branch',
    manager: 'Manager',
    address: 'Legacy address',
  });
  const ticket = await act(customer, 'ticket', {
    storeId: store.id,
    serviceId: 'test-service',
    dueDate: '2030-12-31',
  });
  await assert.rejects(
    () => act(customer, 'clientStatus', { id: client.id, active: false }),
    /permission/,
  );
  await act(admin, 'clientStatus', { id: client.id, active: false });
  assert.equal(client.active, false);
  await assert.rejects(
    () =>
      act(customer, 'ticket', {
        storeId: store.id,
        serviceId: 'test-service',
        dueDate: '2030-12-31',
      }),
    /inactive/,
  );
  await assert.rejects(
    () =>
      act(admin, 'store', {
        clientId: client.id,
        name: 'Other branch',
        manager: 'Manager',
        addressLine1: 'Address',
      }),
    /Enable/,
  );
  await act(customer, 'comment', { ticketId: ticket.id, text: 'Following up on the existing job' });
  assert.equal(state.tickets.length, 1);
  assert.equal(state.stores.length, 1);
  await act(admin, 'client', { id: client.id, name: 'Edited Client' });
  assert.equal(client.active, false);
  await act(admin, 'clientStatus', { id: client.id, active: true });
  await act(customer, 'ticket', {
    storeId: store.id,
    serviceId: 'test-service',
    dueDate: '2030-12-31',
  });
  assert.equal(state.tickets.length, 2);
});
test('Store updates preserve legacy address and optional fields while validating location', () => {
  const state = createState();
  const client = applyAction(state, 'client', { name: 'Company' });
  const store = applyAction(state, 'store', {
    clientId: client.id,
    name: 'Branch',
    address: 'Address 1',
    manager: 'Manager',
    addressLine2: 'Floor 2',
    contactPerson: 'Contact',
    contactPhone: '12345',
    mapLink: 'https://maps.google.com/?q=0,0',
    latitude: 0,
    longitude: 0,
  });
  assert.equal(store.addressLine1, 'Address 1');
  assert.equal(store.address, 'Address 1');
  assert.equal(store.latitude, 0);
  applyAction(state, 'store', {
    id: store.id,
    clientId: client.id,
    name: 'Updated Branch',
    manager: 'Manager',
    addressLine1: 'Updated address',
  });
  assert.equal(store.addressLine2, 'Floor 2');
  assert.equal(store.contactPerson, 'Contact');
  assert.equal(store.longitude, 0);
  assert.equal(state.stores.length, 1);
  assert.throws(() => locationFields({ addressLine1: '' }), /required/);
  assert.throws(
    () => locationFields({ addressLine1: 'A', latitude: 91, longitude: 10 }),
    /Latitude/,
  );
  assert.throws(() => locationFields({ addressLine1: 'A', latitude: 10 }), /both/);
  assert.throws(
    () => locationFields({ addressLine1: 'A', mapLink: 'javascript:alert(1)' }),
    /HTTP/,
  );
  assert.equal(locationFields({ address: 'Old address' }).addressLine2, '');
});
test('Store QR round-trips through an independent decoder with contact/address/map/coordinate details', () => {
  const text = storeQrText(
    {
      name: 'Test Store',
      addressLine1: 'Raj Nagar',
      addressLine2: 'Floor 2',
      manager: 'Manager Name',
      phone: '11111',
      contactPerson: 'Contact Name',
      contactPhone: '22222',
      latitude: 28.67,
      longitude: 77.43,
    },
    { name: 'Client Name', active: true },
  );
  assert.ok(text.includes('\n'));
  assert.ok(!text.includes('\\n'));
  for (const value of [
    'Client Name',
    'Test Store',
    'Floor 2',
    'Manager Name',
    '11111',
    'Contact Name',
    '22222',
    '28.67',
    '77.43',
    'https://www.google.com/maps?q=28.67,77.43',
  ])
    assert.ok(text.includes(value));
  const matrix = QRCode.create(text, { errorCorrectionLevel: 'M' }).modules;
  const scale = 4;
  const border = 4;
  const side = (matrix.size + border * 2) * scale;
  const pixels = new Uint8ClampedArray(side * side * 4);
  pixels.fill(255);
  for (let y = 0; y < matrix.size; y++)
    for (let x = 0; x < matrix.size; x++)
      if (matrix.get(y, x))
        for (let dy = 0; dy < scale; dy++)
          for (let dx = 0; dx < scale; dx++) {
            const offset = (((y + border) * scale + dy) * side + (x + border) * scale + dx) * 4;
            pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
          }
  const decoded = jsQR(pixels, side, side);
  assert.ok(decoded);
  assert.equal(decoded.data, text);
  assert.throws(
    () => storeQrText({ name: 'S', address: 'A' + 'x'.repeat(400) }, { name: 'C' }),
    /350/,
  );
});
test('Client status and extended store details persist across local adapter reloads', async () => {
  const map = new Map();
  const localStorage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => map.set(key, value),
    removeItem: (key: string) => map.delete(key),
  };
  const storage = createStorage({ localStorage });
  await storage.setup({ name: 'Admin', email: 'admin@test.com', password: 'test-password-123' });
  await storage.login({ email: 'admin@test.com', password: 'test-password-123' });
  const client = (await storage.action('client', { name: 'Saved client' })).result;
  await storage.action('store', {
    clientId: client.id,
    name: 'Saved store',
    manager: 'Manager',
    addressLine1: 'Line 1',
    addressLine2: 'Line 2',
    contactPerson: 'Person',
    contactPhone: '123',
    latitude: 28.6,
    longitude: 77.2,
  });
  await storage.action('clientStatus', { id: client.id, active: false });
  const state = await createStorage({ localStorage }).getState();
  assert.equal(state.clients[0].active, false);
  assert.equal(state.stores[0].contactPhone, '123');
  assert.equal(state.stores[0].addressLine2, 'Line 2');
  assert.equal(state.stores[0].longitude, 77.2);
});
