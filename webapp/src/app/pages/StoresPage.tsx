import { useState } from 'react';
import { Search, MapPin } from 'lucide-react';
import { displayDate } from '@shared/dates.ts';
import type { WorkspaceView } from '@shared/types.ts';
import RecordGrid from '../components/RecordGrid.tsx';
import StoreActionsMenu from '../components/StoreActionsMenu.tsx';
import type { NameLookup, OpenDialog, RunAction } from '../types.ts';

interface StoresPageProps {
  data: WorkspaceView;
  clientFilter: string;
  clearClientFilter: () => void;
  query: string;
  setQuery: (query: string) => void;
  match: (...values: unknown[]) => boolean;
  client: NameLookup;
  canManageMasters: boolean;
  canCreateTicket: boolean;
  open: OpenDialog;
  action: RunAction;
  busy: boolean;
}

export default function StoresPage({
  data,
  clientFilter,
  clearClientFilter,
  query,
  setQuery,
  match,
  client,
  canManageMasters,
  canCreateTicket,
  open,
  action,
  busy,
}: StoresPageProps) {
  const [archived, setArchived] = useState(false);
  const activeClients = new Set(
    data.clients.filter((item) => !item.deletedAt && item.active !== false).map((item) => item.id),
  );
  const visible = data.stores.filter(
    (item) =>
      Boolean(item.deletedAt) === archived &&
      (!clientFilter || item.clientId === clientFilter) &&
      match(item.name, client(item.clientId), item.manager, item.city),
  );
  return (
    <section className="section-card stores-page">
      <div className="table-wrap">
        <RecordGrid
          compact
          iconActions
          controls={
            <div className="list-bar store-list-bar">
              <span>
                {clientFilter
                  ? `Stores for ${client(clientFilter)}`
                  : `${visible.length} ${visible.length === 1 ? 'store' : 'stores'}`}
                {clientFilter && (
                  <button className="text-button" onClick={clearClientFilter}>
                    Show all stores
                  </button>
                )}
                {canManageMasters && (
                  <button className="text-button" onClick={() => setArchived(!archived)}>
                    {archived ? 'Show current records' : 'Show deleted'}
                  </button>
                )}
              </span>
              <label className="search">
                <Search size={17} />
                <input
                  aria-label="Search stores"
                  placeholder="Search stores…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
            </div>
          }
          rows={visible}
          columns={[
            {
              field: 'store_client',
              headerName: 'Store / Client',
              minWidth: 120,
              flex: 1,
              valueGetter: (_value, item) => [item.name, client(item.clientId)].join(' '),
              renderCell: ({ row: item }) => (
                <>
                  <strong>{item.name}</strong>
                  <small>{client(item.clientId)}</small>
                  {item.image && (
                    <img className="client-image-preview" src={item.image} alt={item.name} />
                  )}
                </>
              ),
            },
            {
              field: 'address',
              headerName: 'Address',
              minWidth: 120,
              flex: 1,
              valueGetter: (_value, item) =>
                [item.address, item.addressLine2, item.city, item.state, item.zip].join(' '),
              renderCell: ({ row: item }) => (
                <>
                  {item.addressLine1 || item.address}
                  <small>
                    {[item.addressLine2, item.city, item.state, item.zip]
                      .filter(Boolean)
                      .join(', ')}
                  </small>
                  {item.mapLink && (
                    <a
                      className="text-button"
                      href={item.mapLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MapPin size={14} /> Map
                    </a>
                  )}
                  {item.latitude != null && (
                    <small>
                      {item.latitude}, {item.longitude}
                    </small>
                  )}
                </>
              ),
            },
            {
              field: 'manager_contact',
              headerName: 'Manager / Contact',
              minWidth: 120,
              flex: 1,
              valueGetter: (_value, item) =>
                [item.manager, item.contactPerson, item.phone, item.contactPhone].join(' '),
              renderCell: ({ row: item }) => (
                <>
                  <strong>{item.manager}</strong>
                  <small>{item.phone || '—'}</small>
                  {item.contactPerson && (
                    <small>
                      {item.contactPerson} · {item.contactPhone || '—'}
                    </small>
                  )}
                </>
              ),
            },
            {
              field: 'status',
              headerName: 'Status',
              minWidth: 120,
              flex: 1,
              valueGetter: (_value, item) => (item.active === false ? 'Inactive' : 'Active'),
              renderCell: ({ row: item }) => (
                <>
                  <span
                    className={`client-state ${item.active === false ? 'is-inactive' : 'is-active'}`}
                  >
                    ● {item.active === false ? 'Inactive' : 'Active'}
                  </span>
                </>
              ),
            },
            {
              field: 'registered_on',
              headerName: 'Registered on',
              minWidth: 120,
              flex: 1,
              valueGetter: (_value, item) => displayDate(item.registeredOn),
              renderCell: ({ row: item }) => <>{displayDate(item.registeredOn)}</>,
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
              renderCell: ({ row: item }) => (
                <>
                  <StoreActionsMenu
                    store={item}
                    archived={archived}
                    canManageMasters={canManageMasters}
                    canCreateTicket={canCreateTicket}
                    canRaiseTicket={activeClients.has(item.clientId) && item.active !== false}
                    open={open}
                    action={action}
                    busy={busy}
                  />
                </>
              ),
            },
          ]}
          onOpen={(item) => !archived && canManageMasters && open('store', item)}
        />
      </div>
      {!visible.length && (
        <div className="empty">
          <h3>No stores found</h3>
          <p>
            {archived ? 'Deleted stores will appear here.' : 'Add a store or change the search.'}
          </p>
        </div>
      )}
    </section>
  );
}
