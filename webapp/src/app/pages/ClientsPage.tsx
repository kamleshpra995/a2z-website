import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Pencil, Plus, Store, Trash2, RotateCcw } from 'lucide-react';
import { displayDate } from '@shared/dates.ts';
import type { Page } from '@shared/dashboard.ts';
import type { WorkspaceView } from '@shared/types.ts';
import RecordGrid from '../components/RecordGrid.tsx';
import RecordActionsMenu, { type MenuOption } from '../components/RecordActionsMenu.tsx';
import type { OpenDialog, RunAction } from '../types.ts';

interface ClientsPageProps {
  data: WorkspaceView;
  query: string;
  setQuery: (query: string) => void;
  match: (...values: unknown[]) => boolean;
  canManageMasters: boolean;
  open: OpenDialog;
  goto: (page: Page) => void;
  storeCounts: Map<string, number>;
  viewStores: (clientId: string) => void;
  action: RunAction;
  busy: boolean;
}

export default function ClientsPage({
  data,
  query,
  setQuery,
  match,
  canManageMasters,
  open,
  goto,
  storeCounts,
  viewStores,
  action,
  busy,
}: ClientsPageProps) {
  const [showDeleted, setShowDeleted] = useState(false);
  const [confirmation, setConfirmation] = useState<{ id: string; active: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusError, setStatusError] = useState('');
  const cancelButton = useRef<HTMLButtonElement>(null);
  const statusTrigger = useRef<HTMLButtonElement | null>(null);
  const pending = data.clients.find((client) => client.id === confirmation?.id);
  const visible = data.clients.filter(
    (client) =>
      Boolean(client.deletedAt) === showDeleted &&
      match(client.name, client.contact, client.email, client.phone, client.city, client.state),
  );
  useEffect(() => {
    if (confirmation) cancelButton.current?.focus();
    else statusTrigger.current?.focus();
  }, [confirmation]);
  async function confirmStatus() {
    if (saving || !pending || !confirmation) return;
    setSaving(true);
    setStatusError('');
    try {
      const payload = confirmation;
      if (
        await action('clientStatus', payload, payload.active ? 'Client enabled' : 'Client disabled')
      )
        setConfirmation(null);
      else setStatusError('Status was not saved. Please retry or cancel.');
    } catch (error) {
      setStatusError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="section-card clients-page">
      <div className="table-wrap">
        <RecordGrid
          compact
          iconActions
          controls={
            <div className="list-bar client-list-bar">
              <span>
                {visible.length} {showDeleted ? 'deleted clients' : 'clients'}
                {canManageMasters && (
                  <button className="text-button" onClick={() => setShowDeleted(!showDeleted)}>
                    {showDeleted ? 'Show current records' : 'Show deleted'}
                  </button>
                )}
              </span>
              <label className="search">
                <Search size={17} />
                <input
                  aria-label="Search clients"
                  placeholder="Search clients…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
            </div>
          }
          rows={visible}
          columns={[
            {
              field: 'client',
              headerName: 'Client',
              minWidth: 120,
              flex: 1,
              valueGetter: (_value, client) => client.name,
              renderCell: ({ row: client }) => (
                <>
                  <div className="client-table-identity">
                    {client.image && <img src={client.image} alt="" />}
                    <strong>{client.name}</strong>
                  </div>
                </>
              ),
            },
            {
              field: 'contact',
              headerName: 'Contact',
              minWidth: 120,
              flex: 1,
              valueGetter: (_value, client) =>
                [client.contact, client.email, client.phone].join(' '),
              renderCell: ({ row: client }) => (
                <>
                  <strong>{client.contact || '—'}</strong>
                  <small>{client.email || '—'}</small>
                  <small>{client.phone || '—'}</small>
                </>
              ),
            },
            {
              field: 'address',
              headerName: 'Address',
              minWidth: 120,
              flex: 1,
              valueGetter: (_value, client) =>
                [client.address, client.city, client.state].join(' '),
              renderCell: ({ row: client }) => (
                <>{[client.address, client.city, client.state].filter(Boolean).join(', ') || '—'}</>
              ),
            },
            {
              field: 'website',
              headerName: 'Website',
              minWidth: 120,
              flex: 1,
              valueGetter: (_value, client) => client.website,
              renderCell: ({ row: client }) => (
                <>
                  {client.website ? (
                    <a href={client.website} target="_blank" rel="noopener noreferrer">
                      {client.website}
                    </a>
                  ) : (
                    '—'
                  )}
                </>
              ),
            },
            {
              field: 'working_since',
              headerName: 'Working since',
              minWidth: 120,
              flex: 1,
              valueGetter: (_value, client) => displayDate(client.addedOn),
              renderCell: ({ row: client }) => <>{displayDate(client.addedOn)}</>,
            },
            {
              field: 'stores',
              headerName: 'Stores',
              minWidth: 120,
              flex: 1,
              valueGetter: (_value, client) => storeCounts.get(client.id) || 0,
              renderCell: ({ row: client }) => (
                <>
                  <button className="text-button" onClick={() => viewStores(client.id)}>
                    {storeCounts.get(client.id) || 0}{' '}
                    {storeCounts.get(client.id) === 1 ? 'store' : 'stores'}
                  </button>
                </>
              ),
            },
            {
              field: 'status',
              headerName: 'Status',
              minWidth: 120,
              flex: 1,
              valueGetter: (_value, client) => (client.active !== false ? 'Active' : 'Inactive'),
              renderCell: ({ row: client }) => {
                const active = client.active !== false;
                return (
                  <>
                    <div className="client-status-cell">
                      {canManageMasters && !showDeleted && (
                        <button
                          type="button"
                          role="switch"
                          aria-checked={active}
                          aria-label={`Status for ${client.name}`}
                          className="client-status-switch"
                          disabled={busy || saving}
                          onClick={(event) => {
                            statusTrigger.current = event.currentTarget;
                            setStatusError('');
                            setConfirmation({ id: client.id, active: !active });
                          }}
                        >
                          <span />
                        </button>
                      )}
                      <span className={`client-state ${active ? 'is-active' : 'is-inactive'}`}>
                        ● {active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </>
                );
              },
            },
            {
              field: 'actions',
              headerName: 'Actions',
              width: 76,
              resizable: false,
              align: 'center',
              headerAlign: 'center',
              filterable: false,
              sortable: false,
              renderCell: ({ row: client }) => {
                const active = client.active !== false;
                const options: MenuOption[] = [
                  ...(!showDeleted && canManageMasters
                    ? [{ label: 'Edit details', icon: Pencil, run: () => open('client', client) }]
                    : []),
                  { label: 'View all stores', icon: Store, run: () => viewStores(client.id) },
                  ...(!showDeleted && canManageMasters
                    ? [
                        {
                          label: 'Add store',
                          icon: Plus,
                          disabled: !active,
                          run: () => {
                            goto('Stores');
                            open('store', { clientId: client.id });
                          },
                        },
                      ]
                    : []),
                  ...(canManageMasters
                    ? [
                        {
                          label: showDeleted ? 'Restore' : 'Delete',
                          icon: showDeleted ? RotateCcw : Trash2,
                          run: () =>
                            action(
                              showDeleted ? 'restore' : 'archive',
                              { entity: 'client', id: client.id },
                              showDeleted ? 'Client restored' : 'Client deleted',
                            ),
                        },
                      ]
                    : []),
                ];
                return (
                  <>
                    <RecordActionsMenu
                      name={client.name}
                      entityLabel="Client"
                      options={options}
                      busy={busy || saving}
                    />
                  </>
                );
              },
            },
          ]}
          onOpen={(client) => !showDeleted && canManageMasters && open('client', client)}
        />
      </div>
      {!visible.length && (
        <div className="empty">
          <h3>{showDeleted ? 'No deleted clients' : 'No clients found'}</h3>
        </div>
      )}
      {confirmation &&
        createPortal(
          <div className="modal-backdrop">
            <section
              className="modal client-status-confirm"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="client-status-title"
              aria-describedby="client-status-description"
              onKeyDown={(event) => {
                if (event.key === 'Escape' && !saving) setConfirmation(null);
                if (event.key === 'Tab') {
                  const buttons = Array.from(
                    event.currentTarget.querySelectorAll<HTMLButtonElement>(
                      'button:not(:disabled)',
                    ),
                  );
                  const first = buttons[0],
                    last = buttons[buttons.length - 1];
                  if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last?.focus();
                  } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first?.focus();
                  }
                }
              }}
            >
              <h2 id="client-status-title">{confirmation.active ? 'Enable' : 'Disable'} client?</h2>
              <p id="client-status-description">
                {confirmation.active
                  ? `Enable ${pending?.name || 'this client'} to allow new stores and tickets.`
                  : `Disable ${pending?.name || 'this client'}? New stores and tickets will be blocked. Existing history stays available.`}
              </p>
              {statusError && (
                <div className="error" role="alert">
                  {statusError}
                </div>
              )}
              <div className="modal-footer">
                <button
                  ref={cancelButton}
                  type="button"
                  className="outline"
                  disabled={busy || saving}
                  onClick={() => setConfirmation(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={busy || saving || !pending || Boolean(pending.deletedAt)}
                  onClick={confirmStatus}
                >
                  {saving ? 'Saving…' : confirmation.active ? 'Enable client' : 'Disable client'}
                </button>
              </div>
            </section>
          </div>,
          document.body,
        )}
    </section>
  );
}
