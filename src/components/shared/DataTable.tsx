import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  /** Primary column emphasized on mobile cards */
  primary?: boolean;
  className?: string;
  cell: (row: T) => ReactNode;
}

/** Desktop table + mobile stacked cards — §9.1 */
export function DataTable<T extends { id: string }>({
  columns,
  rows,
  empty,
  onRowClick,
  className,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  className?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="surface-card">
        <div className="px-4 py-10 text-center text-[11px] font-medium text-[#5A6B7D]">
          {empty ?? "Nothing to show."}
        </div>
      </div>
    );
  }

  const primary = columns.find((c) => c.primary) ?? columns[0];
  const rest = columns.filter((c) => c !== primary);

  return (
    <div className={cn("surface-card", className)}>
      {/* Mobile card list */}
      <div className="divide-y divide-[rgba(14,31,26,0.06)] md:hidden">
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => onRowClick?.(row)}
            className={cn("w-full px-3 py-3 text-left", onRowClick && "hover:bg-[#F7FAF6]")}
          >
            <div className="text-sm font-medium text-[#0E1F1A]">{primary.cell(row)}</div>
            {rest.length > 0 && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {rest.map((col) => (
                  <div key={col.key}>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-[#5A6B7D]">
                      {col.header}
                    </div>
                    <div className="text-[12px] font-medium text-[#0E1F1A]">{col.cell(row)}</div>
                  </div>
                ))}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key}>{col.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={cn(onRowClick && "cursor-pointer")}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <td key={col.key} className={col.className}>
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
