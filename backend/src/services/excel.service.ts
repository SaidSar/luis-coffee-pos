import ExcelJS from 'exceljs';
import type {
  Summary, SalesPeriod, ProductRow, CategoryRow, PaymentMethodRow, EmployeeRow, ExpenseRow, InventoryRow, GroupBy,
  DeliveryRow, CashShiftRow,
} from './reports.service';

// ── Seguridad: inyección de fórmulas ─────────────────────────
// Un texto de usuario que empiece con = + - @ (o tab / retorno) podría interpretarse como fórmula
// al abrir o reexportar el archivo. Se neutraliza anteponiendo una comilla simple.
const FORMULA_TRIGGERS = /^[=+\-@\t\r]/;
export const neutralizeFormula = (value: string): string =>
  FORMULA_TRIGGERS.test(value) ? `'${value}` : value;

export interface ReportData {
  summary:   Summary;
  groupBy:   GroupBy;
  sales:     SalesPeriod[];
  products:  ProductRow[];
  categories: CategoryRow[];
  payments:  PaymentMethodRow[];
  employees: EmployeeRow[];
  expenses:  ExpenseRow[];
  deliveries: DeliveryRow[];
  cashShifts: CashShiftRow[];
  inventory: InventoryRow[];
}

const DELIVERY_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendiente', IN_TRANSIT: 'En camino', DELIVERED: 'Entregada', CANCELLED: 'Cancelada',
};

const RECONCILIATION_NOTE =
  'Ventas = Ventas de productos + Cargos por envío. La hoja Productos suma solo productos: ' +
  'su total más los Cargos por envío es igual a Ventas.';

const MONEY  = '"$"#,##0.00';
const DATE   = 'dd/mm/yyyy';
const PCT    = '0.0%';
const INT    = '#,##0';
const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C1810' } };

const METHOD_LABEL: Record<PaymentMethodRow['method'], string> = { CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia' };
const ROLE_LABEL: Record<string, string> = { ADMIN: 'Administrador', CASHIER: 'Cajero', WAITER: 'Mesero', DELIVERY: 'Repartidor' };
const GROUP_LABEL: Record<GroupBy, string> = { day: 'Día', week: 'Semana (ISO, inicia lunes)', month: 'Mes' };

// Fecha local YYYY-MM-DD → Date a medianoche UTC (Excel la muestra como ese mismo día)
const toExcelDate = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

interface Column {
  header: string;
  key:    string;
  width:  number;
  numFmt?: string;
  total?:  boolean; // suma en la fila de totales
}

// Crea una hoja tabular con el formato común: encabezado, panes congelados, autofiltro,
// anchos, impresión horizontal ajustada a 1 página de ancho y fila de totales con SUM.
const addTableSheet = (
  wb: ExcelJS.Workbook,
  name: string,
  columns: Column[],
  rows: Record<string, string | number | Date | boolean>[],
  totalLabel = 'Total',
) => {
  const ws = wb.addWorksheet(name, {
    views:     [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width }));

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = HEADER_FILL;
  header.alignment = { vertical: 'middle' };
  header.height = 20;

  for (const r of rows) ws.addRow(r);
  const lastData = rows.length + 1;

  columns.forEach((c, idx) => {
    if (c.numFmt) ws.getColumn(idx + 1).numFmt = c.numFmt;
  });

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(lastData, 1), column: columns.length } };

  if (columns.some((c) => c.total)) {
    const totalRow = ws.addRow({});
    totalRow.getCell(1).value = totalLabel;
    columns.forEach((c, idx) => {
      if (!c.total) return;
      const col = ws.getColumn(idx + 1).letter;
      const sum = rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
      const result = Math.round(sum * 100) / 100;
      // Sin filas de datos no hay rango válido para SUM: se escribe 0
      totalRow.getCell(idx + 1).value = rows.length
        ? { formula: `SUM(${col}2:${col}${lastData})`, result }
        : 0;
      if (c.numFmt) totalRow.getCell(idx + 1).numFmt = c.numFmt;
    });
    totalRow.font = { bold: true };
    totalRow.border = { top: { style: 'thin' } };
  }
  return ws;
};

