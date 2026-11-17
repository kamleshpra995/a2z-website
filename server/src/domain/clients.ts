import { businessDate } from '../shared/dates.ts';
import type { Payload } from '../shared/types.ts';

export const clientNameKey = (name: unknown): string =>
  String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

export interface ClientDetails {
  website: string;
  addedOn: string;
  image: string;
  city: string;
  state: string;
}

/** Optional legacy fields stay empty until an Admin supplies the actual business start date. */
export function clientDetails(input: object, existing: object = {}): ClientDetails {
  const data: Payload = { ...(existing as Payload), ...(input as Payload) };
  const website = String(data.website || '').trim();
  if (website) {
    let url: URL;
    try {
      url = new URL(website);
    } catch {
      throw Error('Enter a valid website with https://.');
    }
    if (!['http:', 'https:'].includes(url.protocol)) throw Error('Website must use HTTP or HTTPS.');
  }
  const addedOn = String(data.addedOn || '');
  if (
    addedOn &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(addedOn) ||
      !Number.isFinite(Date.parse(addedOn)) ||
      new Date(addedOn).toISOString().slice(0, 10) !== addedOn ||
      addedOn > businessDate())
  )
    throw Error('Added On must be a valid date on or before today.');
  const image = String(data.image || '');
  if (
    image &&
    (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > 2800000)
  )
    throw Error('Choose a JPG, PNG or WebP client image under 2 MB.');
  if (data.active !== undefined && typeof data.active !== 'boolean')
    throw Error('Select Active or Inactive.');
  return {
    website,
    addedOn,
    image,
    city: String(data.city || '').trim(),
    state: String(data.state || '').trim(),
  };
}
