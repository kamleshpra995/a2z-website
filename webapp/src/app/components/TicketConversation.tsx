import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { MessageSquare, Paperclip, Send, Clock, CheckCircle2 } from 'lucide-react';
import { MAX_ATTACHMENT_BYTES } from '@shared/attachmentValidation.ts';
import {
  CHANNELS,
  type ActionType,
  type Channel,
  type ConversationEntry,
  type ConversationSnapshot,
  type FileUpload,
  type Payload,
  type PublicAttachment,
  type PublicUser,
} from '@shared/types.ts';
import { doubleClickAction } from './doubleClickAction.ts';
import { storage } from '../storage.ts';
import type { Refresh } from '../hooks/useWorkspace.ts';

interface Draft {
  text: string;
  channel: Channel;
  contactKey: string;
  contactName?: string;
  contactRole?: string;
  contactPhone?: string;
  occurredAt: string;
  nextFollowUpAt: string;
  attachmentIds: string[];
}
const initialDraft = (): Draft => ({
  text: '',
  channel: 'Ticket',
  contactKey: '',
  occurredAt: '',
  nextFollowUpAt: '',
  attachmentIds: [],
});
const localTime = (value: string | null | undefined) =>
  value
    ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : '';
const timestamp = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString('en-IN') : '—';
const iso = (value: string) => (value ? new Date(value).toISOString() : null);
async function encodedFile(file: File): Promise<FileUpload> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, base64: String(reader.result).split(',')[1] });
    reader.onerror = () => reject(Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });
}
interface TicketConversationProps {
  ticketId: string;
  current: PublicUser;
  onChanged: Refresh;
  focusConversation?: boolean;
}

