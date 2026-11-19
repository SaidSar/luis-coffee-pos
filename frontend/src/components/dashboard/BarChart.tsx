import { formatMoney } from '../reports/reportUi';

export interface Bar { key: string; label: string; value: number; tickets?: number }

interface Props {
  title:      string;   // nombre corto para el resumen accesible ("Ventas por hora de hoy")
  unitName:   string;   // "hora" o "día"
  data:       Bar[];
  axisEvery?: number;   // etiqueta del eje cada N barras (24 horas → cada 3)
  tableCaption: string;
}

// Barras SVG en un solo matiz (caramel-dark) con el valor escrito sobre cada barra con ventas.
// role="img" + aria-label resume total y máximo; la tabla equivalente va en un <details>.
export default function BarChart({ title, unitName, data, axisEvery = 1, tableCaption }: Props) {
  const max = Math.max(0, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);
  const best = data.find((d) => d.value === max && max > 0);
  const W = 720, H = 180, top = 22, bottom = 22, gap = 4;
  const plotH = H - top - bottom;
  const barW = data.length ? (W - gap * (data.length - 1)) / data.length : 0;
  const label = max === 0
    ? `${title}: sin ventas.`
    : `${title}: total ${formatMoney(total)}; máximo ${formatMoney(max)} en ${best?.label}. Los mismos datos están en la tabla "${tableCaption}".`;

  return (
    <div className="flex flex-col gap-2 min-w-0">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="w-full h-44" preserveAspectRatio="none">
        <line x1="0" y1={top + plotH} x2={W} y2={top + plotH} className="stroke-espresso/40" strokeWidth="1" />
        {data.map((d, i) => {
          const h = max ? (d.value / max) * plotH : 0;
          const x = i * (barW + gap);
          return (
            <g key={d.key}>
              {h > 0 && <rect x={x} y={top + plotH - h} width={barW} height={h} rx="2" className="fill-caramel-dark" />}
              {d.value > 0 && (
                <text x={x + barW / 2} y={top + plotH - h - 5} textAnchor="middle" className="fill-espresso text-[11px] font-semibold">
                  {Math.round(d.value).toLocaleString('es-MX')}
                </text>
              )}
              {i % axisEvery === 0 && (
                <text x={x + barW / 2} y={H - 5} textAnchor="middle" className="fill-espresso/70 text-[11px]">{d.label}</text>
              )}
            </g>
          );
        })}
      </svg>
      <details className="text-sm text-espresso">
        <summary className="cursor-pointer min-h-11 inline-flex items-center font-medium rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-dark">
          Ver tabla de datos
        </summary>
        <div role="region" aria-label={`${tableCaption} (desplazable)`} tabIndex={0}
          className="mt-2 max-h-64 overflow-auto rounded-xl border border-espresso/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-dark">
          <table className="w-full text-sm">
            <caption className="sr-only">{tableCaption}</caption>
            <thead className="bg-espresso text-white sticky top-0">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-semibold capitalize">{unitName}</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Ventas</th>
                {data.some((d) => d.tickets !== undefined) && <th scope="col" className="px-3 py-2 text-right font-semibold">Tickets</th>}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.key} className="border-t border-espresso/10">
                  <th scope="row" className="px-3 py-1.5 text-left font-normal">{d.label}</th>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatMoney(d.value)}</td>
                  {d.tickets !== undefined && <td className="px-3 py-1.5 text-right tabular-nums">{d.tickets}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
