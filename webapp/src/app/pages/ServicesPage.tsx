import { useState } from 'react';
import { Search, Wrench } from 'lucide-react';
import type { Service } from '@shared/types.ts';
import RecordGrid from '../components/RecordGrid.tsx';
import type { OpenDialog } from '../types.ts';

export default function ServicesPage({
  services,
  open,
}: {
  services: Service[];
  open: OpenDialog;
}) {
  const [query, setQuery] = useState('');
  const visible = services.filter((service) =>
    `${service.name} ${service.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="section-card">
      <div className="section-heading">
        <div>
          <h2>
            Service master <span className="count">{services.length}</span>
          </h2>
        </div>
        <label className="search">
          <Search size={17} />
          <input
            aria-label="Search services"
            placeholder="Search services…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      <div className="table-wrap">
        <RecordGrid
          rows={visible}
          columns={[
            {
              field: 'service',
              headerName: 'Service',
              minWidth: 155,
              flex: 1,
              valueGetter: (_value, service) => service.name,
              renderCell: ({ row: service }) => (
                <>
                  <strong>{service.name}</strong>
                </>
              ),
            },
            {
              field: 'description',
              headerName: 'Description',
              minWidth: 155,
              flex: 1,
              valueGetter: (_value, service) => service.description,
              renderCell: ({ row: service }) => <>{service.description || '—'}</>,
            },
            {
              field: 'status',
              headerName: 'Status',
              minWidth: 155,
              flex: 1,
              valueGetter: (_value, service) => (service.active === false ? 'Inactive' : 'Active'),
              renderCell: ({ row: service }) => (
                <>
                  <span className="neutral-tag">
                    {service.active === false ? 'Inactive' : 'Active'}
                  </span>
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
              renderCell: ({ row: service }) => (
                <>
                  {' '}
                  <button className="outline compact" onClick={() => open('service', service)}>
                    Edit service
                  </button>{' '}
                </>
              ),
            },
          ]}
          onOpen={(service) => open('service', service)}
        />
        {!visible.length && (
          <div className="empty">
            <Wrench size={28} />
            <h3>No services found</h3>
            <p>Add services so Customers can select them when raising complaints.</p>
          </div>
        )}
      </div>
    </section>
  );
}
