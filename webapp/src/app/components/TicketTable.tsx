import { Ticket, Plus, MessageSquare } from 'lucide-react';
import type { GridColDef } from '@mui/x-data-grid';
import type { PublicUser, TicketSummary } from '@shared/types.ts';
import { displayDate } from '@shared/dates.ts';
import RecordGrid from './RecordGrid.tsx';
import StatusBadge from './StatusBadge.tsx';
import type { NameLookup, OpenDialog } from '../types.ts';

export interface TicketTableProps {
  items: TicketSummary[];
  showDates?: boolean;
  current: PublicUser | null | undefined;
  totalTickets: number;
  totalStores: number;
  client: NameLookup;
  store: NameLookup;
  username: NameLookup;
  canManage: boolean;
  canCreateTicket: boolean;
  canManageMasters: boolean;
  open: OpenDialog;
}

export default function TicketTable({
  items,
  showDates = false,
  current,
  totalTickets,
  totalStores,
  client,
  store,
  username,
  canManage,
  canCreateTicket,
  canManageMasters,
  open,
}: TicketTableProps) {
  const dateColumns: GridColDef<TicketSummary>[] = showDates
    ? [
        {
          field: 'reviewer',
          headerName: 'Reviewer',
          minWidth: 155,
          flex: 1,
          valueGetter: (_value, ticket) => ticket.reviewerName,
          renderCell: ({ row: ticket }) => (
            <>
              <strong>
                {ticket.reviewerName ||
                  (ticket.reviewerId ? username(ticket.reviewerId) : 'Unassigned')}
              </strong>
              {ticket.reviewerRole && <small>{ticket.reviewerRole}</small>}
            </>
          ),
        },
        {
          field: 'raised_on',
          headerName: 'Raised on',
          minWidth: 155,
          flex: 1,
          valueGetter: (_value, ticket) => displayDate(ticket.raisedOn || ticket.createdAt),
          renderCell: ({ row: ticket }) => (
            <> {displayDate(ticket.raisedOn || ticket.createdAt)} </>
          ),
        },
        {
          field: 'last_updated',
          headerName: 'Last updated',
          minWidth: 155,
          flex: 1,
          valueGetter: (_value, ticket) => displayDate(ticket.updatedAt || ticket.createdAt),
          renderCell: ({ row: ticket }) => (
            <> {displayDate(ticket.updatedAt || ticket.createdAt)} </>
          ),
        },
        {
          field: 'due_date',
          headerName: 'Due date',
          minWidth: 155,
          flex: 1,
          valueGetter: (_value, ticket) => displayDate(ticket.dueDate),
          renderCell: ({ row: ticket }) => <>{displayDate(ticket.dueDate)}</>,
        },
      ]
    : [];
  const columns: GridColDef<TicketSummary>[] = [
    {
      field: 'ticket_issue',
      headerName: 'Ticket / Issue',
      minWidth: 240,
      flex: 1,
      valueGetter: (_value, ticket) => [ticket.number, ticket.issue].join(' '),
      renderCell: ({ row: ticket }) => (
        <>
          <button className="ticket-link" onClick={() => open('detail', ticket)}>
            {ticket.number}
          </button>
          <strong className="issue">{ticket.issue}</strong>
          <button
            className="conversation-shortcut"
            aria-label={`Conversation history ${ticket.number}`}
            title="Open conversation and follow-up history"
            onClick={() => open('detail', { ...ticket, focusConversation: true })}
          >
            <MessageSquare size={14} />
            <span>History</span>
            <span className="count">{ticket.conversationCount || 0}</span>
          </button>
          {ticket.nextFollowUpAt && (
            <small className={new Date(ticket.nextFollowUpAt) < new Date() ? 'due-overdue' : ''}>
              Follow-up: {new Date(ticket.nextFollowUpAt).toLocaleString('en-IN')}
            </small>
          )}
        </>
      ),
    },
    {
      field: 'client_store',
      headerName: 'Client & Store',
      minWidth: 155,
      flex: 1,
      valueGetter: (_value, ticket) => [client(ticket.clientId), store(ticket.storeId)].join(' '),
      renderCell: ({ row: ticket }) => (
        <>
          <strong>{client(ticket.clientId)}</strong>
          <small>{store(ticket.storeId)}</small>
        </>
      ),
    },
    {
      field: 'field_worker',
      headerName: 'Field worker',
      minWidth: 155,
      flex: 1,
      valueGetter: (_value, ticket) => username(ticket.workerId),
      renderCell: ({ row: ticket }) => (
        <>
          <span className={`person ${ticket.workerId ? '' : 'muted'}`}>
            <span className="avatar small">
              {ticket.workerId ? username(ticket.workerId).slice(0, 2).toUpperCase() : '—'}
            </span>
            {username(ticket.workerId)}
          </span>
          {!showDates && (ticket.reviewerId || ticket.reviewerName) && (
            <small>Reviewer: {ticket.reviewerName || username(ticket.reviewerId)}</small>
          )}
        </>
      ),
    },
    ...dateColumns,
    {
      field: 'priority',
      headerName: 'Priority',
      minWidth: 155,
      flex: 1,
      valueGetter: (_value, ticket) => ticket.priority,
      renderCell: ({ row: ticket }) => (
        <span className={`priority ${ticket.priority.toLowerCase()}`}>{ticket.priority}</span>
      ),
    },
    {
      field: 'status',
      headerName: 'Status',
      minWidth: 155,
      flex: 1,
      valueGetter: (_value, ticket) => ticket.status,
      renderCell: ({ row: ticket }) => <StatusBadge value={ticket.status} />,
    },
    {
      field: 'actions',
      headerName: 'Actions',
      minWidth: 145,
      flex: 1,
      filterable: false,
      sortable: false,
      renderCell: ({ row: ticket }) => (
        <>
          {' '}
          {!['Resolved', 'Closed'].includes(ticket.status) &&
          canManage &&
          (current?.role === 'Admin' || !ticket.reviewerId || ticket.reviewerId === current?.id) ? (
            <button
              className="outline compact"
              onClick={() => open('assign', { ticketId: ticket.id, workerId: ticket.workerId })}
            >
              {ticket.workerId ? 'Reassign' : 'Assign worker'}
            </button>
          ) : (
            <button
              className="outline compact"
              aria-label={`Open ${ticket.number}`}
              onClick={() => open('detail', ticket)}
            >
              Open
            </button>
          )}{' '}
        </>
      ),
    },
  ];
  return (
    <div className="table-wrap">
      <RecordGrid rows={items} columns={columns} onOpen={(ticket) => open('detail', ticket)} />
      {!items.length && (
        <div className="empty">
          <Ticket size={30} />
          <h3>{totalTickets ? 'No matching tickets' : 'Your first ticket starts here'}</h3>
          <p>
            {totalTickets
              ? 'Try another search or status.'
              : 'Add a store, then open a ticket to start tracking service work.'}
          </p>
          {canCreateTicket && !totalTickets && (
            <button
              className="outline"
              disabled={!totalStores && !canManageMasters}
              onClick={() => open(totalStores ? 'ticket' : 'store')}
            >
              {totalStores
                ? 'Open a ticket'
                : canManageMasters
                  ? 'Add your first store'
                  : 'Ask Admin to add a store'}
              <Plus size={15} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
