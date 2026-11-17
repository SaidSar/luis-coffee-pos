import type { ReactNode } from 'react';
import { focusRing } from './reportUi';

export interface ColumnDef<T> {
  header: string;
  cell:   (row: T) => ReactNode;
  align?: 'left' | 'right';
  // Primera columna: encabezado de fila (<th scope="row">)
  rowHeader?: boolean;
}

interface Props<T> {
  caption: string;
  columns: ColumnDef<T>[];
  rows:    T[];
  rowKey:  (row: T) => string;
  footer?: ReactNode[]; // celdas de la fila de totales (misma cantidad que columnas)
}

// Tabla accesible: <caption>, <th scope>, y contenedor desplazable enfocable para pantallas angostas
export default function DataTable<T>({ caption, columns, rows, rowKey, footer }: Props<T>) {
  const alignCls = (a?: 'left' | 'right') => (a === 'right' ? 'text-right tabular-nums' : 'text-left');
  return (
    <div
      role="region"
      aria-label={`${caption} (desplazable)`}
      tabIndex={0}
      className={`overflow-x-auto rounded-xl border border-espresso/15 ${focusRing}`}
    >
      <table className="w-full min-w-max text-sm text-espresso">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-espresso text-white">
          <tr>
            {columns.map((c) => (
              <th key={c.header} scope="col" className={`px-3 py-2 font-semibold whitespace-nowrap ${alignCls(c.align)}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-espresso/10">
          {rows.map((r) => (
            <tr key={rowKey(r)} className="even:bg-cream/40">
              {columns.map((c) =>
                c.rowHeader ? (
                  <th key={c.header} scope="row" className={`px-3 py-2 font-medium whitespace-nowrap ${alignCls(c.align)}`}>{c.cell(r)}</th>
                ) : (
                  <td key={c.header} className={`px-3 py-2 whitespace-nowrap ${alignCls(c.align)}`}>{c.cell(r)}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot className="border-t-2 border-espresso/40 font-bold">
            <tr>
              {footer.map((cell, i) =>
                i === 0 ? (
                  <th key={i} scope="row" className="px-3 py-2 text-left">{cell}</th>
                ) : (
                  <td key={i} className={`px-3 py-2 whitespace-nowrap ${alignCls(columns[i]?.align)}`}>{cell}</td>
                ),
              )}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
