import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Banknote, CreditCard, ArrowLeftRight, Loader2, CircleCheckBig, Plus, Minus, Trash2, Receipt } from 'lucide-react';
import { isAxiosError } from 'axios';
import { useDialog } from '../../hooks/useDialog';
import { useOrder, usePayOrder, usePaySplit } from '../../hooks/usePos';
import { describeApiError } from '../../lib/apiError';
import type { Order, PaidOrder, PaymentMethod, OrderSplit } from '../../types/pos';
import {
  btnPrimary, btnSecondary, inputBase, focusRing, paymentMethodLabel, MONEY_RE, toCents, centsToMXN,
} from './posUi';

interface Props {
  order:   Order;
  onClose: (paid: boolean) => void; // paid=true si la orden quedó saldada
}

const METHODS: { value: PaymentMethod; icon: typeof Banknote }[] = [
  { value: 'CASH',     icon: Banknote },
  { value: 'CARD',     icon: CreditCard },
  { value: 'TRANSFER', icon: ArrowLeftRight },
];
const MAX_LINES = 5;

type Mode = 'all' | 'split';
type Step = 'select' | 'pay' | 'done';
interface Line { key: number; method: PaymentMethod; amount: string; received: string }

const fmt = (cents: number) => (cents / 100).toFixed(2);
const validMoney = (v: string) => MONEY_RE.test(v.trim()) && toCents(v.trim()) > 0;
const methodsOf = (s: OrderSplit) => [...new Set(s.payments.map((p) => paymentMethodLabel[p.method]))].join(' + ');

// Error del cobro con mensaje por status (los 409 de unidades ya cobradas nombran los productos)
const describePayError = (err: unknown) => {
  if (isAxiosError(err) && err.response?.status === 409) {
    const d = (err.response.data as { details?: { products?: unknown; remaining?: unknown } })?.details;
    const products = Array.isArray(d?.products) ? d.products.filter((p): p is string => typeof p === 'string') : [];
    if (d?.remaining) return { message: 'Algunas unidades ya se cobraron en otra cuenta. Se actualizó la lista:', products };
  }
  if (isAxiosError(err) && err.response?.status === 400) {
    return { message: 'Los montos no cuadran con la cuenta o el efectivo recibido no alcanza. Revisa las líneas de pago.', products: [] };
  }
  const info = describeApiError(err, 'payment');
  return { message: info.message, products: info.products };
};

