import type { Payload } from '../shared/types.ts';

const limits: Record<string, number> = {
  name: 200,
  company: 200,
  email: 254,
  password: 128,
  phone: 80,
  contact: 200,
  contactPerson: 150,
  contactPhone: 80,
  contactName: 150,
  contactRole: 100,
  issue: 500,
  description: 8000,
  text: 8000,
  reason: 2000,
  website: 1000,
  address: 700,
  addressLine1: 350,
  addressLine2: 350,
  city: 150,
  state: 150,
  manager: 200,
  mapLink: 600,
  zip: 20,
  code: 32,
  token: 128,
};

/** Reject object/array coercion and bound fields before domain validation. */
export function validateFields(body: Payload): void {
  for (const [key, max] of Object.entries(limits)) {
    const value = body[key];
    if (value !== undefined && value !== null && (typeof value !== 'string' || value.length > max))
      throw Error(`${key} must be text with at most ${max} characters.`);
  }
}
