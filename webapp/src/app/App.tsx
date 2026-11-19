import { useState, useEffect, useMemo, useRef, type ComponentType, type FormEvent } from 'react';
import {
  LayoutDashboard,
  Building2,
  Store,
  Users,
  Ticket,
  FileText,
  Bell,
  Plus,
  ChevronRight,
  Wrench,
  CheckCircle2,
  Menu,
} from 'lucide-react';
import { businessDate } from '@shared/dates.ts';
import { summarizeTickets, type TicketFilter } from '@shared/tickets.ts';
import { getDashboard, getRolePages, roleLabel, type Page } from '@shared/dashboard.ts';
import type { ActionType, Payload, PublicUser, TicketSummary } from '@shared/types.ts';
import { storage } from './storage.ts';
import Auth from './Auth.tsx';
import { useWorkspace } from './hooks/useWorkspace.ts';
import { indexWorkspace } from './utils/workspaceIndex.ts';
import TicketTable from './components/TicketTable.tsx';
import WorkspaceDialog from './components/WorkspaceDialog.tsx';
import TicketsPage from './pages/TicketsPage.tsx';
import ClientsPage from './pages/ClientsPage.tsx';
import StoresPage from './pages/StoresPage.tsx';
import UsersPage from './pages/UsersPage.tsx';
import InvoicesPage from './pages/InvoicesPage.tsx';
import ServicesPage from './pages/ServicesPage.tsx';
import { MasterHub, FieldWorkerMaster } from './Masters.tsx';
import RoleDashboard from './RoleDashboard.tsx';
import {
  asPayload,
  type FormState,
  type ModalType,
  type OpenDialog,
  type RunAction,
} from './types.ts';

const nav: [Page, ComponentType<{ size?: number }>][] = [
  ['Overview', LayoutDashboard],
  ['Masters', Building2],
  ['Services', Wrench],
  ['Field workers', Wrench],
  ['Clients', Building2],
  ['Stores', Store],
  ['Internal users', Users],
  ['Tickets', Ticket],
  ['Invoices', FileText],
];
const SUCCESS_MESSAGES: Partial<Record<ModalType, (form: FormState) => string>> = {
  service: (form) => (form.id ? 'Service updated' : 'Service added'),
  client: () => 'Client saved',
  store: (form) => (form.id ? 'Store updated' : 'Store added'),
  user: (form) => (form.id ? 'User updated' : 'User added'),
  ticket: () => 'Ticket opened',
  assign: () => 'Worker assigned and notified',
  close: () => 'Ticket closed · invoice draft created',
  invoice: () => 'Invoice draft saved',
};
const isAction = (modal: ModalType): modal is ModalType & ActionType =>
  modal !== 'storeQr' && modal !== 'detail';

