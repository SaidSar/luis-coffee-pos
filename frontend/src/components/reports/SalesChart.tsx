import type { SalesPeriod } from '../../types/reports';
import { formatMoney } from './reportUi';

interface Props {
  data:       SalesPeriod[];
  periodName: string;               // "día", "semana" o "mes"
  labelOf:    (p: SalesPeriod) => string;
}

// Gráfica de barras SVG simple. La información equivalente está en la tabla de ventas por periodo;
// el aria-label resume los datos clave sin depender del color.
export default function SalesChart({ data, periodName, labelOf }: Props) {
  const max = Math.max(...data.map((d) => d.sales), 0);
  const total = data.reduce((s, d) => s + d.sales, 0);
  const best = data.reduce<SalesPeriod | null>((b, d) => (d.sales > (b?.sales ?? -1) ? d : b), null);
  const W = 600, H = 160, gap = 4;
  const barW = data.length ? Math.max((W - gap * (data.length - 1)) / data.length, 2) : 0;

  const label = max === 0
    ? `Gráfica de ventas por ${periodName}: sin ventas en el periodo.`
    : `Gráfica de ventas por ${periodName}: ${data.length} ${data.length === 1 ? 'periodo' : 'periodos'}, total ${formatMoney(total)}; máximo ${formatMoney(max)} en ${best ? labelOf(best) : ''}. Los mismos datos están en la tabla siguiente.`;

  return (
    <svg viewBox={`0 0 ${W} ${H + 2}`} role="img" aria-label={label} className="w-full h-40" preserveAspectRatio="none">
      <line x1="0" y1={H} x2={W} y2={H} className="stroke-espresso/40" strokeWidth="1" />
      {max > 0 && data.map((d, i) => {
        const h = (d.sales / max) * (H - 8);
        return (
          <rect
            key={d.period}
            x={i * (barW + gap)}
            y={H - h}
            width={barW}
            height={h}
            rx="2"
            className="fill-caramel-dark"
          >
            <title>{`${labelOf(d)}: ${formatMoney(d.sales)}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}
