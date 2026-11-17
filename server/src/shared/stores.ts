import { businessDate } from './dates.ts';
import type { Client, Payload, StoreLocation } from './types.ts';

const text = (value: unknown): string => String(value ?? '').trim();

/** Validate and normalise a store's address/location fields. Unknown input is never trusted. */
export function locationFields(input: object, existing: object | null = {}): StoreLocation {
  const payload = input as Payload;
  const current = (existing || {}) as Payload;
  const data: Payload = { ...current, ...payload };
  const addressLine1 = text(
    payload.addressLine1 ?? payload.address ?? current.addressLine1 ?? current.address,
  );
  if (!addressLine1) throw Error('Store Address Line 1 is required.');
  if (addressLine1.length > 350 || text(data.addressLine2).length > 350)
    throw Error('Each address line must be 350 characters or fewer.');
  let mapLink = text(data.mapLink);
  if (mapLink) {
    let url: URL;
    try {
      url = new URL(mapLink);
    } catch {
      throw Error('Enter a valid Google Maps link starting with https://.');
    }
    if (!['http:', 'https:'].includes(url.protocol) || mapLink.length > 600)
      throw Error('Use a valid HTTP/HTTPS map link (up to 600 characters).');
    mapLink = url.href;
  }
  const coordinate = (value: unknown, label: string, min: number, max: number) => {
    if (text(value) === '') return null;
    const result = Number(value);
    if (!Number.isFinite(result) || result < min || result > max)
      throw Error(`${label} must be between ${min} and ${max}.`);
    return result;
  };
  const latitude = coordinate(data.latitude, 'Latitude', -90, 90);
  const longitude = coordinate(data.longitude, 'Longitude', -180, 180);
  if ((latitude === null) !== (longitude === null))
    throw Error('Enter both latitude and longitude, or leave both empty.');
  const registeredOn = text(data.registeredOn);
  if (
    registeredOn &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(registeredOn) ||
      !Number.isFinite(Date.parse(registeredOn)) ||
      new Date(registeredOn).toISOString().slice(0, 10) !== registeredOn ||
      registeredOn > businessDate())
  )
    throw Error('Choose a valid Registered On date on or before today.');
  const zip = text(data.zip);
  if (zip && !/^[a-z0-9 -]{3,12}$/i.test(zip)) throw Error('Enter a valid ZIP/postal code.');
  if (data.active !== undefined && typeof data.active !== 'boolean')
    throw Error('Select Active or Inactive.');
  return {
    city: text(data.city),
    state: text(data.state),
    zip,
    registeredOn,
    active: data.active !== false,
    address: addressLine1,
    addressLine1,
    addressLine2: text(data.addressLine2),
    contactPerson: text(data.contactPerson).slice(0, 150),
    contactPhone: text(data.contactPhone).slice(0, 50),
    mapLink,
    latitude,
    longitude,
  };
}

/** A self-contained text QR is readable on another phone without access to the app. */
export function storeQrText(
  input: object,
  client: Pick<Client, 'name' | 'active'> | null | undefined,
): string {
  const store = input as Payload;
  if (!client?.name || !text(store.name))
    throw Error('Select a client and enter the store name before viewing the QR.');
  const fields = locationFields(store);
  const maps =
    fields.mapLink ||
    (fields.latitude !== null
      ? `https://www.google.com/maps?q=${fields.latitude},${fields.longitude}`
      : '');
  const lines = [
    'A2Z STORE DETAILS',
    `Client: ${client.name}`,
    `Client status: ${client.active === false ? 'Inactive' : 'Active'}`,
    `Store: ${text(store.name)}`,
    `Address Line 1: ${fields.addressLine1}`,
    `Address Line 2: ${fields.addressLine2 || '—'}`,
    `City: ${fields.city || '—'}`,
    `State: ${fields.state || '—'}`,
    `ZIP: ${fields.zip || '—'}`,
    `Store status: ${fields.active ? 'Active' : 'Inactive'}`,
    `Registered On: ${fields.registeredOn || '—'}`,
    `Store Manager: ${text(store.manager) || '—'}`,
    `Manager Phone: ${text(store.phone) || '—'}`,
    `Contact Person: ${fields.contactPerson || '—'}`,
    `Contact Phone: ${fields.contactPhone || '—'}`,
    `Google Maps: ${maps || '—'}`,
    `Latitude: ${fields.latitude ?? '—'}`,
    `Longitude: ${fields.longitude ?? '—'}`,
  ];
  const result = lines.join('\n');
  if (new TextEncoder().encode(result).length > 1800)
    throw Error('Store details are too long for a readable QR. Shorten the address or map link.');
  return result;
}
