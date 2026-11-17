import { useState, type FormEvent } from 'react';
import { businessDate } from '@shared/dates.ts';
import type { PublicTicketReceipt, VerifiedStore } from '@shared/types.ts';
import { storage } from '../storage.ts';

interface PublicDraft {
  name: string;
  contact: string;
  serviceId: string;
  dueDate: string;
  description: string;
}

export default function PublicTicketPage({ storeId }: { storeId: string }) {
  const [code, setCode] = useState('');
  const [verified, setVerified] = useState<VerifiedStore | null>(null);
  const [draft, setDraft] = useState<PublicDraft>({
    name: '',
    contact: '',
    serviceId: '',
    dueDate: '',
    description: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<PublicTicketReceipt | null>(null);
  const update = (key: keyof PublicDraft, value: string) =>
    setDraft((previous) => ({ ...previous, [key]: value }));
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      setVerified(await storage.verifyStore({ storeId, code }));
      setCode('');
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!verified) return;
    setBusy(true);
    setError('');
    try {
      setReceipt(await storage.raisePublicTicket({ ...draft, token: verified.token }));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="public-ticket-page">
      <section className="section-card public-ticket-card">
        <h1>{receipt ? 'Ticket raised' : verified ? 'New Ticket' : 'Verify Store Code'}</h1>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {receipt ? (
          <div role="status">
            <h2>{receipt.number}</h2>
            <p>Status: {receipt.status}</p>
            <p>
              Your service request has been sent to the team. Keep this ticket number for follow-up.
            </p>
          </div>
        ) : !verified ? (
          <form onSubmit={verify}>
            <p>Enter the Store Code provided by the store manager to continue.</p>
            <label className="field">
              Store Code
              <input
                required
                autoComplete="off"
                maxLength={32}
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? 'Verifying…' : 'Verify Store'}
            </button>
          </form>
        ) : (
          <form onSubmit={submit}>
            <div className="public-store-summary">
              <strong>{verified.client.name}</strong>
              <p>{verified.store.name}</p>
              <p>
                {[
                  verified.store.addressLine1,
                  verified.store.addressLine2,
                  verified.store.city,
                  verified.store.state,
                  verified.store.zip,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </p>
            </div>
            <details className="public-store-details">
              <summary>More store details</summary>
              <dl className="detail-list">
                <dt>Manager</dt>
                <dd>
                  {verified.store.manager || '—'} · {verified.store.phone || '—'}
                </dd>
                <dt>Contact person</dt>
                <dd>
                  {verified.store.contactPerson || '—'} · {verified.store.contactPhone || '—'}
                </dd>
                <dt>Coordinates</dt>
                <dd>
                  {verified.store.latitude ?? '—'}, {verified.store.longitude ?? '—'}
                </dd>
                <dt>Registered On</dt>
                <dd>{verified.store.registeredOn || '—'}</dd>
              </dl>
              {verified.store.mapLink && (
                <a href={verified.store.mapLink} target="_blank" rel="noopener noreferrer">
                  Open Google Maps
                </a>
              )}
            </details>
            <p className="hint">
              Client and store details are read-only. Verification is valid for 15 minutes.
            </p>
            <div className="form-grid">
              <label className="field">
                Your name *
                <input
                  required
                  maxLength={100}
                  value={draft.name}
                  onChange={(event) => update('name', event.target.value)}
                />
              </label>
              <label className="field">
                Phone / Email *
                <input
                  required
                  maxLength={150}
                  value={draft.contact}
                  onChange={(event) => update('contact', event.target.value)}
                />
              </label>
            </div>
            <label className="field">
              Service *
              <select
                required
                value={draft.serviceId}
                onChange={(event) => update('serviceId', event.target.value)}
              >
                <option value="">Select service</option>
                {verified.services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
            </label>
            {!verified.services.length && (
              <p className="hint">No services available. Please contact the store manager.</p>
            )}
            <div className="form-grid">
              <label className="field">
                Raised On
                <input readOnly value={businessDate()} />
              </label>
              <label className="field">
                Due Date *
                <input
                  type="date"
                  required
                  min={businessDate()}
                  value={draft.dueDate}
                  onChange={(event) => update('dueDate', event.target.value)}
                />
              </label>
            </div>
            <label className="field">
              Description
              <textarea
                rows={3}
                maxLength={4000}
                value={draft.description}
                onChange={(event) => update('description', event.target.value)}
              />
            </label>
            <p>Priority: Low · Status: Pending · Number generated when saved</p>
            <button className="primary" disabled={busy || !verified.services.length}>
              {busy ? 'Saving…' : 'Raise Ticket'}
            </button>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                setVerified(null);
                setError('');
              }}
            >
              Verify again
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
