/**
 * Data Table View - No-code database style view for constellation data
 *
 * Shows:
 * - Ground stations with all properties
 * - Satellites with orbital parameters
 * - FSO links with quality metrics
 * - Sortable, filterable, editable (future)
 */

import { useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  ColumnDef,
  SortingState,
} from '@tanstack/react-table';
import { ArrowUpDown, ArrowUp, ArrowDown, Search, Database, Satellite, Radio, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GroundNode, Satellite as SatelliteType } from '@/types';

// FSO Link type for internal use
export interface FsoLink {
  id: string;
  source_id: string;
  target_id: string;
  link_type: 'sat-sat' | 'sat-ground';
  margin_db: number;
  throughput_gbps: number;
  active: boolean;
  weather_score: number;
}

type DataType = 'ground-stations' | 'satellites' | 'fso-links';

interface DataTableViewProps {
  groundStations: GroundNode[];
  satellites: SatelliteType[];
  fsoLinks: FsoLink[];
  onRowSelect?: (type: DataType, id: string) => void;
  initialTab?: DataType;
}

// Status badge component
function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-green-500/20 text-green-400 border-green-500/30',
    operational: 'bg-green-500/20 text-green-400 border-green-500/30',
    degraded: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    offline: 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  return (
    <span className={cn(
      'px-2 py-0.5 rounded-full text-xs font-medium border',
      colors[status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    )}>
      {status}
    </span>
  );
}

// Quality indicator
function QualityBar({ value, max = 10 }: { value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = pct >= 60 ? 'bg-green-500' : pct >= 30 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-2 bg-slate-700 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-400">{value.toFixed(1)}</span>
    </div>
  );
}

// Column header with sort
function SortableHeader({ column, children }: { column: any; children: React.ReactNode }) {
  return (
    <button
      className="flex items-center gap-1 hover:text-white transition-colors"
      onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
    >
      {children}
      {column.getIsSorted() === 'asc' ? (
        <ArrowUp className="w-3 h-3" />
      ) : column.getIsSorted() === 'desc' ? (
        <ArrowDown className="w-3 h-3" />
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-50" />
      )}
    </button>
  );
}

// Ground stations columns (using GroundNode type)
const groundStationColumns: ColumnDef<GroundNode>[] = [
  {
    accessorKey: 'id',
    header: ({ column }) => <SortableHeader column={column}>ID</SortableHeader>,
    cell: ({ row }) => <span className="font-mono text-xs">{row.getValue('id')}</span>,
  },
  {
    accessorKey: 'name',
    header: ({ column }) => <SortableHeader column={column}>Name</SortableHeader>,
  },
  {
    accessorKey: 'latitude',
    header: ({ column }) => <SortableHeader column={column}>Lat</SortableHeader>,
    cell: ({ row }) => <span className="font-mono text-xs">{(row.getValue('latitude') as number).toFixed(4)}</span>,
  },
  {
    accessorKey: 'longitude',
    header: ({ column }) => <SortableHeader column={column}>Lon</SortableHeader>,
    cell: ({ row }) => <span className="font-mono text-xs">{(row.getValue('longitude') as number).toFixed(4)}</span>,
  },
  {
    accessorKey: 'tier',
    header: ({ column }) => <SortableHeader column={column}>Tier</SortableHeader>,
    cell: ({ row }) => {
      const tier = row.getValue('tier') as number;
      const colors = ['', 'text-blue-400', 'text-green-400', 'text-yellow-400'];
      return <span className={cn('font-semibold', colors[tier])}>Tier {tier}</span>;
    },
  },
  {
    accessorKey: 'demand_gbps',
    header: ({ column }) => <SortableHeader column={column}>Demand</SortableHeader>,
    cell: ({ row }) => <span className="font-mono">{(row.getValue('demand_gbps') as number).toFixed(1)} Gbps</span>,
  },
  {
    accessorKey: 'weather_score',
    header: ({ column }) => <SortableHeader column={column}>Weather</SortableHeader>,
    cell: ({ row }) => <QualityBar value={(row.getValue('weather_score') as number) * 10} max={10} />,
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <StatusBadge status={row.getValue('status')} />,
  },
];

