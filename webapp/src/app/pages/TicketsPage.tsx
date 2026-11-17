import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import type { TicketCounts, TicketFilter } from '@shared/tickets.ts';
import type { TicketSummary } from '@shared/types.ts';

const FILTERS: TicketFilter[] = ['All', 'Open', 'Pending', 'Assigned', 'Resolved', 'Closed'];

interface TicketsPageProps {
  filter: TicketFilter;
  setFilter: (filter: TicketFilter) => void;
  query: string;
  setQuery: (query: string) => void;
  visible: TicketSummary[];
  renderTickets: (items: TicketSummary[], options?: { showDates?: boolean }) => ReactNode;
  ticketCounts: TicketCounts;
}

export default function TicketsPage({
  filter,
  setFilter,
  query,
  setQuery,
  visible,
  renderTickets,
  ticketCounts,
}: TicketsPageProps) {
  return (
    <section className="section-card tickets-page">
      <div className="toolbar">
        <div className="tabs">
          {FILTERS.map((s) => (
            <button className={filter === s ? 'selected' : ''} key={s} onClick={() => setFilter(s)}>
              {s}
              <span>{ticketCounts[s] || 0}</span>
            </button>
          ))}
        </div>
        <label className="search">
          <Search size={17} />
          <input
            aria-label="Search tickets"
            placeholder="Search tickets…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>

      {renderTickets(visible, { showDates: true })}
    </section>
  );
}
