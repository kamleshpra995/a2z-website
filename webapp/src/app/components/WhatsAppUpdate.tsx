import { useEffect, useMemo, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import {
  whatsappJobText,
  whatsappLink,
  whatsappNumber,
  whatsappText,
  type TicketFacts,
} from '@shared/ticketMessages.ts';
import { displayDate } from '@shared/dates.ts';
import type { StoreView, TicketSummary, ViewUser } from '@shared/types.ts';

interface Recipient {
  key: string;
  label: string;
  name: string;
  phone: string;
  worker?: boolean;
}

interface WhatsAppUpdateProps {
  ticket: TicketSummary;
  store: StoreView | undefined;
  clientName: string;
  worker: ViewUser | undefined;
  /** Admin and Supervisor may also send the job to the assigned field worker. */
  canMessageWorker: boolean;
}

/**
 * "Send on WhatsApp": opens WhatsApp (app or web) with an update typed in for a store contact.
 * Free, no WhatsApp API: the staff member presses Send in WhatsApp themselves.
 */
export default function WhatsAppUpdate({
  ticket,
  store,
  clientName,
  worker,
  canMessageWorker,
}: WhatsAppUpdateProps) {
  const recipients = useMemo(() => {
    const list: Recipient[] = [];
    const add = (key: string, label: string, name = '', raw = '', isWorker = false) => {
      const phone = whatsappNumber(raw);
      if (phone && !list.some((item) => item.phone === phone))
        list.push({ key, label, name, phone, worker: isWorker });
    };
    add('manager', 'Store manager', store?.manager, store?.phone);
    add('contact', 'Store contact', store?.contactPerson, store?.contactPhone);
    if (ticket.raisedByContact)
      add('raiser', 'Raised by (QR)', ticket.raisedByContact.name, ticket.raisedByContact.contact);
    if (canMessageWorker && worker) add('worker', 'Field worker', worker.name, worker.phone, true);
    return list;
  }, [store, ticket.raisedByContact, worker, canMessageWorker]);
  const [key, setKey] = useState('');
  const recipient = recipients.find((item) => item.key === key) ?? recipients[0];
  const facts: TicketFacts = {
    number: ticket.number,
    status: ticket.status,
    service: ticket.serviceName || ticket.issue || 'Service request',
    store: store?.name || 'your store',
    client: clientName,
    worker: worker ? { name: worker.name, phone: worker.phone } : null,
  };
  const address = [store?.addressLine1 || store?.address, store?.addressLine2, store?.city]
    .filter(Boolean)
    .join(', ');
  const suggested = !recipient
    ? ''
    : recipient.worker
      ? whatsappJobText(facts, {
          workerName: recipient.name,
          address,
          contact: [store?.manager, store?.phone].filter(Boolean).join(', '),
          dueDate: ticket.dueDate ? displayDate(ticket.dueDate) : '',
          problem: ticket.description,
        })
      : whatsappText(facts, recipient.name);
  const [text, setText] = useState(suggested);
  // A new recipient or ticket status starts again from the suggested message.
  useEffect(() => setText(suggested), [recipient?.key, ticket.status, ticket.workerId]);

  return (
    <section className="whatsapp-update">
      <h4>
        <MessageCircle size={16} /> Send update on WhatsApp
      </h4>
      {recipients.length === 0 ? (
        <p className="info-note">
          Add the store manager’s or contact person’s phone number to the store to send WhatsApp
          updates.
        </p>
      ) : (
        <>
          <label className="field">
            Send to
            <select value={recipient?.key} onChange={(event) => setKey(event.target.value)}>
              {recipients.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}: {item.name || 'No name'} (+{item.phone})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Message
            <textarea
              rows={6}
              value={text}
              maxLength={1500}
              onChange={(event) => setText(event.target.value)}
            />
          </label>
          <a
            className="outline whatsapp-button"
            href={recipient ? whatsappLink(recipient.phone, text) : undefined}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle size={17} /> Open in WhatsApp
          </a>
          <small className="whatsapp-hint">
            Opens WhatsApp with this message typed in. Press Send there.
          </small>
        </>
      )}
    </section>
  );
}
