import type { WorkspaceState } from '../shared/types.ts';

export const createState = (): WorkspaceState => ({
  clients: [],
  services: [],
  stores: [],
  users: [{ id: 'admin', name: 'A2Z Admin', role: 'Admin', phone: '', email: '' }],
  tickets: [],
  notifications: [],
  invoices: [],
});
