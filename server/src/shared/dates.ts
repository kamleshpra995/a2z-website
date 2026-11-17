import type { Payload } from './types.ts';

/** Business dates use India time on both server and browser, independent of host timezone. */
export function businessDate(value: string | number | Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isIsoDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

export function validateTicketDates(payload: Payload): { raisedOn: string; dueDate: string } {
  const today = businessDate();
  if ((payload.raisedOn || today) !== today) throw Error('Raised On must be today’s date.');
  const raisedOn = today;
  const dueDate = String(payload.dueDate || '');
  if (!isIsoDate(dueDate)) throw Error('Choose a valid Due Date for resolution.');
  if (dueDate < raisedOn) throw Error('Due Date cannot be before Raised On.');
  return { raisedOn, dueDate };
}

export function displayDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = value.includes('T') ? businessDate(value) : value;
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}