export default function PaymentModal({ order: initial, onClose }: Props) {
  const live  = useOrder(initial.id);
  const order = live.data ?? initial;
  const isDelivery = order.type === 'DELIVERY';

  const payAll   = usePayOrder();
  const paySplit = usePaySplit();
  const pending  = payAll.isPending || paySplit.isPending;
  const error    = payAll.error ?? paySplit.error;
  const submitting = useRef(false); // contra doble clic (isPending cambia hasta el siguiente render)

  const [mode, setMode] = useState<Mode>('all');
  const [step, setStep] = useState<Step>('pay');
  const [selection, setSelection] = useState<Record<string, number>>({});
  // Inicio: "Cobrar todo" con una línea en efectivo por el saldo
  const [lines, setLines] = useState<Line[]>(() => [{ key: 1, method: 'CASH', amount: fmt(toCents(initial.balance)), received: '' }]);
  const [last, setLast] = useState<PaidOrder | null>(null);
  const nextKey = useRef(1);
  // Foco tras agregar o quitar una línea (en un efecto: corre aunque la pestaña esté en segundo plano)
  const focusAfterLines = useRef<string | null>(null);
  useEffect(() => {
    if (!focusAfterLines.current) return;
    document.getElementById(focusAfterLines.current)?.focus();
    focusAfterLines.current = null;
  }, [lines]);

  const close = () => { if (!pending) onClose(order.paid); };
  const dialogRef = useDialog<HTMLDivElement>(close);

  const pendingItems = order.items.filter((i) => i.remaining > 0);
  const selectedCents = useMemo(
    () => pendingItems.reduce((a, i) => a + toCents(i.unitPrice) * (selection[i.id] ?? 0), 0),
    [pendingItems, selection],
  );
  const accountCents = mode === 'all' ? toCents(order.balance) : selectedCents;

  // Al cambiar de paso, el foco va al encabezado del paso (el contenido anterior desaparece)
  useEffect(() => {
    const id = step === 'select' ? 'split-select-title' : step === 'pay' ? 'pay-lines-title' : 'pay-done-title';
    document.getElementById(id)?.focus();
  }, [step, mode]);

  const startLines = (cents: number) => {
    nextKey.current += 1;
    setLines([{ key: nextKey.current, method: 'CASH', amount: fmt(cents), received: '' }]);
  };

  const resetErrors = () => { payAll.reset(); paySplit.reset(); };

  const chooseMode = (m: Mode) => {
    if (pending) return;
    resetErrors();
    setMode(m);
    if (m === 'all') { setStep('pay'); startLines(toCents(order.balance)); }
    else { setStep('select'); setSelection({}); }
  };

  // ── Líneas de pago ──
  const lineCents = (l: Line) => (validMoney(l.amount) ? toCents(l.amount) : 0);
  const sumCents  = lines.reduce((a, l) => a + lineCents(l), 0);
  const diff      = accountCents - sumCents; // > 0 faltan, < 0 excede
  const lineError = (l: Line): string | null => {
    if (!validMoney(l.amount)) return 'Monto inválido: número mayor a 0 con hasta 2 decimales.';
    if (l.method === 'CASH') {
      if (!l.received.trim()) return 'Indica el monto recibido.';
      if (!MONEY_RE.test(l.received.trim())) return 'Monto recibido inválido.';
      if (toCents(l.received) < lineCents(l)) return `Faltan ${centsToMXN(lineCents(l) - toCents(l.received))} en efectivo.`;
    }
    return null;
  };
  const canPay = accountCents > 0 && diff === 0 && lines.every((l) => !lineError(l)) && !pending;

  const updateLine = (key: number, patch: Partial<Line>) => {
    resetErrors();
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };
  const addLine = () => {
    if (lines.length >= MAX_LINES) return;
    const used = new Set(lines.map((l) => l.method));
    const method = (['CARD', 'TRANSFER', 'CASH'] as PaymentMethod[]).find((m) => !used.has(m)) ?? 'CARD';
    nextKey.current += 1;
    const key = nextKey.current;
    focusAfterLines.current = `pay-amount-${key}`;
    setLines((ls) => [...ls, { key, method, amount: fmt(Math.max(diff, 0)), received: '' }]);
  };
  const removeLine = (key: number) => {
    focusAfterLines.current = 'pay-add-line';
    setLines((ls) => ls.filter((l) => l.key !== key));
  };

  // ── Selección (dividir cuenta) ──
  const setQty = (id: string, q: number, max: number) => {
    resetErrors();
    setSelection((s) => ({ ...s, [id]: Math.max(0, Math.min(max, q)) }));
  };
  const selectAll = () => setSelection(Object.fromEntries(pendingItems.map((i) => [i.id, i.remaining])));
  const goPay = () => { if (selectedCents > 0) { startLines(selectedCents); setStep('pay'); } };

  // ── Enviar ──
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canPay || submitting.current) return;
    submitting.current = true;
    const payments = lines.map((l) => ({
      method: l.method,
      amount: fmt(lineCents(l)),
      ...(l.method === 'CASH' ? { amountReceived: fmt(toCents(l.received)) } : {}),
    }));
    const onSuccess = (r: PaidOrder) => { setLast(r); setStep('done'); };
    const onError = () => { live.refetch(); };
    const onSettled = () => { submitting.current = false; };
    if (mode === 'all') {
      payAll.mutate({ orderId: order.id, input: { payments } }, { onSuccess, onError, onSettled });
    } else {
      const items = Object.entries(selection).filter(([, q]) => q > 0).map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
      paySplit.mutate({ orderId: order.id, input: { items, payments } }, { onSuccess, onError, onSettled });
    }
  };

  const nextAccount = () => {
    resetErrors();
    setSelection({});
    if (mode === 'split') setStep('select');
    else { setStep('pay'); startLines(toCents(order.balance)); }
  };

  const lastSplit = last?.splits.find((s) => s.id === last.lastSplitId) ?? null;
  const lastChange = lastSplit?.payments.reduce((a, p) => a + (p.changeGiven ? toCents(p.changeGiven) : 0), 0) ?? 0;
  const err = error ? describePayError(error) : null;

  // ── Render ──
  return (
    <div className="fixed inset-0 bg-espresso/50 z-50 flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-title"
        tabIndex={-1}
        className="bg-white rounded-2xl w-full max-w-lg max-h-[90dvh] flex flex-col focus:outline-none"
      >
        {/* Encabezado fijo */}
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-b border-caramel/10 shrink-0">
          <h2 id="payment-title" className="font-bold text-espresso text-lg">Cobrar ticket #{order.ticketNumber}</h2>
          <button type="button" onClick={close} disabled={pending} aria-label="Cerrar"
            className={`min-h-11 min-w-11 flex items-center justify-center rounded-xl text-espresso/70 hover:text-espresso ${focusRing}`}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {/* Cuerpo desplazable */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-2 text-sm text-espresso">
            <div className="rounded-xl bg-cream px-3 py-2"><dt className="text-xs">Total de la orden</dt><dd className="font-bold tabular-nums">{centsToMXN(toCents(order.total))}</dd></div>
            <div className="rounded-xl bg-cream px-3 py-2"><dt className="text-xs">Pendiente por cobrar</dt><dd className="font-bold tabular-nums">{centsToMXN(toCents(order.balance))}</dd></div>
          </dl>

          {order.splits.length > 0 && (
            <section aria-labelledby="paid-splits-title">
              <h3 id="paid-splits-title" className="text-xs font-semibold text-espresso/70 uppercase tracking-wide mb-1">Cuentas cobradas</h3>
              <ul className="text-sm text-espresso divide-y divide-espresso/10">
                {order.splits.map((s) => (
                  <li key={s.id} className="py-1.5 flex items-center gap-2">
                    <CircleCheckBig size={14} className="text-green-800 shrink-0" aria-hidden="true" />
                    <span>Cuenta {s.number}{s.label ? ` (${s.label})` : ''} · {centsToMXN(toCents(s.amount))} · {methodsOf(s)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Modo: radio en grupo (DELIVERY solo "Cobrar todo") */}
          {step !== 'done' && !isDelivery && (
            <fieldset>
              <legend className="text-sm font-medium text-espresso mb-2">Forma de cobro</legend>
              <div className="grid grid-cols-2 gap-2">
                {([['all', 'Cobrar todo'], ['split', 'Dividir cuenta']] as [Mode, string][]).map(([m, label]) => (
                  <label key={m} className="min-h-11 flex items-center justify-center rounded-xl border border-espresso/50 px-2 text-sm font-medium text-espresso cursor-pointer
                    has-checked:bg-espresso has-checked:text-white has-checked:border-espresso
                    has-focus-visible:ring-2 has-focus-visible:ring-caramel-dark has-focus-visible:ring-offset-2">
                    <input type="radio" name="pay-mode" value={m} checked={mode === m} onChange={() => chooseMode(m)} disabled={pending} className="sr-only" />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {/* Paso 1 (dividir): elegir unidades */}
          {step === 'select' && (
            <section aria-labelledby="split-select-title" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="split-select-title" tabIndex={-1} className="text-base font-bold text-espresso focus:outline-none">
                  Cuenta {order.splits.length + 1}: elige lo que paga
                </h3>
                <button type="button" onClick={selectAll} className={btnSecondary}>Seleccionar todo lo restante</button>
              </div>
              <ul className="flex flex-col divide-y divide-espresso/10">
                {pendingItems.map((i) => {
                  const q = selection[i.id] ?? 0;
                  return (
                    <li key={i.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm text-espresso">
                        <span className="font-medium">{i.product.name}</span>
                        <span className="block text-xs text-espresso/70">{centsToMXN(toCents(i.unitPrice))} c/u · quedan {i.remaining}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <button type="button" onClick={() => setQty(i.id, q - 1, i.remaining)} disabled={q === 0}
                          aria-label={`Quitar uno de ${i.product.name}`}
                          className={`min-h-11 min-w-11 rounded-xl border border-espresso/50 text-espresso flex items-center justify-center hover:bg-cream disabled:opacity-40 ${focusRing}`}>
                          <Minus size={16} aria-hidden="true" />
                        </button>
                        <span className="min-w-14 text-center text-sm font-semibold text-espresso tabular-nums" aria-hidden="true">{q} de {i.remaining}</span>
                        <span className="sr-only">{i.product.name}: {q} de {i.remaining}</span>
                        <button type="button" onClick={() => setQty(i.id, q + 1, i.remaining)} disabled={q >= i.remaining}
                          aria-label={`Agregar uno de ${i.product.name}, ${q} de ${i.remaining}`}
                          className={`min-h-11 min-w-11 rounded-xl border border-espresso/50 text-espresso flex items-center justify-center hover:bg-cream disabled:opacity-40 ${focusRing}`}>
                          <Plus size={16} aria-hidden="true" />
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p aria-live="polite" className="text-sm text-espresso">
                Subtotal de la cuenta: <strong className="tabular-nums">{centsToMXN(selectedCents)}</strong>
              </p>
            </section>
          )}

          {/* Paso 2: líneas de pago */}
          {step === 'pay' && (
            <form id="pay-form" onSubmit={submit} noValidate className="flex flex-col gap-3">
              <h3 id="pay-lines-title" tabIndex={-1} className="text-base font-bold text-espresso focus:outline-none">
                {mode === 'all' ? 'Cobrar todo lo pendiente' : `Cobrar cuenta ${order.splits.length + 1}`}: {centsToMXN(accountCents)}
              </h3>
              <ol className="flex flex-col gap-3">
                {lines.map((l, idx) => {
                  const le = lineError(l);
                  const change = l.method === 'CASH' && MONEY_RE.test(l.received.trim()) ? toCents(l.received) - lineCents(l) : null;
                  const n = idx + 1;
                  return (
                    <li key={l.key} className="rounded-xl border border-espresso/20 p-3 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-espresso">Pago {n}</span>
                        {lines.length > 1 && (
                          <button type="button" onClick={() => removeLine(l.key)} aria-label={`Quitar pago ${n}`}
                            className={`min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl text-red-700 hover:bg-red-50 ${focusRing}`}>
                            <Trash2 size={16} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                      <fieldset>
                        <legend className="sr-only">Método del pago {n}</legend>
                        <div className="grid grid-cols-3 gap-2">
                          {METHODS.map(({ value, icon: Icon }) => (
                            <label key={value} className="min-h-11 flex flex-col items-center justify-center gap-0.5 rounded-xl border border-espresso/50 px-1 py-1.5 text-xs text-espresso cursor-pointer
                              has-checked:bg-caramel-dark has-checked:text-white has-checked:border-caramel-dark
                              has-focus-visible:ring-2 has-focus-visible:ring-caramel-dark has-focus-visible:ring-offset-2">
                              <input type="radio" name={`pay-method-${l.key}`} value={value} checked={l.method === value}
                                onChange={() => updateLine(l.key, { method: value })} className="sr-only" />
                              <Icon size={16} aria-hidden="true" />
                              {paymentMethodLabel[value]}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      <div className={`grid gap-2 ${l.method === 'CASH' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        <div>
                          <label htmlFor={`pay-amount-${l.key}`} className="block text-xs font-medium text-espresso mb-1">Monto del pago {n}</label>
                          <input id={`pay-amount-${l.key}`} inputMode="decimal" autoComplete="off" value={l.amount}
                            onChange={(e) => updateLine(l.key, { amount: e.target.value })}
                            aria-invalid={!validMoney(l.amount)} aria-describedby={le ? `pay-line-err-${l.key}` : undefined} className={inputBase} />
                        </div>
                        {l.method === 'CASH' && (
                          <div>
                            <label htmlFor={`pay-received-${l.key}`} className="block text-xs font-medium text-espresso mb-1">Monto recibido</label>
                            <input id={`pay-received-${l.key}`} inputMode="decimal" autoComplete="off" value={l.received} placeholder={l.amount}
                              onChange={(e) => updateLine(l.key, { received: e.target.value })}
                              aria-invalid={!!l.received && !!le} aria-describedby={`pay-change-${l.key}${le ? ` pay-line-err-${l.key}` : ''}`} className={inputBase} />
                          </div>
                        )}
                      </div>
                      {l.method === 'CASH' && (
                        <p id={`pay-change-${l.key}`} className="text-sm text-espresso">
                          Cambio: <strong className="tabular-nums">{change !== null && change >= 0 ? centsToMXN(change) : '—'}</strong>
                        </p>
                      )}
                      {le && (l.received || l.method !== 'CASH' || !validMoney(l.amount)) && (
                        <p id={`pay-line-err-${l.key}`} className="text-sm text-red-700">{le}</p>
                      )}
                    </li>
                  );
                })}
              </ol>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button id="pay-add-line" type="button" onClick={addLine} disabled={lines.length >= MAX_LINES || pending} className={btnSecondary}>
                  <Plus size={16} aria-hidden="true" /> Agregar otro método
                </button>
                <p aria-live="polite" className={`text-sm font-semibold ${diff === 0 ? 'text-green-800' : 'text-red-700'}`}>
                  {diff > 0 ? `Faltan ${centsToMXN(diff)}` : diff < 0 ? `Excede ${centsToMXN(-diff)}` : 'Montos completos'}
                </p>
              </div>
            </form>
          )}

          {/* Paso 3: resumen de la cuenta cobrada */}
          {step === 'done' && last && (
            <section aria-labelledby="pay-done-title" className="flex flex-col gap-3">
              <h3 id="pay-done-title" tabIndex={-1} className="flex items-center gap-2 text-base font-bold text-green-800 focus:outline-none">
                <CircleCheckBig size={20} aria-hidden="true" />
                {last.paid ? 'Orden saldada' : `Cuenta ${lastSplit?.number ?? ''} cobrada`}
              </h3>
              <p role="status" className="sr-only">
                {last.paid ? 'Orden saldada.' : `Cuenta cobrada. Pendiente ${centsToMXN(toCents(last.balance))}.`}
                {lastChange > 0 ? ` Cambio a entregar ${centsToMXN(lastChange)}.` : ''}
              </p>
              {lastSplit && (
                <dl className="text-sm text-espresso space-y-1">
                  <div className="flex justify-between"><dt>Monto de la cuenta</dt><dd className="font-semibold tabular-nums">{centsToMXN(toCents(lastSplit.amount))}</dd></div>
                  {lastSplit.payments.map((p) => (
                    <div key={p.id} className="flex justify-between">
                      <dt>{paymentMethodLabel[p.method]}{p.amountReceived ? ` (recibido ${centsToMXN(toCents(p.amountReceived))})` : ''}</dt>
                      <dd className="tabular-nums">{centsToMXN(toCents(p.amount))}</dd>
                    </div>
                  ))}
                  <div className="flex justify-between text-base font-bold"><dt>Cambio a entregar</dt><dd className="tabular-nums">{centsToMXN(lastChange)}</dd></div>
                </dl>
              )}
              {last.paid
                ? <p className="text-sm text-espresso">Total cobrado {centsToMXN(toCents(last.paidAmount))} en {last.splits.length} {last.splits.length === 1 ? 'cuenta' : 'cuentas'}.{last.table ? ' La mesa quedó libre.' : ''}</p>
                : <p className="text-sm text-espresso">Pendiente por cobrar: <strong>{centsToMXN(toCents(last.balance))}</strong></p>}
            </section>
          )}

          {err && (
            <div role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">
              <p>{err.message}</p>
              {err.products.length > 0 && <ul className="list-disc pl-5 mt-1">{err.products.map((n) => <li key={n}>{n}</li>)}</ul>}
            </div>
          )}
        </div>

        {/* Pie fijo con las acciones del paso */}
        <div className="flex flex-col-reverse sm:flex-row gap-2 px-5 py-3 border-t border-caramel/10 shrink-0">
          {step === 'select' && (
            <>
              <button type="button" onClick={close} className={`${btnSecondary} flex-1`}>Cerrar</button>
              <button type="button" onClick={goPay} disabled={selectedCents === 0} className={`${btnPrimary} flex-1`}>
                <Receipt size={16} aria-hidden="true" /> Cobrar esta cuenta · {centsToMXN(selectedCents)}
              </button>
            </>
          )}
          {step === 'pay' && (
            <>
              <button type="button" disabled={pending} className={`${btnSecondary} flex-1`}
                onClick={() => { resetErrors(); if (mode === 'split') setStep('select'); else close(); }}>
                {mode === 'split' ? 'Volver a elegir' : 'Cerrar'}
              </button>
              <button type="submit" form="pay-form" disabled={!canPay} className={`${btnPrimary} flex-1`}>
                {pending && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                {pending ? 'Cobrando...' : `Cobrar ${centsToMXN(accountCents)}`}
              </button>
            </>
          )}
          {step === 'done' && (
            last?.paid
              ? <button type="button" onClick={() => onClose(true)} className={`${btnPrimary} flex-1`}>Cerrar</button>
              : (
                <>
                  <button type="button" onClick={close} className={`${btnSecondary} flex-1`}>Cerrar</button>
                  <button type="button" onClick={nextAccount} className={`${btnPrimary} flex-1`}>Cobrar otra cuenta</button>
                </>
              )
          )}
        </div>
      </div>
    </div>
  );
}
