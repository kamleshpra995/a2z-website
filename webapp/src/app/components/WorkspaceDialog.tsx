import {
  useState,
  useEffect,
  useRef,
  type Dispatch,
  type FormEvent,
  type HTMLInputTypeAttribute,
  type SetStateAction,
} from 'react';
import { X, Check, CheckCircle2, ImagePlus, QrCode } from 'lucide-react';
import { businessDate, displayDate } from '@shared/dates.ts';
import type { Page } from '@shared/dashboard.ts';
import type { FileUpload, PublicUser, WorkspaceView } from '@shared/types.ts';
import StoreQrPreview from './StoreQrPreview.tsx';
import TicketConversation from './TicketConversation.tsx';
import WhatsAppUpdate from './WhatsAppUpdate.tsx';
import StatusBadge from './StatusBadge.tsx';
import type { Refresh } from '../hooks/useWorkspace.ts';
import type { FormState, ModalType, NameLookup, OpenDialog } from '../types.ts';

type TextField = {
  [K in keyof FormState]-?: NonNullable<FormState[K]> extends string | number ? K : never;
}[keyof FormState];

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Read a file as a data: URL. */
const readDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(Error('Could not read the image.'));
    reader.readAsDataURL(file);
  });

interface WorkspaceDialogProps {
  modal: ModalType | null;
  setModal: (modal: ModalType | null) => void;
  /** Close by the user (X, Cancel, backdrop); asks first when typed input would be lost. */
  requestClose: () => void;
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  error: string;
  setError: (error: string) => void;
  data: WorkspaceView;
  current: PublicUser;
  client: NameLookup;
  store: NameLookup;
  username: NameLookup;
  canManage: boolean;
  worker: boolean;
  open: OpenDialog;
  goto: (page: Page) => void;
  busy: boolean;
  submit: (event: FormEvent<HTMLFormElement>) => void;
  onChanged: Refresh;
}