export default function App() {
  const { session, authError, data, loaded, error, setError, refresh, startSession, endSession } =
    useWorkspace(storage);
  const [page, setPage] = useState<Page>('Overview');
  const [modal, setModal] = useState<ModalType | null>(null);
  const [form, setForm] = useState<FormState>({});
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [storeClientId, setStoreClientId] = useState('');
  const [filter, setFilter] = useState<TicketFilter>('All');
  const [notice, setNotice] = useState(false);
  const [mobile, setMobile] = useState(false);
  // What the open form looked like when it opened, to tell whether the user has typed anything.
  const baseline = useRef('');
  const startForm = (value: FormState) => {
    baseline.current = JSON.stringify(value);
    setForm(value);
  };
  const hasUnsavedInput = () => {
    if (!modal || modal === 'storeQr') return false;
    // The ticket detail itself is read-only; its conversation box holds the user's draft.
    if (modal === 'detail') {
      const note = document.querySelector<HTMLTextAreaElement>(
        '.modal textarea[aria-label="Conversation message"]',
      );
      return !!note?.value.trim();
    }
    return JSON.stringify(form) !== baseline.current;
  };
  /** Close the open dialog, asking first if that would throw away what the user typed. */
  const requestClose = () => {
    if (hasUnsavedInput() && !window.confirm('Discard the details you entered?')) return;
    setModal(null);
  };
  const closeRef = useRef(requestClose);
  closeRef.current = requestClose;
  const unsavedRef = useRef(hasUnsavedInput);
  unsavedRef.current = hasUnsavedInput;
  useEffect(() => {
    // A browser back-swipe, refresh or tab close would lose the form: let the browser warn first.
    const warn = (event: BeforeUnloadEvent) => {
      if (!unsavedRef.current()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  const signedIn = (user: PublicUser) => {
    startSession(user);
    setPage('Overview');
    setModal(null);
    setNotice(false);
  };
  const signOut = async () => {
    try {
      await endSession();
      setModal(null);
      setNotice(false);
    } catch (error) {
      setError((error as Error).message);
    }
  };
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeRef.current();
        setNotice(false);
      }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  const current = session?.user;
  const actor = current?.id;
  const lookup = useMemo(() => indexWorkspace(data), [data]);
  const storeCounts = lookup.storeCounts;
  const dashboard = useMemo(() => getDashboard(current?.role, data), [current?.role, data]);
  const isClient = current?.role === 'Client';
  const isAdmin = current?.role === 'Admin';
  const canManageMasters = isAdmin;
  const canManageWorkers = isAdmin || current?.role === 'Supervisor';
  const role = current?.role ?? '';
  const canCreateTicket = ['Admin', 'Supervisor', 'Client'].includes(role);
  const worker = current?.role === 'Field Worker';
  const canManage = ['Admin', 'Supervisor'].includes(role);
  const canInvoice = ['Admin', 'Accounts'].includes(role);
  const client = (id: string | null | undefined) => lookup.clientNames.get(id ?? '') || '—';
  const store = (id: string | null | undefined) => lookup.storeNames.get(id ?? '') || '—';
  const username = (id: string | null | undefined) =>
    lookup.userNames.get(id ?? '') || 'Unassigned';
  const tickets = useMemo(
    () => data.tickets.filter((ticket) => !worker || ticket.workerId === actor),
    [data.tickets, worker, actor],
  );
  const ticketCounts = useMemo(() => summarizeTickets(tickets), [tickets]);
  const pending = ticketCounts.Pending;
  const notices = data.notifications.filter((n) => n.userId === actor);
  const unread = notices.filter((n) => !n.read).length;
  const goto = (p: Page, statusFilter: TicketFilter = 'All') => {
    if (!getRolePages(current?.role).includes(p)) return;
    setPage(p);
    setStoreClientId('');
    setQuery('');
    setFilter(statusFilter);
    setMobile(false);
    setError('');
  };
  const open: OpenDialog = (type, initial = {}) => {
    setModal(type);
    startForm(
      type === 'client'
        ? { active: true, addedOn: '', ...initial }
        : type === 'store'
          ? {
              ...initial,
              addressLine1: initial.addressLine1 ?? initial.address ?? '',
              addressLine2: initial.addressLine2 ?? '',
            }
          : type === 'ticket'
            ? {
                raisedOn: businessDate(),
                dueDate: '',
                priority: 'Low',
                ...(isClient ? { clientId: current?.clientId } : {}),
                ...initial,
              }
            : initial,
    );
    setError('');
  };
  // All dashboard form submissions use this path: save -> refresh -> update UI feedback.
  const action: RunAction = async (type, payload, message) => {
    setBusy(true);
    setError('');
    try {
      const response = await storage.action(type, payload);
      await refresh({ fresh: true }).catch(() => {
        setError(
          'Saved, but the workspace could not refresh. The next refresh will pick up the change.',
        );
      });
      const result = (response as { result?: { id?: string } }).result;
      if (type === 'user' && typeof payload.returnTicketId === 'string' && result?.id) {
        startForm({ ticketId: payload.returnTicketId, workerId: result.id });
        setModal('assign');
      } else setModal(null);
      if (message) setToast(message);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!modal || !isAction(modal)) return;
    action(modal, asPayload(form), SUCCESS_MESSAGES[modal]?.(form));
  };
  const match = (...v: unknown[]) => v.join(' ').toLowerCase().includes(query.toLowerCase());
  const visible = tickets.filter(
    (t) =>
      (filter === 'All' ||
        (filter === 'Open' ? !['Resolved', 'Closed'].includes(t.status) : t.status === filter)) &&
      match(t.number, t.issue, client(t.clientId), store(t.storeId), username(t.workerId)),
  );
  const renderTickets = (items: TicketSummary[], options: { showDates?: boolean } = {}) => (
    <TicketTable
      items={items}
      showDates={options.showDates}
      current={current}
      totalTickets={data.tickets.length}
      totalStores={data.stores.length}
      client={client}
      store={store}
      username={username}
      canManage={canManage}
      canCreateTicket={canCreateTicket}
      canManageMasters={canManageMasters}
      open={open}
    />
  );
  const titles: Record<Page, string> = {
    Overview: dashboard.title,
    Services: 'Service master',
    Masters: 'Masters',
    'Field workers': 'Field worker master',
    Clients: isClient ? 'Your clients' : 'Client master',
    Stores: isClient ? 'Your stores' : 'Store master',
    'Internal users': 'Users & logins',
    Tickets: 'Service tickets',
    Invoices: 'Invoice management',
  };
  // Login is the entry point; dashboard views are rendered only after session restoration.
  if (!session)
    return (
      <div className="auth-loading">
        <p>{authError || 'Opening your workspace…'}</p>
        {authError && (
          <button className="outline" onClick={() => window.location.reload()}>
            Retry
          </button>
        )}
      </div>
    );
  if (!session.user || !current) return <Auth session={session} onLogin={signedIn} />;
  return (
    <div className="app">
      <aside className={mobile ? 'sidebar show' : 'sidebar'}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            goto('Overview');
          }}
        >
          <span className="brand-mark">
            A<span>2</span>Z<i />
          </span>
          <div>POWER SOLUTION</div>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav>
          {nav
            .filter(([p]) => getRolePages(current?.role).includes(p))
            .map(([p, Icon]) => (
              <button className={p === page ? 'active' : ''} onClick={() => goto(p)} key={p}>
                <Icon size={19} />
                {p === 'Clients' && canManageMasters
                  ? 'Client master'
                  : p === 'Stores' && canManageMasters
                    ? 'Store master'
                    : p === 'Internal users'
                      ? 'Users & logins'
                      : p}
                {p === 'Tickets' && pending > 0 && <span className="nav-count">{pending}</span>}
              </button>
            ))}
        </nav>
        <div className="side-bottom">
          <div className="system">
            <span />
            Workspace online<small>{data.storage || 'Connecting…'}</small>
          </div>
          <div className="profile">
            <span className="avatar">{(current?.name || 'A2').slice(0, 2).toUpperCase()}</span>
            <div>
              <strong>{current?.name || 'Loading'}</strong>
              <small>{roleLabel(current?.role) || '—'}</small>
            </div>
          </div>
        </div>
      </aside>
      <div className={page === 'Tickets' ? 'main compact-tickets' : 'main'}>
        <header>
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobile(!mobile)}
              aria-label="Toggle navigation"
            >
              <Menu size={22} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{page === 'Internal users' ? 'Users & logins' : page}</strong>
          </div>
          <div className="header-actions">
            <span className="demo-tag">{roleLabel(current?.role)?.toUpperCase()}</span>
            <button className="outline compact" onClick={signOut}>
              Logout
            </button>
            <div className="notification-container">
              <button
                className="bell icon-button"
                aria-label="Notifications"
                onClick={() => setNotice(!notice)}
              >
                <Bell size={21} />
                {unread > 0 && <span>{unread}</span>}
              </button>
              {notice && (
                <div className="notification-panel">
                  <div className="panel-heading">
                    <strong>Notifications</strong>
                    <button
                      className="text-button"
                      disabled={!unread || busy}
                      onClick={() => action('read', { userId: actor } as Payload)}
                    >
                      Mark read
                    </button>
                  </div>
                  {notices.length ? (
                    notices.map((n) => (
                      <button
                        key={n.id}
                        className={`notification ${n.read ? '' : 'unread'}`}
                        onClick={async () => {
                          const ticket = data.tickets.find((ticket) => ticket.id === n.ticketId);
                          const ok = await action('read', {
                            userId: actor,
                            notificationId: n.id,
                          } as Payload);
                          if (!ok) return;
                          setNotice(false);
                          if (ticket) open('detail', ticket);
                          else if (isAdmin) goto('Internal users');
                        }}
                      >
                        <span className="avatar">
                          <Wrench size={16} />
                        </span>
                        <div>
                          {n.text}
                          <small>{new Date(n.createdAt).toLocaleString('en-IN')}</small>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="empty compact-empty">
                      <Bell size={24} />
                      <p>No notifications for this user.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <h1>{titles[page]}</h1>
            </div>
            {canCreateTicket && ['Overview', 'Tickets'].includes(page) ? (
              <button className="primary" onClick={() => open('ticket')}>
                <Plus size={18} />
                Open ticket
              </button>
            ) : page === 'Services' && canManageWorkers ? (
              <button className="primary" onClick={() => open('service')}>
                <Plus size={18} />
                Add service
              </button>
            ) : page === 'Clients' && canManageMasters ? (
              <button className="primary" onClick={() => open('client')}>
                <Plus size={18} />
                Add client
              </button>
            ) : page === 'Stores' && canManageMasters ? (
              <button className="primary" onClick={() => open('store')}>
                <Plus size={18} />
                Add store
              </button>
            ) : page === 'Field workers' && canManageWorkers ? (
              <button className="primary" onClick={() => open('user', { role: 'Field Worker' })}>
                <Plus size={18} />
                Add field worker
              </button>
            ) : page === 'Internal users' && current?.role === 'Admin' ? (
              <button className="primary" onClick={() => open('user')}>
                <Plus size={18} />
                Add user
              </button>
            ) : null}
          </div>
          {error && !modal && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {!loaded && <div className="loading">Loading your workspace…</div>}
          {page === 'Overview' && (
            <RoleDashboard
              user={current}
              data={data}
              dashboard={dashboard}
              assignedCounts={lookup.assignedCounts}
              navigate={goto}
              open={open}
              renderTickets={renderTickets}
              busy={busy}
              approve={(userId) => action('approve', { userId }, 'Account approved')}
            />
          )}
          {page === 'Services' && <ServicesPage services={data.services || []} open={open} />}
          {page === 'Masters' && <MasterHub role={current.role} navigate={(p) => goto(p)} />}
          {page === 'Field workers' && (
            <FieldWorkerMaster
              users={data.users}
              edit={(worker) => open('user', { ...worker, password: '' })}
            />
          )}
          {page === 'Tickets' && (
            <TicketsPage
              filter={filter}
              setFilter={setFilter}
              query={query}
              setQuery={setQuery}
              visible={visible}
              renderTickets={renderTickets}
              ticketCounts={ticketCounts}
            />
          )}
          {page === 'Clients' && (
            <ClientsPage
              data={data}
              query={query}
              setQuery={setQuery}
              match={match}
              canManageMasters={canManageMasters}
              open={open}
              goto={goto}
              viewStores={(clientId) => {
                goto('Stores');
                setStoreClientId(clientId);
              }}
              storeCounts={storeCounts}
              action={action}
              busy={busy}
            />
          )}
          {page === 'Stores' && (
            <StoresPage
              action={action}
              busy={busy}
              clientFilter={storeClientId}
              clearClientFilter={() => setStoreClientId('')}
              data={data}
              query={query}
              setQuery={setQuery}
              match={match}
              client={client}
              canManageMasters={canManageMasters}
              canCreateTicket={canCreateTicket}
              open={open}
            />
          )}
          {page === 'Internal users' && (
            <UsersPage
              data={data}
              client={client}
              store={store}
              isAdmin={isAdmin}
              busy={busy}
              action={action}
              edit={(account) => open('user', { ...account, password: '' })}
            />
          )}
          {page === 'Invoices' && (
            <InvoicesPage
              data={data}
              client={client}
              store={store}
              canInvoice={canInvoice}
              open={open}
            />
          )}
          <footer>
            <span>A2Z Power Solution</span>
            <span>Service, connected.</span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={20} />
          {toast}
        </div>
      )}
      <WorkspaceDialog
        modal={modal}
        setModal={setModal}
        requestClose={requestClose}
        form={
          modal === 'detail'
            ? { ...form, ...(data.tickets.find((ticket) => ticket.id === form.id) || {}) }
            : form
        }
        setForm={setForm}
        error={error}
        setError={setError}
        data={data}
        current={current}
        client={client}
        store={store}
        username={username}
        canManage={canManage}
        worker={worker}
        open={open}
        goto={(p) => goto(p)}
        busy={busy}
        submit={submit}
        onChanged={refresh}
      />
    </div>
  );
}
