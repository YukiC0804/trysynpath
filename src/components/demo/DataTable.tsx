import type { ReactNode } from 'react';

interface DataTableColumn {
  key: string;
  header: string;
  align?: 'left' | 'right' | 'center';
  className?: string;
}

interface DataTableProps {
  columns: DataTableColumn[];
  rows: Record<string, ReactNode>[];
  minWidth?: string;
}

export function DataTable({ columns, rows, minWidth = '520px' }: DataTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-800">
      <table className="w-full text-left text-xs" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-neutral-800 bg-neutral-900 text-neutral-500">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-3 py-2 font-medium ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''} ${col.className ?? ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800 text-neutral-300">
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-3 py-2 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''} ${col.className ?? ''}`}
                >
                  {row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