// Satellites columns (using Satellite type)
const satelliteColumns: ColumnDef<SatelliteType>[] = [
  {
    accessorKey: 'id',
    header: ({ column }) => <SortableHeader column={column}>ID</SortableHeader>,
    cell: ({ row }) => <span className="font-mono text-xs">{row.getValue('id')}</span>,
  },
  {
    accessorKey: 'name',
    header: ({ column }) => <SortableHeader column={column}>Name</SortableHeader>,
  },
  {
    accessorKey: 'altitude',
    header: ({ column }) => <SortableHeader column={column}>Alt (km)</SortableHeader>,
    cell: ({ row }) => <span className="font-mono">{(row.getValue('altitude') as number).toFixed(0)}</span>,
  },
  {
    accessorKey: 'inclination',
    header: ({ column }) => <SortableHeader column={column}>Inc</SortableHeader>,
    cell: ({ row }) => <span className="font-mono">{(row.getValue('inclination') as number).toFixed(1)}°</span>,
  },
  {
    accessorKey: 'latitude',
    header: ({ column }) => <SortableHeader column={column}>Lat</SortableHeader>,
    cell: ({ row }) => <span className="font-mono text-xs">{(row.getValue('latitude') as number).toFixed(4)}</span>,
  },
  {
    accessorKey: 'longitude',
    header: ({ column }) => <SortableHeader column={column}>Lon</SortableHeader>,
    cell: ({ row }) => <span className="font-mono text-xs">{(row.getValue('longitude') as number).toFixed(4)}</span>,
  },
  {
    accessorKey: 'qber',
    header: ({ column }) => <SortableHeader column={column}>QBER</SortableHeader>,
    cell: ({ row }) => {
      const qber = row.getValue('qber') as number;
      const color = qber < 3 ? 'text-green-400' : qber < 5 ? 'text-yellow-400' : 'text-red-400';
      return <span className={cn('font-mono', color)}>{qber.toFixed(2)}%</span>;
    },
  },
  {
    accessorKey: 'jammed',
    header: 'Jammed',
    cell: ({ row }) => row.getValue('jammed') ? (
      <span className="text-red-400">⚠ Yes</span>
    ) : (
      <span className="text-green-400">No</span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <StatusBadge status={row.getValue('status')} />,
  },
];

// FSO links columns
const fsoLinkColumns: ColumnDef<FsoLink>[] = [
  {
    accessorKey: 'id',
    header: ({ column }) => <SortableHeader column={column}>Link ID</SortableHeader>,
    cell: ({ row }) => <span className="font-mono text-xs">{row.getValue('id')}</span>,
  },
  {
    accessorKey: 'source_id',
    header: ({ column }) => <SortableHeader column={column}>Source</SortableHeader>,
    cell: ({ row }) => <span className="font-mono text-xs">{row.getValue('source_id')}</span>,
  },
  {
    accessorKey: 'target_id',
    header: ({ column }) => <SortableHeader column={column}>Target</SortableHeader>,
    cell: ({ row }) => <span className="font-mono text-xs">{row.getValue('target_id')}</span>,
  },
  {
    accessorKey: 'link_type',
    header: 'Type',
    cell: ({ row }) => {
      const type = row.getValue('link_type') as string;
      return type === 'sat-sat' ? (
        <span className="text-cyan-400">ISL</span>
      ) : (
        <span className="text-purple-400">Ground</span>
      );
    },
  },
  {
    accessorKey: 'margin_db',
    header: ({ column }) => <SortableHeader column={column}>Margin (dB)</SortableHeader>,
    cell: ({ row }) => <QualityBar value={row.getValue('margin_db')} max={10} />,
  },
  {
    accessorKey: 'throughput_gbps',
    header: ({ column }) => <SortableHeader column={column}>Throughput</SortableHeader>,
    cell: ({ row }) => <span className="font-mono">{(row.getValue('throughput_gbps') as number).toFixed(1)} Gbps</span>,
  },
  {
    accessorKey: 'weather_score',
    header: ({ column }) => <SortableHeader column={column}>Weather</SortableHeader>,
    cell: ({ row }) => <QualityBar value={(row.getValue('weather_score') as number) * 10} max={10} />,
  },
  {
    accessorKey: 'active',
    header: 'Active',
    cell: ({ row }) => row.getValue('active') ? (
      <span className="text-green-400">Active</span>
    ) : (
      <span className="text-red-400">Down</span>
    ),
  },
];

// Generic table component
function DataTable<T>({
  data,
  columns,
  globalFilter,
}: {
  data: T[];
  columns: ColumnDef<T>[];
  globalFilter: string;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="overflow-auto">
      <table className="w-full">
        <thead className="bg-slate-800 sticky top-0">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider"
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y divide-slate-700">
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className="hover:bg-slate-800/50 cursor-pointer transition-colors"
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-3 py-2 text-sm text-slate-300">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {table.getRowModel().rows.length === 0 && (
        <div className="text-center py-8 text-slate-500">
          No data found
        </div>
      )}
    </div>
  );
}

export function DataTableView({
  groundStations,
  satellites,
  fsoLinks,
  onRowSelect: _onRowSelect, // TODO: Wire row click handlers to navigate/highlight
  initialTab = 'ground-stations',
}: DataTableViewProps) {
  const [activeTab, setActiveTab] = useState<DataType>(initialTab);
  const [globalFilter, setGlobalFilter] = useState('');

  const tabs = [
    { id: 'ground-stations' as DataType, label: 'Ground Stations', icon: Radio, count: groundStations.length },
    { id: 'satellites' as DataType, label: 'Satellites', icon: Satellite, count: satellites.length },
    { id: 'fso-links' as DataType, label: 'FSO Links', icon: Zap, count: fsoLinks.length },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-900 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-semibold text-white">Constellation Data</h2>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-9 pr-4 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'bg-cyan-500/20 text-cyan-400'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              <span className="px-1.5 py-0.5 bg-slate-700 rounded text-xs">
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Table content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'ground-stations' && (
          <DataTable data={groundStations} columns={groundStationColumns} globalFilter={globalFilter} />
        )}
        {activeTab === 'satellites' && (
          <DataTable data={satellites} columns={satelliteColumns} globalFilter={globalFilter} />
        )}
        {activeTab === 'fso-links' && (
          <DataTable data={fsoLinks} columns={fsoLinkColumns} globalFilter={globalFilter} />
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-slate-700 text-xs text-slate-500 flex justify-between">
        <span>
          {activeTab === 'ground-stations' && `${groundStations.length} ground stations`}
          {activeTab === 'satellites' && `${satellites.length} satellites`}
          {activeTab === 'fso-links' && `${fsoLinks.length} FSO links`}
        </span>
        <span>Click column headers to sort</span>
      </div>
    </div>
  );
}

export default DataTableView;
