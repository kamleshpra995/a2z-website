import { FileText } from 'lucide-react';
import type { WorkspaceView } from '@shared/types.ts';
import RecordGrid from '../components/RecordGrid.tsx';
import StatusBadge from '../components/StatusBadge.tsx';
import type { NameLookup, OpenDialog } from '../types.ts';

const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

interface InvoicesPageProps {
  data: WorkspaceView;
  client: NameLookup;
  store: NameLookup;
  canInvoice: boolean;
  open: OpenDialog;
}

export default function InvoicesPage({ data, client, store, canInvoice, open }: InvoicesPageProps) {
  return (
    <>
      <div className="info-note">
        <FileText size={18} />
        <span>An invoice draft is created automatically when an assigned ticket is closed.</span>
      </div>
      <section className="section-card">
        <div className="table-wrap">
          <RecordGrid
            rows={data.invoices}
            columns={[
              {
                field: 'invoice_draft',
                headerName: 'Invoice draft',
                minWidth: 155,
                flex: 1,
                valueGetter: (_value, invoice) => invoice.number,
                renderCell: ({ row: invoice }) => (
                  <>
                    <strong>{invoice.number}</strong>
                    <small>{new Date(invoice.createdAt).toLocaleDateString('en-IN')}</small>
                  </>
                ),
              },
              {
                field: 'client_store',
                headerName: 'Client / Store',
                minWidth: 155,
                flex: 1,
                valueGetter: (_value, invoice) =>
                  [client(invoice.clientId), store(invoice.storeId)].join(' '),
                renderCell: ({ row: invoice }) => (
                  <>
                    <strong>{client(invoice.clientId)}</strong>
                    <small>{store(invoice.storeId)}</small>
                  </>
                ),
              },
              {
                field: 'description',
                headerName: 'Description',
                minWidth: 155,
                flex: 1,
                valueGetter: (_value, invoice) => invoice.description,
                renderCell: ({ row: invoice }) => <>{invoice.description}</>,
              },
              {
                field: 'amount',
                headerName: 'Amount',
                minWidth: 155,
                flex: 1,
                valueGetter: (_value, invoice) => invoice.amount,
                renderCell: ({ row: invoice }) => (
                  <>{invoice.amount === '' ? 'To be added' : currency.format(invoice.amount)}</>
                ),
              },
              {
                field: 'status',
                headerName: 'Status',
                minWidth: 155,
                flex: 1,
                valueGetter: (_value, invoice) => invoice.status,
                renderCell: () => (
                  <>
                    <StatusBadge value="Draft" />
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
                renderCell: ({ row: invoice }) => (
                  <>
                    {' '}
                    {canInvoice && (
                      <button className="outline compact" onClick={() => open('invoice', invoice)}>
                        Edit draft
                      </button>
                    )}{' '}
                  </>
                ),
              },
            ]}
            onOpen={(invoice) => canInvoice && open('invoice', invoice)}
          />
          {!data.invoices.length && (
            <div className="empty">
              <FileText size={32} />
              <h3>No invoice drafts yet</h3>
              <p>Close a completed service ticket to create its invoice draft.</p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
