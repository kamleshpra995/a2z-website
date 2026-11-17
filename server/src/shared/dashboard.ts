import { summarizeTickets, type TicketFilter } from './tickets.ts';
import type { Role, TicketStatus } from './types.ts';

export type Page =
  | 'Overview'
  | 'Masters'
  | 'Services'
  | 'Clients'
  | 'Stores'
  | 'Field workers'
  | 'Internal users'
  | 'Tickets'
  | 'Invoices';

export type MetricKind = 'tickets' | 'users' | 'clients' | 'stores' | 'invoices';

export interface Metric {
  label: string;
  count: number;
  page: Page;
  filter: TicketFilter;
  kind: MetricKind;
}

export interface Dashboard {
  title: string;
  subtitle: string;
  headline: string;
  description: string;
  queueTitle: string;
  queueDescription: string;
  stats: Metric[];
}

/** The subset of the workspace snapshot the dashboard counts. */
export interface DashboardData {
  tickets: readonly { status: TicketStatus }[];
  users: readonly { accountStatus?: string }[];
  clients: readonly unknown[];
  stores: readonly unknown[];
  invoices: readonly unknown[];
}

/** The same role map drives navigation and dashboard links. Client is displayed as Customer. */
const pages: Record<Role, Page[]> = {
  Admin: [
    'Overview',
    'Masters',
    'Services',
    'Clients',
    'Stores',
    'Field workers',
    'Internal users',
    'Tickets',
    'Invoices',
  ],
  Client: ['Overview', 'Clients', 'Stores', 'Tickets', 'Invoices'],
  Supervisor: ['Overview', 'Masters', 'Services', 'Stores', 'Field workers', 'Tickets'],
  'Field Worker': ['Overview', 'Tickets'],
  Accounts: ['Overview', 'Tickets', 'Invoices'],
};
export const getRolePages = (role: Role | undefined): Page[] => (role ? pages[role] : []);
export const roleLabel = (role: Role | undefined): string =>
  role === 'Client' ? 'Customer' : (role ?? '');

export function getDashboard(role: Role | undefined, data: DashboardData): Dashboard {
  const tickets = data.tickets;
  const { Pending: pending, Assigned: assigned, Closed: closed } = summarizeTickets(tickets);
  const metric = (
    label: string,
    count: number,
    page: Page,
    filter: TicketFilter = 'All',
    kind: MetricKind = 'tickets',
  ): Metric => ({ label, count, page, filter, kind });
  if (role === 'Admin')
    return {
      title: 'Admin dashboard',
      subtitle: 'Track customers, your team, service delivery and billing.',
      headline: 'Your entire operation, in view.',
      description:
        'Approve new accounts, organize stores and follow every service request through to billing.',
      queueTitle: 'Service activity',
      queueDescription: 'Latest tickets across all customers and stores.',
      stats: [
        metric('Open tickets', pending + assigned, 'Tickets', 'Open'),
        metric(
          'Pending approvals',
          data.users.filter((user) => user.accountStatus === 'Pending').length,
          'Internal users',
          'All',
          'users',
        ),
        metric('Customers', data.clients.length, 'Clients', 'All', 'clients'),
        metric('Invoice drafts', data.invoices.length, 'Invoices', 'All', 'invoices'),
      ],
    };
  if (role === 'Client')
    return {
      title: 'Customer dashboard',
      subtitle: 'View your records and raise complaints. Setup changes are managed by Admin.',
      headline: 'Support for every one of your stores.',
      description:
        'Raise a complaint, follow the assigned service team and check completed work for your company.',
      queueTitle: 'Your recent requests',
      queueDescription: 'Only requests belonging to your company are shown.',
      stats: [
        metric('Your stores', data.stores.length, 'Stores', 'All', 'stores'),
        metric('Open requests', pending + assigned, 'Tickets', 'Open'),
        metric('Completed requests', closed, 'Tickets', 'Closed'),
        metric('Invoice drafts', data.invoices.length, 'Invoices', 'All', 'invoices'),
      ],
    };
  if (role === 'Supervisor')
    return {
      title: 'Supervisor dashboard',
      subtitle: 'Prioritize pending jobs, assign workers and follow service completion.',
      headline: 'Keep field service moving.',
      description:
        'Start with the pending queue, assign the right worker and close completed jobs to prepare invoice drafts.',
      queueTitle: 'Pending assignment',
      queueDescription:
        'High-priority requests are shown first. Assign a worker directly from this queue.',
      stats: [
        metric('Pending assignment', pending, 'Tickets', 'Pending'),
        metric('Assigned jobs', assigned, 'Tickets', 'Assigned'),
        metric('Completed jobs', closed, 'Tickets', 'Closed'),
        metric('All service tickets', tickets.length, 'Tickets'),
      ],
    };
  return {
    title: role === 'Accounts' ? 'Accounts dashboard' : 'Field worker dashboard',
    subtitle:
      role === 'Accounts'
        ? 'Review closed jobs and prepare invoice drafts.'
        : 'Your assigned jobs and service updates.',
    headline: role === 'Accounts' ? 'Keep billing up to date.' : 'Your work, clearly organized.',
    description:
      role === 'Accounts'
        ? 'Open an invoice draft to record its service description and amount.'
        : 'Open your assigned ticket, complete the service and close the job.',
    queueTitle: role === 'Accounts' ? 'Recent service jobs' : 'Your assigned jobs',
    queueDescription: 'Live records from your workspace.',
    stats: [
      metric('Pending', pending, 'Tickets', 'Pending'),
      metric('Assigned', assigned, 'Tickets', 'Assigned'),
      metric('Completed', closed, 'Tickets', 'Closed'),
      role === 'Accounts'
        ? metric('Invoice drafts', data.invoices.length, 'Invoices', 'All', 'invoices')
        : metric('All your jobs', tickets.length, 'Tickets'),
    ],
  };
}