export default function WorkspaceDialog({
  modal,
  setModal,
  requestClose,
  form,
  setForm,
  error,
  setError,
  data,
  current,
  client,
  store,
  username,
  canManage,
  worker,
  open,
  goto,
  busy,
  submit,
  onChanged,
}: WorkspaceDialogProps) {
  const [showQr, setShowQr] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);
  const pressedBackdrop = useRef(false);
  useEffect(() => setShowQr(false), [modal, form.id]);
  useEffect(() => {
    if (showQr) qrRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [showQr]);
  const field = (
    label: string,
    key: TextField,
    required = false,
    type: HTMLInputTypeAttribute = 'text',
  ) => (
    <label className="field">
      {label}
      {required && <span> *</span>}
      <input
        type={type}
        required={required}
        value={form[key] ?? ''}
        onChange={(event) => {
          const value = event.target.value;
          setForm((previous) => ({ ...previous, [key]: value }));
        }}
      />
    </label>
  );
  const select = (
    label: string,
    key: 'clientId' | 'storeId' | 'serviceId' | 'role' | 'workerId' | 'priority',
    options: { id: string; name: string }[],
    required = true,
  ) => (
    <label className="field">
      {label}
      {required && <span> *</span>}
      <select
        required={required}
        value={form[key] || ''}
        onChange={(e) =>
          setForm({
            ...form,
            [key]: e.target.value,
            ...(key === 'clientId' ? { storeId: '', managedStoreId: null } : {}),
          } as FormState)
        }
      >
        <option value="">Select {label.toLowerCase()}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );

  if (!modal) return null;
  const canHandle =
    canManage && (current.role === 'Admin' || !form.reviewerId || form.reviewerId === current.id);
  const selectedClient = data.clients.find((item) => item.id === form.clientId);
  return (
    <div
      className="modal-backdrop"
      // Only the read-only QR preview closes from the backdrop, and only for a real click that
      // started there: a swipe, scroll or text selection that ends outside must not close a form.
      onPointerDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (modal === 'storeQr' && pressedBackdrop.current && e.target === e.currentTarget)
          requestClose();
        pressedBackdrop.current = false;
      }}
    >
      <section
        className={`modal${modal === 'detail' ? ' ticket-detail-modal' : modal === 'storeQr' ? ' store-qr-modal' : modal === 'client' ? ' client-modal' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-heading">
          <button className="icon-button" aria-label="Close dialog" onClick={requestClose}>
            <X size={20} />
          </button>
        </div>
        <h2 id="modal-title">
          {
            {
              service: form.id ? 'Edit service' : 'Add service',
              client: form.id ? 'Edit client details' : 'Add client',
              store: form.id ? 'Edit store' : 'Add store',
              storeQr: 'Store details QR',
              user: form.id
                ? form.role === 'Field Worker'
                  ? 'Edit field worker'
                  : 'Edit user'
                : form.role === 'Field Worker'
                  ? 'Add field worker'
                  : 'Add user',
              ticket: 'New Ticket',
              assign: 'Assign field worker',
              close: 'Close ticket',
              invoice: 'Edit invoice draft',
              detail: form.number,
            }[modal]
          }
        </h2>
        {modal !== 'client' && (
          <p className="modal-subtitle">
            {
              {
                service: 'Configure an active service for the Customer complaint dropdown.',
                client: 'Your client’s company and contact information.',
                store: 'Choose a client, then add this store’s details.',
                storeQr:
                  'Scan or download the QR to read this store’s contact and location details.',
                user:
                  form.role === 'Client'
                    ? 'A login for a customer. It sees only its own company’s stores and tickets.'
                    : 'Only people added here can sign in to the portal.',
                ticket: 'Tell your team what needs attention.',
                assign: 'The selected worker will receive an in-app notification.',
                close: 'Closing this ticket will create one invoice draft.',
                invoice: 'Add the service description and amount. This remains a draft.',
                detail: `${client(form.clientId)} · ${store(form.storeId)}`,
              }[modal]
            }
          </p>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {modal === 'detail' ? (
          <>
            <div className="detail-status">
              <StatusBadge value={form.status ?? 'Pending'} />
              <span className={`priority ${(form.priority || '').toLowerCase()}`}>
                {form.priority} priority
              </span>
            </div>
            <h3>{form.issue}</h3>
            <p className="detail-description">{form.description || 'No additional description.'}</p>
            <dl className="detail-list">
              <dt>Field worker</dt>
              <dd>{username(form.workerId)}</dd>
              <dt>Raised On</dt>
              <dd>{displayDate(form.raisedOn || form.createdAt)}</dd>
              <dt>Due Date</dt>
              <dd>{displayDate(form.dueDate)}</dd>
              {form.raisedByContact && (
                <>
                  <dt>Raised by (QR)</dt>
                  <dd>
                    {form.raisedByContact.name} · {form.raisedByContact.contact}
                  </dd>
                </>
              )}
              <dt>Opened</dt>
              <dd>{new Date(form.createdAt ?? '').toLocaleString('en-IN')}</dd>
            </dl>
            {['Admin', 'Supervisor', 'Field Worker'].includes(current.role) &&
              (() => {
                const ticket = data.tickets.find((item) => item.id === form.id);
                return (
                  ticket && (
                    <WhatsAppUpdate
                      ticket={ticket}
                      store={data.stores.find((item) => item.id === ticket.storeId)}
                      clientName={client(ticket.clientId)}
                      worker={data.users.find((item) => item.id === ticket.workerId)}
                      canMessageWorker={current.role !== 'Field Worker'}
                    />
                  )
                );
              })()}
            <div className="modal-footer">
              {form.status === 'Closed' ? (
                <span className="info-note">Invoice draft created</span>
              ) : (
                <>
                  {canHandle && (
                    <button
                      className="outline"
                      onClick={() => open('assign', { ticketId: form.id, workerId: form.workerId })}
                    >
                      Assign worker
                    </button>
                  )}
                  {(canHandle || worker) && (
                    <button
                      className="primary"
                      disabled={!form.workerId}
                      onClick={() => open('close', { ticketId: form.id })}
                    >
                      <Check size={17} />
                      Close ticket
                    </button>
                  )}
                </>
              )}
            </div>
            <TicketConversation
              ticketId={form.id ?? ''}
              current={current}
              onChanged={onChanged}
              focusConversation={form.focusConversation}
            />
          </>
        ) : modal === 'storeQr' ? (
          <StoreQrPreview store={form} client={selectedClient} />
        ) : (
          <form onSubmit={submit}>
            {modal === 'service' && (
              <>
                {field('Service name', 'name', true)}
                {field('Description', 'description')}
                <label className="field">
                  Status
                  <select
                    value={form.active === false ? 'inactive' : 'active'}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        active: event.target.value === 'active',
                      }))
                    }
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
              </>
            )}
            {modal === 'client' && (
              <>
                {field('Client name', 'name', true)}
                <div className="form-grid">
                  {field('Contact person', 'contact')}
                  {field('Phone', 'phone', false, 'tel')}
                </div>
                <div className="form-grid">
                  {field('Email', 'email', false, 'email')}
                  {field('Website', 'website', false, 'url')}
                </div>
                {field('Address', 'address')}
                <div className="form-grid">
                  {field('City', 'city')}
                  {field('State', 'state')}
                </div>
                <div className="form-grid">
                  <label className="field">
                    Status
                    <select
                      value={form.active === false ? 'inactive' : 'active'}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          active: event.target.value === 'active',
                        }))
                      }
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </label>
                  <label className="field">
                    Added On — working since
                    <input
                      type="date"
                      max={businessDate()}
                      value={form.addedOn || ''}
                      onChange={(event) =>
                        setForm((previous) => ({ ...previous, addedOn: event.target.value }))
                      }
                    />
                  </label>
                </div>
                <label className="field">
                  Client image
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      if (file.size > 2 * 1024 * 1024 || !IMAGE_TYPES.includes(file.type)) {
                        setError('Choose a JPG, PNG or WebP file under 2 MB.');
                        event.target.value = '';
                        return;
                      }
                      readDataUrl(file).then(
                        (image) => {
                          setForm((previous) => ({ ...previous, image }));
                          setError('');
                        },
                        (error: Error) => setError(error.message),
                      );
                    }}
                  />
                  {form.image && (
                    <img
                      className="client-image-preview"
                      src={form.image}
                      alt="Client image preview"
                    />
                  )}
                </label>
              </>
            )}
            {modal === 'store' && (
              <>
                {select(
                  'Client',
                  'clientId',
                  data.clients.filter(
                    (client) =>
                      (!client.deletedAt && client.active !== false) ||
                      (modal === 'store' && !!form.id && client.id === form.clientId),
                  ),
                )}
                {!data.clients.length && <p className="hint">Add a client first.</p>}
                {field('Store name', 'name', true)}
                {form.storeCode && (
                  <label className="field">
                    Store Code
                    <input readOnly value={form.storeCode} />
                    <small>Share this code separately with the store manager.</small>
                  </label>
                )}
                {field('Store Address Line 1', 'addressLine1', true)}
                {field('Store Address Line 2', 'addressLine2')}
                <div className="form-grid">
                  {field('City', 'city')}
                  {field('State', 'state')}
                  {field('ZIP / Postal code', 'zip')}
                </div>
                <div className="form-grid">
                  <label className="field">
                    Store status
                    <select
                      value={form.active === false ? 'inactive' : 'active'}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          active: event.target.value === 'active',
                        }))
                      }
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </label>
                  <label className="field">
                    Registered On
                    <input
                      type="date"
                      max={businessDate()}
                      value={form.registeredOn || ''}
                      onChange={(event) =>
                        setForm((previous) => ({ ...previous, registeredOn: event.target.value }))
                      }
                    />
                  </label>
                </div>
                <div className="form-grid">
                  {field('Store manager', 'manager', true)}
                  {field('Manager phone', 'phone', false, 'tel')}
                </div>
                <div className="form-grid">
                  {field('Store contact person', 'contactPerson')}
                  {field('Contact person phone', 'contactPhone', false, 'tel')}
                </div>
                {field('Google Maps link', 'mapLink', false, 'url')}
                <div className="form-grid">
                  <label className="field">
                    Longitude
                    <input
                      type="number"
                      step="any"
                      min="-180"
                      max="180"
                      value={form.longitude ?? ''}
                      onChange={(event) => {
                        const value = event.target.value;
                        setForm((previous) => ({ ...previous, longitude: value }));
                      }}
                    />
                  </label>
                  <label className="field">
                    Latitude
                    <input
                      type="number"
                      step="any"
                      min="-90"
                      max="90"
                      value={form.latitude ?? ''}
                      onChange={(event) => {
                        const value = event.target.value;
                        setForm((previous) => ({ ...previous, latitude: value }));
                      }}
                    />
                  </label>
                </div>
                <label className="field">
                  Store image
                  <label className="upload">
                    {form.image ? (
                      <img src={form.image} alt="Store image preview" />
                    ) : (
                      <ImagePlus size={26} />
                    )}
                    <strong>{form.image ? 'Change store image' : 'Choose a store image'}</strong>
                    <small>JPG, PNG or WebP · up to 2 MB</small>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 2 * 1024 * 1024 || !IMAGE_TYPES.includes(file.type)) {
                          setError('Choose a JPG, PNG or WebP file under 2 MB.');
                          e.target.value = '';
                          return;
                        }
                        readDataUrl(file).then(
                          (image) => {
                            setForm((f) => ({ ...f, image }));
                            setError('');
                          },
                          (error: Error) => setError(error.message),
                        );
                      }}
                    />
                  </label>
                </label>
              </>
            )}
            {modal === 'user' && (
              <>
                {field('Full name', 'name', true)}
                {current.role === 'Supervisor' || form.id ? (
                  <div className="info-note">
                    Role: {form.role === 'Client' ? 'Customer' : form.role}
                  </div>
                ) : (
                  select('Role', 'role', [
                    { id: 'Supervisor', name: 'Supervisor' },
                    { id: 'Field Worker', name: 'Field Worker' },
                    { id: 'Accounts', name: 'Accounts' },
                    { id: 'Client', name: 'Customer (client login)' },
                  ])
                )}
                {form.role === 'Client' && (
                  <>
                    {select(
                      'Client company',
                      'clientId',
                      data.clients.filter(
                        (item) =>
                          (!item.deletedAt && item.active !== false) || item.id === form.clientId,
                      ),
                    )}
                    <label className="field">
                      Store access
                      <select
                        value={form.managedStoreId || ''}
                        onChange={(event) =>
                          setForm((previous) => ({
                            ...previous,
                            managedStoreId: event.target.value || null,
                          }))
                        }
                      >
                        <option value="">All stores of this client</option>
                        {data.stores
                          .filter((item) => item.clientId === form.clientId && !item.deletedAt)
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              Only {item.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  </>
                )}
                {field('Email', 'email', true, 'email')}
                {field('Phone', 'phone', false, 'tel')}
                {field(
                  form.id
                    ? 'New password (leave blank to keep current)'
                    : 'Initial password (10+ characters)',
                  'password',
                  !form.id,
                  'password',
                )}
              </>
            )}
            {modal === 'ticket' && (
              <>
                {select(
                  'Client',
                  'clientId',
                  data.clients.filter((client) => !client.deletedAt && client.active !== false),
                )}
                {select(
                  'Store',
                  'storeId',
                  data.stores.filter(
                    (s) => s.clientId === form.clientId && !s.deletedAt && s.active !== false,
                  ),
                )}
                {!data.stores.length && (
                  <p className="hint">Add a store before opening a ticket.</p>
                )}
                <div className="form-grid">
                  <label className="field">
                    Raised On
                    <input
                      type="date"
                      aria-label="Raised On"
                      readOnly
                      value={form.raisedOn || businessDate()}
                    />
                  </label>
                  <label className="field">
                    Due Date *
                    <input
                      type="date"
                      aria-label="Due Date"
                      required
                      min={form.raisedOn || businessDate()}
                      value={form.dueDate || ''}
                      onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
                    />
                  </label>
                </div>
                {select(
                  'Service',
                  'serviceId',
                  (data.services || []).filter((service) => service.active !== false),
                )}
                <div className="form-grid">
                  <label className="field">
                    Ticket number
                    <input readOnly value="Generated when saved" />
                  </label>
                  <label className="field">
                    Status
                    <input readOnly value="Pending" />
                  </label>
                </div>
                <label className="field">
                  Description
                  <textarea
                    rows={3}
                    value={form.description || ''}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </label>
                <label className="field">
                  Images
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp"
                    onChange={async (event) => {
                      const files = Array.from(event.target.files || []);
                      if (
                        files.length > 5 ||
                        files.reduce((sum, file) => sum + file.size, 0) > 2 * 1024 * 1024 ||
                        files.some((file) => !IMAGE_TYPES.includes(file.type))
                      ) {
                        setError('Choose up to five JPG, PNG or WebP images, up to 2 MB combined.');
                        event.target.value = '';
                        return;
                      }
                      try {
                        const images: FileUpload[] = await Promise.all(
                          files.map(async (file) => ({
                            name: file.name,
                            base64: (await readDataUrl(file)).split(',')[1] ?? '',
                          })),
                        );
                        setForm((previous) => ({ ...previous, images }));
                        setError('');
                      } catch (error) {
                        setError((error as Error).message);
                      }
                    }}
                  />
                  <small>{form.images?.length || 0} images selected · 2 MB combined</small>
                </label>
                {select(
                  'Priority',
                  'priority',
                  ['Low', 'Medium', 'High'].map((s) => ({ id: s, name: s })),
                )}
              </>
            )}
            {modal === 'assign' && (
              <>
                {select(
                  'Field worker',
                  'workerId',
                  data.users.filter((u) => u.role === 'Field Worker'),
                )}
                {!data.users.some((u) => u.role === 'Field Worker') && (
                  <div className="hint">
                    No field worker is available. Add a worker, then return to assign this
                    complaint.
                    <button
                      type="button"
                      className="outline full"
                      onClick={() => {
                        setModal(null);
                        goto('Field workers');
                        open('user', { role: 'Field Worker', returnTicketId: form.ticketId });
                      }}
                    >
                      Add field worker
                    </button>
                  </div>
                )}
              </>
            )}
            {modal === 'close' && (
              <div className="info-note">
                <CheckCircle2 size={23} />
                <span>
                  Confirm that the service work is complete. The ticket will be closed and its
                  invoice draft will be ready under Invoices.
                </span>
              </div>
            )}
            {modal === 'invoice' && (
              <>
                {field('Service description', 'description', true)}
                {field('Amount (INR)', 'amount', true, 'number')}
                <p className="hint">
                  Draft only. Tax calculation and final invoice generation are not included in this
                  version.
                </p>
              </>
            )}
            {modal === 'store' && showQr && (
              <div ref={qrRef}>
                <StoreQrPreview store={form} client={selectedClient} />
              </div>
            )}
            <div className="modal-footer">
              {modal === 'store' && (
                <button
                  type="button"
                  className="outline view-store-qr"
                  aria-expanded={showQr}
                  onClick={() => setShowQr((previous) => !previous)}
                >
                  <QrCode size={16} />
                  {showQr ? 'Hide QR' : 'View QR'}
                </button>
              )}
              <button type="button" className="outline" onClick={requestClose}>
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                {busy
                  ? 'Saving…'
                  : {
                      service: form.id ? 'Save service' : 'Add service',
                      client: 'Save client',
                      store: form.id ? 'Save store' : 'Add store',
                      user: form.id ? 'Save user' : 'Add user',
                      ticket: 'Open ticket',
                      assign: 'Assign & notify',
                      close: 'Close & create draft',
                      invoice: 'Save draft',
                    }[modal]}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