export default function TicketConversation({
  ticketId,
  current,
  onChanged,
  focusConversation,
}: TicketConversationProps) {
  const [snapshot, setSnapshot] = useState<ConversationSnapshot | null>(null);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [editing, setEditing] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<PublicAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [reason, setReason] = useState('');
  const [reopening, setReopening] = useState(false);
  const generation = useRef(0);
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (focusConversation && snapshot) panelRef.current?.scrollIntoView({ block: 'start' });
  }, [focusConversation, !!snapshot]);
  const load = useCallback(async () => {
    const version = generation.current;
    const result = await storage.getConversation(ticketId);
    if (version === generation.current) setSnapshot(result);
  }, [ticketId]);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    generation.current++;
    async function poll() {
      try {
        await load();
      } catch (error) {
        if (active) setError((error as Error).message);
      }
      if (active) timer = setTimeout(poll, 8000);
    }
    poll();
    return () => {
      active = false;
      generation.current++;
      clearTimeout(timer);
    };
  }, [load]);
  async function run(type: ActionType, payload: Payload = {}) {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await storage.action(type, { ticketId, ...payload });
      await load();
      await onChanged({ fresh: true });
      setSuccess('Update saved.');
      return true;
    } catch (error) {
      setError((error as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let payload: Payload;
    try {
      payload = {
        ...draft,
        occurredAt: draft.occurredAt ? iso(draft.occurredAt) : null,
        nextFollowUpAt: draft.nextFollowUpAt ? iso(draft.nextFollowUpAt) : null,
        messageId: editing,
      };
    } catch {
      setError('Enter valid conversation and follow-up dates.');
      return;
    }
    if (await run(editing ? 'editComment' : 'comment', payload)) {
      setDraft(initialDraft());
      setPendingFiles([]);
      setEditing(null);
    }
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (pendingFiles.length + files.length > 5) {
      setError('Attach up to five files per message.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      for (const file of files) {
        if (file.size > MAX_ATTACHMENT_BYTES)
          throw Error('Each attachment must be 2 MB or smaller.');
        const result = await storage.uploadAttachment(ticketId, await encodedFile(file));
        setPendingFiles((previous) => [...previous, result.attachment]);
        setDraft((previous) => ({
          ...previous,
          attachmentIds: [...previous.attachmentIds, result.attachment.id],
        }));
      }
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function download(file: PublicAttachment) {
    setError('');
    try {
      const url = await storage.getAttachmentUrl(ticketId, file.id);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      link.rel = 'noopener';
      link.click();
      if (url.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (error) {
      setError((error as Error).message);
    }
  }
  function edit(entry: ConversationEntry) {
    setEditing(entry.id);
    setDraft({
      ...initialDraft(),
      text: entry.text,
      channel: entry.channel ?? 'Ticket',
      contactKey: entry.contact?.key || '',
      contactName: entry.contact?.name || '',
      contactRole: entry.contact?.role || '',
      contactPhone: entry.contact?.phone || '',
      occurredAt: localTime(entry.occurredAt),
      nextFollowUpAt: localTime(entry.nextFollowUpAt),
    });
    setPendingFiles([]);
  }
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((previous) => ({ ...previous, [key]: value }));
  if (!snapshot)
    return (
      <section className="conversation" ref={panelRef}>
        <h3>Conversation & follow-up history</h3>
        {error ? (
          <div className="error" role="alert">
            {error}
            <button
              className="text-button"
              onClick={() => load().catch((error: Error) => setError(error.message))}
            >
              Retry
            </button>
          </div>
        ) : (
          <p>Loading ticket history…</p>
        )}
      </section>
    );
  const { ticket, messages, contacts, reviewers, permissions } = snapshot;
  const historicalContact =
    editing &&
    draft.contactKey &&
    !contacts.some((contact) => contact.key === draft.contactKey) &&
    draft.contactKey !== 'external';
  return (
    <section className="conversation" ref={panelRef}>
      <div className="conversation-heading">
        <MessageSquare size={21} />
        <h3>Conversation & follow-up history</h3>
        <span className="count">{messages.filter((entry) => entry.kind === 'message').length}</span>
      </div>
      <div className="reviewer-bar">
        <div>
          <small>TRACKING / REVIEWER</small>
          <strong>{ticket.reviewer?.name || 'Not assigned yet'}</strong>
        </div>
        {permissions.canTakeReview && (
          <button
            type="button"
            className="outline compact"
            disabled={busy}
            onClick={() => run('reviewer', { reviewerId: current.id })}
          >
            Take review
          </button>
        )}
        {permissions.canManageReviewer && (
          <label className="field">
            Assign reviewer
            <select
              aria-label="Assign ticket reviewer"
              value={ticket.reviewer?.id || ''}
              disabled={busy}
              onChange={(event) =>
                event.target.value && run('reviewer', { reviewerId: event.target.value })
              }
            >
              <option value="">Select reviewer</option>
              {reviewers.map((reviewer) => (
                <option key={reviewer.id} value={reviewer.id}>
                  {reviewer.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {ticket.nextFollowUpAt && (
        <div
          className={`info-note ${new Date(ticket.nextFollowUpAt) < new Date() ? 'followup-overdue' : ''}`}
        >
          <Clock size={17} />
          Next open follow-up: {timestamp(ticket.nextFollowUpAt)}
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="conversation-success" role="status">
          {success}
        </div>
      )}
      <div className="ticket-review-actions">
        {permissions.canResolve && (
          <button
            type="button"
            className="outline compact"
            disabled={busy}
            onClick={() => run('resolve')}
          >
            Mark resolved
          </button>
        )}
        {permissions.canReopen && (
          <button
            type="button"
            className="outline compact"
            disabled={busy}
            onClick={() => setReopening(!reopening)}
          >
            Reopen for follow-up
          </button>
        )}
      </div>
      {reopening && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (await run('reopen', { reason })) {
              setReopening(false);
              setReason('');
            }
          }}
        >
          <label className="field">
            Reason for reopening
            <textarea
              required
              maxLength={2000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <button className="outline compact" disabled={busy}>
            Reopen ticket
          </button>
        </form>
      )}
      <div className="conversation-timeline">
        {!messages.length && (
          <p className="conversation-empty">
            No entries yet. Add the first conversation or follow-up below.
          </p>
        )}
        {messages.map((entry) => {
          const canEdit =
            permissions.canComment && (entry.author.id === current.id || current.role === 'Admin');
          return entry.kind === 'activity' ? (
            <article className="activity-entry" key={entry.id}>
              <CheckCircle2 size={14} />
              <div>
                <strong>{entry.author.name}</strong> · {entry.text}
                <small>{timestamp(entry.createdAt)}</small>
              </div>
            </article>
          ) : (
            <article
              className="message-entry"
              key={entry.id}
              {...doubleClickAction(canEdit ? () => edit(entry) : null)}
            >
              <div className="message-author">
                <span className="avatar small">{entry.author.name.slice(0, 2).toUpperCase()}</span>
                <div>
                  <strong>{entry.author.name}</strong>
                  <small>
                    {entry.author.role === 'Client' ? 'Customer' : entry.author.role} · Logged{' '}
                    {timestamp(entry.createdAt)}
                    {entry.editedAt ? ' · Edited' : ''}
                  </small>
                </div>
                {canEdit && (
                  <button type="button" className="text-button" onClick={() => edit(entry)}>
                    Edit entry
                  </button>
                )}
              </div>
              <div className="message-context">
                <span>{entry.channel}</span>
                <span>Conversation: {timestamp(entry.occurredAt)}</span>
              </div>
              {entry.contact && (
                <p className="contact-snapshot">
                  With <strong>{entry.contact.name}</strong> · {entry.contact.role}
                  {entry.contact.phone ? ` · ${entry.contact.phone}` : ''}
                </p>
              )}
              <p className="message-text">{entry.text}</p>
              {entry.attachments.length > 0 && (
                <div className="message-files">
                  {entry.attachments.map((file) => (
                    <button type="button" key={file.id} onClick={() => download(file)}>
                      <Paperclip size={14} />
                      {file.name}
                      <small>{Math.ceil(file.size / 1024)} KB</small>
                    </button>
                  ))}
                </div>
              )}
              {entry.nextFollowUpAt && (
                <div className="message-followup">
                  <Clock size={14} />
                  <span>
                    {entry.followUpCompletedAt ? 'Follow-up completed' : 'Next follow-up'}:{' '}
                    {timestamp(entry.followUpCompletedAt || entry.nextFollowUpAt)}
                  </span>
                  {!entry.followUpCompletedAt &&
                    permissions.canComment &&
                    (entry.author.id === current.id ||
                      current.role === 'Admin' ||
                      ticket.reviewer?.id === current.id) && (
                      <button
                        type="button"
                        className="text-button"
                        disabled={busy}
                        onClick={() => run('followupDone', { messageId: entry.id })}
                      >
                        Mark done
                      </button>
                    )}
                </div>
              )}
              {(entry.revisions?.length ?? 0) > 0 && (
                <details className="revision-history">
                  <summary>{entry.revisions!.length} previous version(s)</summary>
                  {entry.revisions!.map((revision, index) => (
                    <div key={index}>
                      <small>
                        Replaced {timestamp(revision.editedAt)} by {revision.editedBy.name}
                      </small>
                      <p>{revision.text}</p>
                      {revision.contact && (
                        <small>
                          With {revision.contact.name} · {revision.channel}
                        </small>
                      )}
                    </div>
                  ))}
                </details>
              )}
            </article>
          );
        })}
      </div>
      {permissions.canComment ? (
        <form onSubmit={submit} className="conversation-form">
          <h4>{editing ? 'Update your entry' : 'Add conversation / follow-up'}</h4>
          <p>
            Visible to authorized users on this ticket. Previous versions of edited messages are
            retained.
          </p>
          <fieldset disabled={busy}>
            <div className="form-grid">
              <label className="field">
                Channel
                <select
                  value={draft.channel}
                  onChange={(event) => update('channel', event.target.value as Channel)}
                >
                  {CHANNELS.map((channel) => (
                    <option key={channel}>{channel}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Conversation with
                <select
                  value={draft.contactKey}
                  onChange={(event) => update('contactKey', event.target.value)}
                >
                  <option value="">General ticket discussion</option>
                  {contacts.map((contact) => (
                    <option key={contact.key} value={contact.key}>
                      {contact.name} · {contact.role}
                    </option>
                  ))}
                  {historicalContact && (
                    <option value={draft.contactKey}>
                      {draft.contactName} · historical contact
                    </option>
                  )}
                  <option value="external">Other contact (record manually)</option>
                </select>
              </label>
            </div>
            {draft.contactKey === 'external' && (
              <>
                <label className="field">
                  Contact name
                  <input
                    required
                    maxLength={150}
                    value={draft.contactName || ''}
                    onChange={(event) => update('contactName', event.target.value)}
                  />
                </label>
                <div className="form-grid">
                  <label className="field">
                    Contact role
                    <input
                      maxLength={100}
                      value={draft.contactRole || ''}
                      onChange={(event) => update('contactRole', event.target.value)}
                    />
                  </label>
                  <label className="field">
                    Contact phone
                    <input
                      type="tel"
                      maxLength={50}
                      value={draft.contactPhone || ''}
                      onChange={(event) => update('contactPhone', event.target.value)}
                    />
                  </label>
                </div>
              </>
            )}
            <label className="field">
              Message / follow-up notes
              <textarea
                aria-label="Conversation message"
                required
                rows={4}
                maxLength={8000}
                value={draft.text}
                onChange={(event) => update('text', event.target.value)}
              />
            </label>
            <div className="form-grid">
              <label className="field">
                Conversation date/time (optional)
                <input
                  type="datetime-local"
                  value={draft.occurredAt}
                  onChange={(event) => update('occurredAt', event.target.value)}
                />
              </label>
              <label className="field">
                Next follow-up (optional)
                <input
                  type="datetime-local"
                  value={draft.nextFollowUpAt}
                  onChange={(event) => update('nextFollowUpAt', event.target.value)}
                />
              </label>
            </div>
            {!editing && (
              <label className="field attachment-input">
                Images / documents (up to five, 2 MB each)
                <input
                  type="file"
                  multiple
                  accept=".jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx,.txt,.csv"
                  onChange={upload}
                />
              </label>
            )}
            {pendingFiles.map((file) => (
              <div className="pending-file" key={file.id}>
                <Paperclip size={13} />
                {file.name}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setPendingFiles((previous) => previous.filter((item) => item.id !== file.id));
                    setDraft((previous) => ({
                      ...previous,
                      attachmentIds: previous.attachmentIds.filter((id) => id !== file.id),
                    }));
                  }}
                >
                  Remove from draft
                </button>
              </div>
            ))}
            <div className="conversation-submit">
              {editing && (
                <button
                  type="button"
                  className="outline"
                  onClick={() => {
                    setEditing(null);
                    setDraft(initialDraft());
                  }}
                >
                  Cancel edit
                </button>
              )}
              <button className="primary" disabled={busy}>
                <Send size={15} />
                {busy ? 'Saving…' : editing ? 'Save entry' : 'Post update'}
              </button>
            </div>
          </fieldset>
        </form>
      ) : (
        <div className="info-note">
          {['Resolved', 'Closed'].includes(ticket.status)
            ? 'This ticket is resolved/closed. History and files remain readable; follow-up requires reopening by Admin or the reviewer.'
            : 'This ticket is handled by its assigned reviewer. You can read its history.'}
        </div>
      )}
    </section>
  );
}
