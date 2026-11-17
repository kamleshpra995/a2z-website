import { QrCode, Pencil, Plus, Trash2, RotateCcw, KeyRound } from 'lucide-react';
import type { StoreView } from '@shared/types.ts';
import RecordActionsMenu, { type MenuOption } from './RecordActionsMenu.tsx';
import type { OpenDialog, RunAction } from '../types.ts';

interface StoreActionsMenuProps {
  store: StoreView;
  archived: boolean;
  canManageMasters: boolean;
  canCreateTicket: boolean;
  canRaiseTicket: boolean;
  open: OpenDialog;
  action: RunAction;
  busy: boolean;
}

export default function StoreActionsMenu({
  store,
  archived,
  canManageMasters,
  canCreateTicket,
  canRaiseTicket,
  open,
  action,
  busy,
}: StoreActionsMenuProps) {
  const options: MenuOption[] = [
    ...(!archived ? [{ label: 'View QR', icon: QrCode, run: () => open('storeQr', store) }] : []),
    ...(canManageMasters && !archived
      ? [{ label: 'Edit store', icon: Pencil, run: () => open('store', store) }]
      : []),
    ...(canCreateTicket && !archived
      ? [
          {
            label: 'New Ticket',
            icon: Plus,
            disabled: !canRaiseTicket,
            run: () => open('ticket', { clientId: store.clientId, storeId: store.id }),
          },
        ]
      : []),
    ...(canManageMasters && !archived && !store.storeCode
      ? [
          {
            label: 'Generate Store Code',
            icon: KeyRound,
            run: () => action('storeCode', { id: store.id }, 'Store Code generated'),
          },
        ]
      : []),
    ...(canManageMasters
      ? [
          {
            label: archived ? 'Restore' : 'Delete',
            icon: archived ? RotateCcw : Trash2,
            run: () =>
              action(
                archived ? 'restore' : 'archive',
                { entity: 'store', id: store.id },
                archived ? 'Store restored' : 'Store deleted',
              ),
          },
        ]
      : []),
  ];

  return (
    <RecordActionsMenu
      name={store.name}
      entityLabel="Store"
      options={options}
      busy={busy}
      header={
        canManageMasters && !archived ? (
          <>
            Store Code<strong>{store.storeCode || 'Not generated'}</strong>
          </>
        ) : null
      }
    />
  );
}