export const buildReportWorkbook = (d: ReportData): ExcelJS.Workbook => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Luis Coffee Break POS';
  wb.created = new Date();
  const s = d.summary;

  // ── Resumen (concepto / valor) ──
  const ws = wb.addWorksheet('Resumen', {
    views:     [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  ws.columns = [{ header: 'Concepto', key: 'k', width: 28 }, { header: 'Valor', key: 'v', width: 20 }];
  const h = ws.getRow(1);
  h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  h.fill = HEADER_FILL;
  const summaryRows: [string, string | number | Date, string?][] = [
    ['Desde', toExcelDate(s.from), DATE],
    ['Hasta', toExcelDate(s.to), DATE],
    ['Ventas', s.sales, MONEY],
    ['Ventas de productos', s.productSales, MONEY],
    ['Cargos por envío', s.deliveryFees, MONEY],
    ['Tickets', s.tickets, INT],
    ['Ticket promedio', s.averageTicket, MONEY],
    ['Costo de ventas', s.cost, MONEY],
    ['Margen bruto', s.grossMargin, MONEY],
    ['Margen bruto %', s.grossMarginPct, PCT],
    ['Gastos', s.expenses, MONEY],
    ['Utilidad', s.profit, MONEY],
    ['Productos vendidos', s.itemsSold, INT],
    ['Órdenes canceladas', s.cancelledOrders, INT],
    ['Entregas realizadas', s.deliveriesDelivered, INT],
    ['Entregas canceladas', s.deliveriesCancelled, INT],
  ];
  for (const [k, v, fmt] of summaryRows) {
    const row = ws.addRow({ k, v });
    if (fmt) row.getCell(2).numFmt = fmt;
    if (k === 'Ventas') row.getCell(1).note = RECONCILIATION_NOTE;
  }
  // Nota visible (además del comentario de celda) con la conciliación
  ws.addRow({});
  ws.addRow({ k: `Nota: ${RECONCILIATION_NOTE}` }).getCell(1).font = { italic: true };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: summaryRows.length + 1, column: 2 } };

  // ── Ventas por periodo ──
  addTableSheet(wb, 'Ventas', [
    { header: `Periodo (${GROUP_LABEL[d.groupBy]})`, key: 'period', width: 26, numFmt: DATE },
    { header: 'Etiqueta',  key: 'label',   width: 14 },
    { header: 'Tickets',   key: 'tickets', width: 10, numFmt: INT,   total: true },
    { header: 'Ventas',    key: 'sales',   width: 16, numFmt: MONEY, total: true },
    { header: 'Costo',     key: 'cost',    width: 16, numFmt: MONEY, total: true },
    { header: 'Margen',    key: 'gm',      width: 16, numFmt: MONEY, total: true },
  ], d.sales.map((x) => ({ period: toExcelDate(x.period), label: x.label, tickets: x.tickets, sales: x.sales, cost: x.cost, gm: x.grossMargin })));

  // ── Productos ──
  const wsProducts = addTableSheet(wb, 'Productos', [
    { header: 'Producto',  key: 'product',  width: 34 },
    { header: 'Categoría', key: 'category', width: 22 },
    { header: 'Cantidad',  key: 'quantity', width: 11, numFmt: INT,   total: true },
    { header: 'Ventas',    key: 'sales',    width: 16, numFmt: MONEY, total: true },
    { header: 'Costo',     key: 'cost',     width: 16, numFmt: MONEY, total: true },
    { header: 'Margen',    key: 'gm',       width: 16, numFmt: MONEY, total: true },
    { header: 'Margen %',  key: 'gmPct',    width: 11, numFmt: PCT },
  ], d.products.map((x) => ({
    product: neutralizeFormula(x.product), category: neutralizeFormula(x.category),
    quantity: x.quantity, sales: x.sales, cost: x.cost, gm: x.grossMargin, gmPct: x.grossMarginPct,
  })));
  // Conciliación con Resumen: total de productos + cargos por envío = Ventas
  wsProducts.getRow(wsProducts.rowCount).getCell(4).note = RECONCILIATION_NOTE;
  wsProducts.addRow({});
  const recon = wsProducts.addRow({ product: 'Cargos por envío', sales: s.deliveryFees });
  recon.getCell(4).numFmt = MONEY;
  const salesRow = wsProducts.addRow({ product: 'Ventas (productos + envíos)', sales: s.sales });
  salesRow.getCell(4).numFmt = MONEY;
  salesRow.font = { bold: true };

  // ── Categorías ──
  addTableSheet(wb, 'Categorías', [
    { header: 'Categoría', key: 'category', width: 26 },
    { header: 'Cantidad',  key: 'quantity', width: 11, numFmt: INT,   total: true },
    { header: 'Ventas',    key: 'sales',    width: 16, numFmt: MONEY, total: true },
    { header: 'Costo',     key: 'cost',     width: 16, numFmt: MONEY, total: true },
    { header: 'Margen',    key: 'gm',       width: 16, numFmt: MONEY, total: true },
  ], d.categories.map((x) => ({ category: neutralizeFormula(x.category), quantity: x.quantity, sales: x.sales, cost: x.cost, gm: x.grossMargin })));

  // ── Métodos de pago ──
  addTableSheet(wb, 'Métodos de pago', [
    { header: 'Método',  key: 'method',  width: 18 },
    { header: 'Tickets', key: 'tickets', width: 10, numFmt: INT,   total: true },
    { header: 'Ventas',  key: 'sales',   width: 16, numFmt: MONEY, total: true },
  ], d.payments.map((x) => ({ method: METHOD_LABEL[x.method], tickets: x.tickets, sales: x.sales })));

  // ── Empleados ──
  addTableSheet(wb, 'Empleados', [
    { header: 'Empleado',        key: 'employee', width: 28 },
    { header: 'Rol',             key: 'role',     width: 16 },
    { header: 'Tickets',         key: 'tickets',  width: 10, numFmt: INT,   total: true },
    { header: 'Ventas',          key: 'sales',    width: 16, numFmt: MONEY, total: true },
    { header: 'Ticket promedio', key: 'avg',      width: 16, numFmt: MONEY },
  ], d.employees.map((x) => ({
    employee: neutralizeFormula(x.employee), role: ROLE_LABEL[x.role] ?? x.role,
    tickets: x.tickets, sales: x.sales, avg: x.averageTicket,
  })));

  // ── Gastos ──
  addTableSheet(wb, 'Gastos', [
    { header: 'Fecha',          key: 'date',        width: 12, numFmt: DATE },
    { header: 'Descripción',    key: 'description', width: 36 },
    { header: 'Categoría',      key: 'category',    width: 20 },
    { header: 'Registrado por', key: 'user',        width: 24 },
    { header: 'Monto',          key: 'amount',      width: 16, numFmt: MONEY, total: true },
  ], d.expenses.map((x) => ({
    date: toExcelDate(x.date), description: neutralizeFormula(x.description),
    category: neutralizeFormula(x.category), user: neutralizeFormula(x.user), amount: x.amount,
  })));

  // ── Entregas a domicilio ──
  addTableSheet(wb, 'Entregas', [
    { header: 'Fecha',               key: 'date',     width: 12, numFmt: DATE },
    { header: 'Ticket',              key: 'ticket',   width: 9,  numFmt: INT },
    { header: 'Cliente',             key: 'customer', width: 24 },
    { header: 'Teléfono',            key: 'phone',    width: 14 },
    { header: 'Dirección',           key: 'address',  width: 40 },
    { header: 'Repartidor',          key: 'driver',   width: 20 },
    { header: 'Cargo de envío',      key: 'fee',      width: 15, numFmt: MONEY, total: true },
    { header: 'Estado',              key: 'status',   width: 13 },
    { header: 'Minutos de entrega',  key: 'minutes',  width: 18, numFmt: INT },
  ], d.deliveries.map((x) => ({
    date: toExcelDate(x.date), ticket: x.ticketNumber,
    customer: neutralizeFormula(x.customer), phone: neutralizeFormula(x.phone),
    address: neutralizeFormula(x.address), driver: neutralizeFormula(x.driver),
    fee: x.fee, status: DELIVERY_STATUS_LABEL[x.status] ?? x.status, minutes: x.minutes ?? '—',
  })));

  // ── Cortes de caja (turnos cerrados en el periodo) ──
  addTableSheet(wb, 'Cortes de caja', [
    { header: 'Turno',      key: 'shift',    width: 30 },
    { header: 'Abre',       key: 'openedBy', width: 22 },
    { header: 'Cierra',     key: 'closedBy', width: 22 },
    { header: 'Fondo',      key: 'float',    width: 14, numFmt: MONEY, total: true },
    { header: 'Esperado',   key: 'expected', width: 14, numFmt: MONEY, total: true },
    { header: 'Contado',    key: 'counted',  width: 14, numFmt: MONEY, total: true },
    { header: 'Diferencia', key: 'diff',     width: 14, numFmt: MONEY, total: true },
    { header: 'Notas',      key: 'notes',    width: 40 },
  ], d.cashShifts.map((x) => ({
    shift: x.shift, openedBy: neutralizeFormula(x.openedBy), closedBy: neutralizeFormula(x.closedBy),
    float: x.openingFloat, expected: x.expectedCash, counted: x.countedCash, diff: x.difference,
    notes: neutralizeFormula(x.notes),
  })));

  // ── Inventario (estado actual) ──
  addTableSheet(wb, 'Inventario', [
    { header: 'Producto',          key: 'product',    width: 34 },
    { header: 'Categoría',         key: 'category',   width: 22 },
    { header: 'Precio',            key: 'price',      width: 14, numFmt: MONEY },
    { header: 'Costo',             key: 'cost',       width: 14, numFmt: MONEY },
    { header: 'Controla stock',    key: 'trackStock', width: 15 },
    { header: 'Stock',             key: 'stock',      width: 10, numFmt: INT },
    { header: 'Disponible',        key: 'available',  width: 12 },
    { header: 'Valor inventario',  key: 'value',      width: 17, numFmt: MONEY, total: true },
  ], d.inventory.map((x) => ({
    product: neutralizeFormula(x.product), category: neutralizeFormula(x.category),
    price: x.price, cost: x.cost, trackStock: x.trackStock ? 'Sí' : 'No',
    stock: x.trackStock ? x.stock : '—', available: x.isAvailable ? 'Sí' : 'No', value: x.stockValue,
  })));

  return wb;
};
