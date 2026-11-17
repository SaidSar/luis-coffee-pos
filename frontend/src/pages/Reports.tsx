import { useState } from 'react';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { formatYmd, formatMonth } from '../lib/mazatlanDates';
import { usePeriod } from '../hooks/usePeriod';
import { describeApiError } from '../lib/apiError';
import {
  useReportSummary, useReportSales, useReportProducts, useReportPaymentMethods, useReportEmployees, useExportExcel,
} from '../hooks/useReports';
import type { GroupBy, SalesPeriod, ProductReportRow, PaymentMethodReportRow, EmployeeReportRow } from '../types/reports';
import PeriodSelector from '../components/reports/PeriodSelector';
import KpiGrid from '../components/reports/KpiGrid';
import ReportBlock from '../components/reports/ReportBlock';
import DataTable from '../components/reports/DataTable';
import SalesChart from '../components/reports/SalesChart';
import { formatMoney, int, pct, PAYMENT_LABEL, ROLE_LABEL, focusRing, card } from '../components/reports/reportUi';

const GROUPS: { id: GroupBy; label: string; noun: string }[] = [
  { id: 'day',   label: 'Día',    noun: 'día' },
  { id: 'week',  label: 'Semana', noun: 'semana' },
  { id: 'month', label: 'Mes',    noun: 'mes' },
];

const periodLabel = (groupBy: GroupBy) => (p: SalesPeriod) =>
  groupBy === 'day' ? formatYmd(p.period)
    : groupBy === 'week' ? `Semana del ${formatYmd(p.period)}`
    : formatMonth(p.period);

const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((s, r) => s + f(r), 0);

