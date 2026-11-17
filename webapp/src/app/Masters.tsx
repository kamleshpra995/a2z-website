import type { ComponentType } from 'react';
import { Building2, Store, Users, Wrench } from 'lucide-react';
import type { Page } from '@shared/dashboard.ts';
import type { Role, ViewUser } from '@shared/types.ts';
import RecordGrid from './components/RecordGrid.tsx';

type MasterCard = [Page, string, ComponentType<{ size?: number }>];

export function MasterHub({ role, navigate }: { role: Role; navigate: (page: Page) => void }) {
  if (!['Admin', 'Supervisor'].includes(role)) return null;
  const cards: MasterCard[] =
    role === 'Supervisor'
      ? [
          ['Services', 'Add and update the services shown in Customer complaints.', Wrench],
          [
            'Field workers',
            'Add and update field worker contact details and login accounts.',
            Users,
          ],
        ]
      : [
          ['Services', 'Manage the Customer service dropdown.', Wrench],
          ['Clients', 'Add and update your client companies and contact details.', Building2],
          ['Stores', 'Select a client, then add or update stores, managers and images.', Store],
          ...(role === 'Admin'
            ? [
                [
                  'Field workers',
                  'Manage field worker profiles and login accounts.',
                  Users,
                ] as MasterCard,
              ]
            : []),
        ];
  return (
    <section className="cards master-hub">
      {cards.map(([page, description, Icon]) => (
        <button className="entity-card" key={page} onClick={() => navigate(page)}>
          <span className="mini-icon">
            <Icon size={26} />
          </span>
          <h2>
            {page === 'Services'
              ? 'Service master'
              : page === 'Clients'
                ? 'Client master'
                : page === 'Stores'
                  ? 'Store master'
                  : 'Field worker master'}
          </h2>
          <p>{description}</p>
          <span className="text-button">Open master</span>
        </button>
      ))}
    </section>
  );
}
export function FieldWorkerMaster({
  users,
  edit,
}: {
  users: ViewUser[];
  edit: (worker: ViewUser) => void;
}) {
  const workers = users.filter((user) => user.role === 'Field Worker');
  return (
    <section className="section-card">
      <div className="table-wrap">
        <RecordGrid
          compact
          iconActions
          toolbarTitle={
            <h2>
              Field worker master <span className="count">{workers.length}</span>
            </h2>
          }
          rows={workers}
          columns={[
            {
              field: 'worker',
              headerName: 'Worker',
              minWidth: 155,
              flex: 1,
              valueGetter: (_value, worker) => worker.name,
              renderCell: ({ row: worker }) => (
                <>
                  <span className="person">
                    <span className="avatar">{worker.name.slice(0, 2).toUpperCase()}</span>
                    <strong>{worker.name}</strong>
                  </span>
                </>
              ),
            },
            {
              field: 'email_login',
              headerName: 'Email / login',
              minWidth: 155,
              flex: 1,
              valueGetter: (_value, worker) => worker.email,
              renderCell: ({ row: worker }) => <>{worker.email || 'Not configured'}</>,
            },
            {
              field: 'phone',
              headerName: 'Phone',
              minWidth: 155,
              flex: 1,
              valueGetter: (_value, worker) => worker.phone,
              renderCell: ({ row: worker }) => <>{worker.phone || '—'}</>,
            },
            {
              field: 'access',
              headerName: 'Access',
              minWidth: 155,
              flex: 1,
              valueGetter: (_value, worker) => worker.accountStatus || 'No login',
              renderCell: ({ row: worker }) => (
                <>
                  <span className="neutral-tag">{worker.accountStatus || 'No login'}</span>
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
              renderCell: ({ row: worker }) => (
                <>
                  {' '}
                  <button className="outline compact" onClick={() => edit(worker)}>
                    Edit worker
                  </button>{' '}
                </>
              ),
            },
          ]}
          onOpen={(worker) => edit(worker)}
        />
        {!workers.length && (
          <div className="empty">
            <Users size={30} />
            <h3>No field workers found</h3>
            <p>Use Add field worker to create a worker profile with login credentials.</p>
          </div>
        )}
      </div>
    </section>
  );
}
