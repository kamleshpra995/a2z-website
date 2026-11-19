/**
 * Wording for ticket updates sent outside the portal (email, WhatsApp). Shared so the server's
 * emails and the webapp's "Send on WhatsApp" button say the same thing.
 */
import type { TicketStatus } from './types.ts';

export const COMPANY = 'A2Z Power Solution';
export const SUPPORT_PHONE = '+91 70000 10205';

export interface TicketFacts {
  number: string;
  status: TicketStatus;
  service: string;
  store: string;
  client: string;
  /** Assigned field worker, when there is one. */
  worker?: { name: string; phone?: string } | null;
}

/** One line describing the ticket's current state, written for the customer. */
export function statusLine(ticket: TicketFacts): string {
  const worker = ticket.worker
    ? `${ticket.worker.name}${ticket.worker.phone ? ` (${ticket.worker.phone})` : ''}`
    : '';
  switch (ticket.status) {
    case 'Pending':
      return 'We have received your request and will assign a technician shortly.';
    case 'Assigned':
      return worker
        ? `Technician ${worker} has been assigned and will contact the store.`
        : 'A technician has been assigned.';
    case 'Resolved':
      return 'The service work has been completed. Please contact us if the problem continues.';
    case 'Closed':
      return 'This ticket is now closed. Thank you for choosing us.';
  }
}

/** A ready-to-send WhatsApp message for the store / customer contact. */
export function whatsappText(ticket: TicketFacts, greetingName?: string): string {
  return [
    `Hello${greetingName ? ' ' + greetingName : ''},`,
    `${COMPANY} update for ticket ${ticket.number}`,
    `${ticket.service} at ${ticket.store}`,
    `Status: ${ticket.status}. ${statusLine(ticket)}`,
    `For help call ${SUPPORT_PHONE}.`,
  ].join('\n');
}

/** A WhatsApp message giving a field worker the job details. */
export function whatsappJobText(
  ticket: TicketFacts,
  job: {
    workerName: string;
    address?: string;
    contact?: string;
    dueDate?: string;
    problem?: string;
  },
): string {
  return [
    `Hello ${job.workerName},`,
    `New job ${ticket.number}: ${ticket.service}`,
    `Store: ${ticket.store}${ticket.client ? ` (${ticket.client})` : ''}`,
    ...(job.address ? [`Address: ${job.address}`] : []),
    ...(job.contact ? [`Contact: ${job.contact}`] : []),
    ...(job.dueDate ? [`Due: ${job.dueDate}`] : []),
    ...(job.problem ? [`Problem: ${job.problem}`] : []),
    'Details are in the A2Z portal.',
  ].join('\n');
}

/**
 * A phone number in the international digits-only form wa.me expects, or null.
 * Ten-digit numbers are treated as Indian mobile numbers.
 */
export function whatsappNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);
  digits = digits.replace(/\D/g, '');
  if (digits.length === 10) digits = '91' + digits;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

/** A link that opens WhatsApp (app or web) with the message typed in, ready to send. */
export function whatsappLink(phone: string, text: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

/** True for something that looks like a single email address. */
export const isEmail = (value: string | null | undefined): value is string =>
  !!value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
