import type { ComponentType, ReactNode } from 'react';
import { Building2, Store, Users, Ticket, FileText, CheckCircle2, Wrench } from 'lucide-react';
import { roleLabel, type Dashboard, type MetricKind, type Page } from '@shared/dashboard.ts';
import type { TicketFilter } from '@shared/tickets.ts';
import type { PublicUser, TicketSummary, WorkspaceView } from '@shared/types.ts';
import type { OpenDialog } from './types.ts';

type Icon = ComponentType<{ size?: number }>;
const icons: Record<MetricKind, Icon> = {
  tickets: Ticket,
  users: Users,
  clients: Building2,
  stores: Store,
  invoices: FileText,
};
interface RoleDashboardProps {
  user: PublicUser;
  data: WorkspaceView;
  dashboard: Dashboard;
  assignedCounts: Map<string, number>;
  navigate: (page: Page, filter?: TicketFilter) => void;
  open: OpenDialog;
  renderTickets: (items: TicketSummary[]) => ReactNode;
  approve: (userId: string) => unknown;
  busy: boolean;
}

export default function RoleDashboard({
  user,
  data,
  dashboard,
  assignedCounts,
  navigate,
  open,
  renderTickets,
  approve,
  busy,
}: RoleDashboardProps) {
  const admin = user.role === 'Admin';
  const customer = user.role === 'Client';
  const supervisor = user.role === 'Supervisor';
  const priorities = { High: 0, Medium: 1, Low: 2 };
  const queue = supervisor
    ? data.tickets
        .filter((ticket) => ticket.status === 'Pending')
        .sort((a, b) => priorities[a.priority] - priorities[b.priority])
    : data.tickets;
  const followups = data.tickets
    .filter((ticket) => ticket.nextFollowUpAt)
    .sort((a, b) => (a.nextFollowUpAt ?? '').localeCompare(b.nextFollowUpAt ?? ''));
  const workers = data.users.filter((worker) => worker.role === 'Field Worker');
  const pendingUsers = data.users.filter((account) => account.accountStatus === 'Pending');
  const company = data.clients.find((client) => client.id === user.clientId);
  const actions: [string, string, () => unknown, Icon][] = admin
    ? [
        ['Add customer', 'Create client company details', () => open('client'), Building2],
        ['Add store', 'Link a location to a customer', () => open('store'), Store],
        ['Manage users', 'Add staff and customer logins', () => navigate('Internal users'), Users],
        [
          'Review invoices',
          'Update drafts from closed tickets',
          () => navigate('Invoices'),
          FileText,
        ],
      ]
    : customer
      ? [
          ['Your clients', 'View your client details', () => navigate('Clients'), Building2],
          [
            'Raise complaint',
            'Open a service request for your store',
            () => open('ticket'),
            Ticket,
          ],
          ['Your stores', 'View your store details and managers', () => navigate('Stores'), Store],
          ['Track requests', 'Follow pending and assigned work', () => navigate('Tickets'), Wrench],
          [
            'View invoices',
            'Read drafts for your completed jobs',
            () => navigate('Invoices'),
            FileText,
          ],
        ]
      : supervisor
        ? [
            [
              'Field worker master',
              'Add and update workers before assigning jobs',
              () => navigate('Field workers'),
              Users,
            ],
            [
              'Assign pending jobs',
              'Choose a worker from the pending queue',
              () => navigate('Tickets', 'Pending'),
              Wrench,
            ],
            [
              'Follow assigned jobs',
              'Review progress and close completed work',
              () => navigate('Tickets', 'Assigned'),
              CheckCircle2,
            ],
            [
              'Open a ticket',
              'Record a complaint received by your team',
              () => open('ticket'),
              Ticket,
            ],
            [
              'Store directory',
              'Find the customer and manager for a location',
              () => navigate('Stores'),
              Store,
            ],
          ]
        : [];
  return (
    <>
      <section className="welcome role-welcome">
        <div>
          <span className="welcome-pill">
            <span />
            {roleLabel(user.role).toUpperCase()} WORKSPACE
          </span>
          <h2>{dashboard.headline}</h2>
          <button onClick={() => navigate(user.role === 'Accounts' ? 'Invoices' : 'Tickets')}>
            {' '}
            {user.role === 'Accounts' ? 'Review invoice drafts' : 'View service tickets'}
          </button>
        </div>
        <div className="role-identity">
          <span className="avatar">{user.name.slice(0, 2).toUpperCase()}</span>
          <strong>{user.name}</strong>
          <small>{customer ? company?.name : roleLabel(user.role)}</small>
          <span className="role-live">Live workspace data</span>
        </div>
      </section>
      <section className="stats">
        {dashboard.stats.map((stat, index) => {
          const Icon = icons[stat.kind];
          return (
            <button
              key={stat.label}
              className="stat"
              onClick={() => navigate(stat.page, stat.filter)}
            >
              <div className="stat-top">
                <span>{stat.label}</span>
                <span className={`stat-icon ${['amber', 'blue', 'green', 'purple'][index]}`}>
                  <Icon size={18} />
                </span>
              </div>
              <strong>{String(stat.count).padStart(2, '0')}</strong>
              <small>View {stat.label.toLowerCase()}</small>
            </button>
          );
        })}
      </section>
      {!!actions.length && (
        <section className="role-actions">
          {actions.map(([title, description, handler, Icon]) => (
            <button key={title} onClick={handler}>
              <Icon size={21} />
              <span>
                <strong>{title}</strong>
                <small>{description}</small>
              </span>
            </button>
          ))}
        </section>
      )}
      {admin && pendingUsers.length > 0 && (
        <section className="section-card role-panel">
          <div className="section-heading">
            <div>
              <h2>
                Registrations awaiting approval <span className="count">{pendingUsers.length}</span>
              </h2>
              <p>Verify the user and company association before granting access.</p>
            </div>
            <button className="text-button" onClick={() => navigate('Internal users')}>
              All users
            </button>
          </div>
          <div className="approval-list">
            {pendingUsers.slice(0, 4).map((account) => (
              <div key={account.id}>
                <span className="avatar">{account.name.slice(0, 2).toUpperCase()}</span>
                <span>
                  <strong>{account.name}</strong>
                  <small>
                    {roleLabel(account.role)} · {account.email}
                    {account.clientId
                      ? ` · ${data.clients.find((client) => client.id === account.clientId)?.name || ''}`
                      : ''}
                  </small>
                </span>
                <button
                  className="outline compact"
                  disabled={busy}
                  onClick={() => approve(account.id)}
                >
                  Approve access
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="section-card">
        <div className="section-heading">
          <div>
            <h2>
              {dashboard.queueTitle}
              <span className="count">{queue.length}</span>
            </h2>
            <p>{dashboard.queueDescription}</p>
          </div>
          <button
            className="text-button"
            onClick={() => navigate('Tickets', supervisor ? 'Pending' : 'All')}
          >
            View all
          </button>
        </div>
        {queue.length ? (
          renderTickets(queue.slice(0, 6))
        ) : (
          <div className="empty">
            <CheckCircle2 size={30} />
            <h3>{supervisor ? 'No tickets waiting for assignment' : 'No service requests yet'}</h3>
            <p>
              {supervisor
                ? 'New customer requests will appear here automatically.'
                : customer
                  ? 'Ask Admin to configure your stores, then raise your first complaint.'
                  : 'Add a customer and store, then open a ticket to get started.'}
            </p>
          </div>
        )}
      </section>
      {followups.length > 0 && (
        <section className="section-card role-panel">
          <div className="section-heading">
            <div>
              <h2>
                Open follow-ups<span className="count">{followups.length}</span>
              </h2>
              <p>
                Recorded next-contact dates. Open a ticket to update its conversation or mark the
                follow-up done.
              </p>
            </div>
          </div>
          <div className="followup-list">
            {followups.slice(0, 6).map((ticket) => (
              <button key={ticket.id} onClick={() => open('detail', ticket)}>
                <span>
                  <strong>
                    {ticket.number} · {ticket.issue}
                  </strong>
                  <small>{data.stores.find((store) => store.id === ticket.storeId)?.name}</small>
                </span>
                <span
                  className={
                    new Date(ticket.nextFollowUpAt ?? '') < new Date() ? 'due-overdue' : ''
                  }
                >
                  {new Date(ticket.nextFollowUpAt ?? '').toLocaleString('en-IN')}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      {(admin || supervisor) && (
        <section className="section-card role-panel">
          <div className="section-heading">
            <div>
              <h2>
                Field team workload<span className="count">{workers.length}</span>
              </h2>
              <p>
                Current assigned work per worker. Notifications are available in each worker’s
                login.
              </p>
            </div>
            {(admin || supervisor) && (
              <button
                className="text-button"
                onClick={() => {
                  navigate('Field workers');
                  open('user', { role: 'Field Worker' });
                }}
              >
                Add team member
              </button>
            )}
          </div>
          {workers.length ? (
            <div className="workload-list">
              {workers.map((worker) => {
                const jobCount = assignedCounts.get(worker.id) || 0;
                return (
                  <div key={worker.id}>
                    <span className="avatar">{worker.name.slice(0, 2).toUpperCase()}</span>
                    <span>
                      <strong>{worker.name}</strong>
                      <small>
                        {worker.accountStatus === 'Active'
                          ? 'Active field worker'
                          : 'Login not configured'}
                      </small>
                    </span>
                    <span className="neutral-tag">{jobCount} assigned</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty">
              <Users size={26} />
              <p>
                {admin
                  ? 'Add a field worker with an email and password to enable assignments.'
                  : 'Add a worker in the Field worker master before assigning service tickets.'}
              </p>
            </div>
          )}
        </section>
      )}
      {customer && (
        <div className="info-note">
          <Ticket size={19} />
          <span>
            Your flow: Raise complaint → Supervisor assigns worker → Service completed → Ticket
            closed → Invoice draft ready. Only your clients’ records appear here.
          </span>
        </div>
      )}
    </>
  );
}
