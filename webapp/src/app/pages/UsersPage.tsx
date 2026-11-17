import { roleLabel } from '@shared/dashboard.ts';
import type { WorkspaceView } from '@shared/types.ts';
import RecordGrid from '../components/RecordGrid.tsx';
import type { NameLookup, RunAction } from '../types.ts';

interface UsersPageProps {
  data: WorkspaceView;
  client: NameLookup;
  store: NameLookup;
  isAdmin: boolean;
  busy: boolean;
  action: RunAction;
}

export default function UsersPage({ data, client, store, isAdmin, busy, action }: UsersPageProps) {
  return (
    <section className="section-card">
      <div className="section-heading">
        <div>
          <h2>
            Internal users <span className="count">{data.users.length}</span>
          </h2>
        </div>
      </div>
      <div className="table-wrap">
        <RecordGrid
          rows={data.users}
          columns={[
            {
              field: 'name',
              headerName: 'Name',
              minWidth: 155,
              flex: 1,
              valueGetter: (_value, account) =>
                [account.name, account.clientId && client(account.clientId)]
                  .filter(Boolean)
                  .join(' '),
              renderCell: ({ row: account }) => (
                <>
                  <span className="person">
                    <span className="avatar">{account.name.slice(0, 2).toUpperCase()}</span>
                    <div>
                      <strong>{account.name}</strong>
                      {account.clientId && <small>{client(account.clientId)}</small>}
                    </div>
                  </span>
                </>
              ),
            },
            {
              field: 'role',
              headerName: 'Role',
              minWidth: 155,
              flex: 1,
              valueGetter: (_value, account) =>
                account.managedStoreId ? 'Store Manager' : roleLabel(account.role),
              renderCell: ({ row: account }) => (
                <>
                  <span className="neutral-tag">
                    {account.managedStoreId ? 'Store Manager' : roleLabel(account.role)}
                  </span>
                </>
              ),
            },
            {
              field: 'email',
              headerName: 'Email',
              minWidth: 155,
              flex: 1,
              valueGetter: (_value, account) => account.email,
              renderCell: ({ row: account }) => <>{account.email || '—'}</>,
            },
            {
              field: 'phone',
              headerName: 'Phone',
              minWidth: 155,
              flex: 1,
              valueGetter: (_value, account) => account.phone,
              renderCell: ({ row: account }) => <>{account.phone || '—'}</>,
            },
            {
              field: 'store',
              headerName: 'Store',
              minWidth: 155,
              flex: 1,
              valueGetter: (_value, account) => store(account.managedStoreId),
              renderCell: ({ row: account }) => <>{store(account.managedStoreId)}</>,
            },
            {
              field: 'access',
              headerName: 'Access',
              minWidth: 155,
              flex: 1,
              valueGetter: (_value, account) => account.accountStatus || 'No login',
              renderCell: ({ row: account }) => (
                <>
                  <span className="neutral-tag">{account.accountStatus || 'No login'}</span>
                </>
              ),
            },
            {
              field: 'actions',
              headerName: 'Actions',
              minWidth: 145,
              flex: 1,
              filterable: false,
              sortable: false,
              renderCell: ({ row: account }) => (
                <>
                  {' '}
                  {isAdmin && account.accountStatus === 'Pending' && (
                    <button
                      className="outline compact"
                      disabled={busy}
                      onClick={() => action('approve', { userId: account.id }, 'Account approved')}
                    >
                      Approve access
                    </button>
                  )}{' '}
                </>
              ),
            },
          ]}
        />
        {!data.users.length && (
          <p className="list-bar" role="status">
            No users match the current filters.
          </p>
        )}
      </div>
    </section>
  );
}
