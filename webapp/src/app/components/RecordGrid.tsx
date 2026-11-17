import type { ReactNode } from 'react';
import { Columns3, ListFilter, Download } from 'lucide-react';
import {
  DataGrid,
  Toolbar,
  ToolbarButton,
  FilterPanelTrigger,
  ColumnsPanelTrigger,
  ExportCsv,
  GridToolbarQuickFilter,
  type GridColDef,
  type GridValidRowModel,
} from '@mui/x-data-grid';

declare module '@mui/x-data-grid' {
  interface ToolbarPropsOverrides {
    controls?: ReactNode;
    iconActions?: boolean;
    toolbarTitle?: ReactNode;
  }
}

interface ToolbarProps {
  controls?: ReactNode;
  iconActions?: boolean;
  toolbarTitle?: ReactNode;
}

function CompactToolbar({ controls, iconActions, toolbarTitle }: ToolbarProps) {
  const actions = (
    <>
      <ColumnsPanelTrigger render={<ToolbarButton aria-label="Choose columns" title="Columns" />}>
        {iconActions ? <Columns3 size={18} aria-hidden="true" /> : 'Columns'}
      </ColumnsPanelTrigger>
      <FilterPanelTrigger render={<ToolbarButton aria-label="Filter records" title="Filters" />}>
        {iconActions ? <ListFilter size={18} aria-hidden="true" /> : 'Filters'}
      </FilterPanelTrigger>
      <ExportCsv render={<ToolbarButton aria-label="Export CSV" title="Export CSV" />}>
        {iconActions ? <Download size={18} aria-hidden="true" /> : 'Export'}
      </ExportCsv>
      {toolbarTitle && (
        <GridToolbarQuickFilter quickFilterParser={(search) => search.split(' ').filter(Boolean)} />
      )}
    </>
  );
  return (
    <Toolbar
      className={toolbarTitle ? 'master-grid-toolbar titled-grid-toolbar' : 'master-grid-toolbar'}
    >
      {toolbarTitle || controls}
      {toolbarTitle ? <div className="field-worker-toolbar-actions">{actions}</div> : actions}
    </Toolbar>
  );
}

export interface RecordGridProps<R extends GridValidRowModel> extends ToolbarProps {
  rows: readonly R[];
  columns: GridColDef<R>[];
  onOpen?: (row: R) => unknown;
  compact?: boolean;
}

export default function RecordGrid<R extends GridValidRowModel>({
  rows,
  columns,
  onOpen,
  compact = false,
  controls,
  iconActions = false,
  toolbarTitle,
}: RecordGridProps<R>) {
  return (
    <div className={compact ? 'record-grid record-grid-compact' : 'record-grid'}>
      <DataGrid<R>
        rows={rows}
        columns={columns}
        showToolbar
        slots={compact ? { toolbar: CompactToolbar } : undefined}
        slotProps={compact ? { toolbar: { controls, iconActions, toolbarTitle } } : undefined}
        columnHeaderHeight={compact ? 36 : 40}
        density={compact ? 'compact' : 'standard'}
        disableRowSelectionOnClick
        getRowHeight={() => 'auto'}
        initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
        pageSizeOptions={[10, 25, 50]}
        onRowDoubleClick={({ row }, event) => {
          if (
            !(event.target as HTMLElement).closest(
              'button, a, input, select, textarea, [role="menuitem"]',
            )
          ) {
            onOpen?.(row);
          }
        }}
        sx={{
          border: 0,
          '--DataGrid-overlayHeight': '88px',
          '& .MuiDataGrid-columnHeader, & .MuiDataGrid-cell': { px: 1.5 },
          '& .MuiDataGrid-cell': {
            alignContent: 'center',
            whiteSpace: 'normal',
            overflowWrap: 'anywhere',
            py: 0.75,
          },
        }}
      />
    </div>
  );
}