export default function Reports() {
  const { preset, range, selectPreset, selectCustom } = usePeriod('thisMonth');
  const [groupBy, setGroupBy] = useState<GroupBy>('day');
  const [announcement, setAnnouncement] = useState('');

  const summary   = useReportSummary(range);
  const sales     = useReportSales(range, groupBy);
  const products  = useReportProducts(range);
  const payments  = useReportPaymentMethods(range);
  const employees = useReportEmployees(range);
  const exportXls = useExportExcel();

  const noSales = summary.data?.tickets === 0;
  const labelOf = periodLabel(groupBy);
  const groupNoun = GROUPS.find((g) => g.id === groupBy)!.noun;

  const handleExport = () => {
    setAnnouncement('');
    exportXls.mutate({ ...range, groupBy }, {
      onSuccess: (filename) => setAnnouncement(`Excel descargado: ${filename}`),
    });
  };

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>

      {/* Periodo + exportar */}
      <section aria-labelledby="report-period-title" className={`${card} flex flex-col gap-3`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="report-period-title" className="text-base font-bold text-espresso">Periodo</h2>
          <button
            type="button"
            onClick={handleExport}
            disabled={exportXls.isPending}
            className={`inline-flex items-center justify-center gap-2 min-h-11 px-5 rounded-xl text-sm font-semibold
              bg-caramel-dark hover:bg-espresso text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${focusRing}`}
          >
            {exportXls.isPending
              ? <Loader2 size={16} className="motion-safe:animate-spin" aria-hidden="true" />
              : <FileSpreadsheet size={16} aria-hidden="true" />}
            {exportXls.isPending ? 'Generando…' : 'Exportar Excel'}
          </button>
        </div>
        {exportXls.error && (
          <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">
            No se pudo generar el Excel. {describeApiError(exportXls.error, 'report').message}
          </p>
        )}
        <PeriodSelector
          key={`${range.from}_${range.to}`}
          value={range}
          preset={preset}
          onPreset={selectPreset}
          onCustom={selectCustom}
        />
      </section>

      {/* KPIs */}
      <ReportBlock
        title="Indicadores"
        titleId="report-kpis"
        isLoading={summary.isLoading}
        error={summary.error}
        isEmpty={false}
        onRetry={() => summary.refetch()}
      >
        {summary.data && (
          <>
            {noSales && <p className="text-sm text-espresso/70">Sin ventas en este periodo.</p>}
            <KpiGrid summary={summary.data} />
          </>
        )}
      </ReportBlock>

      {/* Ventas por periodo */}
      <ReportBlock
        title="Ventas por periodo"
        titleId="report-sales"
        isLoading={sales.isLoading}
        error={sales.error}
        isEmpty={noSales}
        onRetry={() => sales.refetch()}
        actions={
          <div role="group" aria-label="Agrupar ventas por" className="flex gap-1">
            {GROUPS.map((g) => (
              <button
                key={g.id}
                type="button"
                aria-pressed={groupBy === g.id}
                onClick={() => setGroupBy(g.id)}
                className={`min-h-11 min-w-11 px-3 rounded-xl text-sm font-medium transition-colors ${focusRing}
                  ${groupBy === g.id ? 'bg-espresso text-white' : 'bg-cream text-espresso hover:bg-caramel/20'}`}
              >
                {g.label}
              </button>
            ))}
          </div>
        }
      >
        {sales.data && (
          <>
            <SalesChart data={sales.data} periodName={groupNoun} labelOf={labelOf} />
            <DataTable<SalesPeriod>
              caption={`Ventas por ${groupNoun}`}
              rows={sales.data}
              rowKey={(r) => r.period}
              columns={[
                { header: 'Periodo', cell: labelOf, rowHeader: true },
                { header: 'Tickets', cell: (r) => int.format(r.tickets), align: 'right' },
                { header: 'Ventas',  cell: (r) => formatMoney(r.sales), align: 'right' },
                { header: 'Costo',   cell: (r) => formatMoney(r.cost), align: 'right' },
                { header: 'Margen',  cell: (r) => formatMoney(r.grossMargin), align: 'right' },
              ]}
              footer={[
                'Total',
                int.format(sum(sales.data, (r) => r.tickets)),
                formatMoney(sum(sales.data, (r) => r.sales)),
                formatMoney(sum(sales.data, (r) => r.cost)),
                formatMoney(sum(sales.data, (r) => r.grossMargin)),
              ]}
            />
          </>
        )}
      </ReportBlock>

      <div className="grid gap-4 xl:grid-cols-2 min-w-0">
        {/* Por método de pago */}
        <ReportBlock
          title="Por método de pago"
          titleId="report-payments"
          isLoading={payments.isLoading}
          error={payments.error}
          isEmpty={!payments.data?.length}
          onRetry={() => payments.refetch()}
        >
          {payments.data && (
            <DataTable<PaymentMethodReportRow>
              caption="Ventas por método de pago"
              rows={payments.data}
              rowKey={(r) => r.method}
              columns={[
                { header: 'Método',  cell: (r) => PAYMENT_LABEL[r.method], rowHeader: true },
                { header: 'Tickets', cell: (r) => int.format(r.tickets), align: 'right' },
                { header: 'Ventas',  cell: (r) => formatMoney(r.sales), align: 'right' },
              ]}
              footer={['Total', int.format(sum(payments.data, (r) => r.tickets)), formatMoney(sum(payments.data, (r) => r.sales))]}
            />
          )}
        </ReportBlock>

        {/* Por empleado */}
        <ReportBlock
          title="Por empleado"
          titleId="report-employees"
          isLoading={employees.isLoading}
          error={employees.error}
          isEmpty={!employees.data?.length}
          onRetry={() => employees.refetch()}
        >
          {employees.data && (
            <DataTable<EmployeeReportRow>
              caption="Ventas por empleado que tomó la orden"
              rows={employees.data}
              rowKey={(r) => r.userId}
              columns={[
                { header: 'Empleado',        cell: (r) => r.employee, rowHeader: true },
                { header: 'Rol',             cell: (r) => ROLE_LABEL[r.role] ?? r.role },
                { header: 'Tickets',         cell: (r) => int.format(r.tickets), align: 'right' },
                { header: 'Ventas',          cell: (r) => formatMoney(r.sales), align: 'right' },
                { header: 'Ticket promedio', cell: (r) => formatMoney(r.averageTicket), align: 'right' },
              ]}
              footer={['Total', '', int.format(sum(employees.data, (r) => r.tickets)), formatMoney(sum(employees.data, (r) => r.sales)), '']}
            />
          )}
        </ReportBlock>
      </div>

      {/* Por producto */}
      <ReportBlock
        title="Por producto"
        titleId="report-products"
        isLoading={products.isLoading}
        error={products.error}
        isEmpty={!products.data?.length}
        onRetry={() => products.refetch()}
      >
        {products.data && (
          <DataTable<ProductReportRow>
            caption="Ventas por producto"
            rows={products.data}
            rowKey={(r) => r.productId}
            columns={[
              { header: 'Producto',  cell: (r) => r.product, rowHeader: true },
              { header: 'Categoría', cell: (r) => r.category },
              { header: 'Cantidad',  cell: (r) => int.format(r.quantity), align: 'right' },
              { header: 'Ventas',    cell: (r) => formatMoney(r.sales), align: 'right' },
              { header: 'Costo',     cell: (r) => formatMoney(r.cost), align: 'right' },
              { header: 'Margen',    cell: (r) => formatMoney(r.grossMargin), align: 'right' },
              { header: 'Margen %',  cell: (r) => pct.format(r.grossMarginPct), align: 'right' },
            ]}
            footer={[
              'Total', '',
              int.format(sum(products.data, (r) => r.quantity)),
              formatMoney(sum(products.data, (r) => r.sales)),
              formatMoney(sum(products.data, (r) => r.cost)),
              formatMoney(sum(products.data, (r) => r.grossMargin)),
              '',
            ]}
          />
        )}
      </ReportBlock>
    </div>
  );
}
