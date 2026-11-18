import { useRef, useState } from 'react';
import { X, Banknote, CreditCard, ArrowLeftRight, Loader2, CircleCheckBig } from 'lucide-react';
import { useDialog } from '../../hooks/useDialog';
import { usePayOrder } from '../../hooks/usePos';
import { describeApiError } from '../../lib/apiError';
import type { Order, PaymentMethod } from '../../types/pos';
import { formatMXN } from '../../types';
import {
  btnPrimary, btnSecondary, inputBase, focusRing, paymentMethodLabel, MONEY_RE, toCents, centsToMXN,
} from './posUi';

interface Props {
  order:   Order;
  onClose: (paid: boolean) => void; // paid=true si el cobro se completó
}

const METHODS: { value: PaymentMethod; icon: typeof Banknote }[] = [
  { value: 'CASH',     icon: Banknote },
  { value: 'CARD',     icon: CreditCard },
  { value: 'TRANSFER', icon: ArrowLeftRight },
];

export default function PaymentModal({ order, onClose }: Props) {
  const pay = usePayOrder();
  const [method,   setMethod]   = useState<PaymentMethod>('CASH');
  const [received, setReceived] = useState('');
  const [paid,     setPaid]     = useState<Order | null>(null);

  // Escape no cierra mientras se procesa el cobro (evita perder el resultado)
  const close = () => { if (!pay.isPending) onClose(!!paid); };
  const dialogRef = useDialog<HTMLDivElement>(close);

  const totalCents    = toCents(order.total);
  const receivedValid = MONEY_RE.test(received.trim());
  const receivedCents = receivedValid ? toCents(received.trim()) : 0;
  const changeCents   = receivedCents - totalCents;
  const canSubmit     = !pay.isPending && (method !== 'CASH' || (receivedValid && changeCents >= 0));

  const payingNow = useRef(false);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Bandera síncrona: un doble clic no debe mandar dos cobros (isPending cambia hasta el siguiente render)
    if (!canSubmit || paid || payingNow.current) return;
    payingNow.current = true;
    // CARD y TRANSFER cobran el total exacto que calculó el servidor
    const amountReceived = method === 'CASH' ? received.trim() : order.total;
    pay.mutate(
      { orderId: order.id, input: { method, amountReceived } },
      { onSuccess: (result) => setPaid(result), onSettled: () => { payingNow.current = false; } },
    );
  };

  const error = pay.error ? describeApiError(pay.error, 'payment') : null;

  return (
    <div className="fixed inset-0 bg-espresso/50 z-50 flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-title"
        tabIndex={-1}
        className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto focus:outline-none"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-caramel/10">
          <h2 id="payment-title" className="font-bold text-espresso text-lg">
            {paid ? 'Cobro realizado' : `Cobrar ticket #${order.ticketNumber}`}
          </h2>
          <button
            type="button"
            onClick={close}
            disabled={pay.isPending}
            aria-label="Cerrar"
            className={`min-h-11 min-w-11 flex items-center justify-center rounded-xl text-espresso/70 hover:text-espresso ${focusRing}`}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {paid ? (
          // ── Resumen tras el cobro ──
          <div className="p-6 flex flex-col gap-4">
            <p className="flex items-center gap-2 text-green-800 font-semibold" role="status">
              <CircleCheckBig size={20} aria-hidden="true" />
              Ticket #{paid.ticketNumber} pagado
            </p>
            <dl className="text-sm text-espresso space-y-1">
              <div className="flex justify-between"><dt>Método</dt><dd>{paid.payment ? paymentMethodLabel[paid.payment.method] : '—'}</dd></div>
              <div className="flex justify-between"><dt>Total</dt><dd className="font-semibold">{formatMXN(paid.total)}</dd></div>
              {paid.payment?.changeGiven && (
                <div className="flex justify-between text-base font-bold"><dt>Cambio</dt><dd>{formatMXN(paid.payment.changeGiven)}</dd></div>
              )}
            </dl>
            <button type="button" onClick={close} className={`${btnPrimary} w-full`} autoFocus>Cerrar</button>
          </div>
        ) : (
          // ── Formulario de cobro ──
          <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
            <p className="flex justify-between text-espresso">
              <span>Total a cobrar</span>
              <span className="text-xl font-bold">{formatMXN(order.total)}</span>
            </p>

            <fieldset>
              <legend className="text-sm font-medium text-espresso mb-2">Método de pago</legend>
              <div className="grid grid-cols-3 gap-2">
                {METHODS.map(({ value, icon: Icon }) => (
                  <label
                    key={value}
                    className="
                      min-h-11 flex flex-col items-center justify-center gap-1 rounded-xl border border-espresso/50
                      px-2 py-2 text-sm text-espresso cursor-pointer
                      has-checked:bg-caramel-dark has-checked:text-white has-checked:border-caramel-dark
                      has-focus-visible:ring-2 has-focus-visible:ring-caramel-dark has-focus-visible:ring-offset-2
                    "
                  >
                    <input
                      type="radio"
                      name="payment-method"
                      value={value}
                      checked={method === value}
                      onChange={() => { setMethod(value); pay.reset(); }}
                      className="sr-only"
                    />
                    <Icon size={18} aria-hidden="true" />
                    {paymentMethodLabel[value]}
                  </label>
                ))}
              </div>
            </fieldset>

            {method === 'CASH' ? (
              <div>
                <label htmlFor="payment-received" className="block text-sm font-medium text-espresso mb-1">
                  Monto recibido
                </label>
                <input
                  id="payment-received"
                  inputMode="decimal"
                  autoComplete="off"
                  value={received}
                  onChange={(e) => { setReceived(e.target.value); pay.reset(); }}
                  placeholder={order.total}
                  aria-describedby="payment-change"
                  aria-invalid={received !== '' && !receivedValid}
                  className={inputBase}
                />
                <p id="payment-change" aria-live="polite" className="mt-2 text-sm text-espresso">
                  {received === '' ? 'Ingresa el monto recibido.'
                    : !receivedValid ? 'Monto inválido: usa números con hasta 2 decimales.'
                    : changeCents < 0 ? `Faltan ${centsToMXN(-changeCents)}.`
                    : <>Cambio: <strong className="text-base">{centsToMXN(changeCents)}</strong></>}
                </p>
              </div>
            ) : (
              <p className="text-sm text-espresso/70">
                Se cobrará el total exacto de {formatMXN(order.total)} con {paymentMethodLabel[method].toLowerCase()}.
              </p>
            )}

            {error && (
              <div role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">
                <p>{error.message}</p>
                {error.products.length > 0 && (
                  <ul className="list-disc pl-5 mt-1">{error.products.map((n) => <li key={n}>{n}</li>)}</ul>
                )}
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <button type="button" onClick={close} disabled={pay.isPending} className={`${btnSecondary} flex-1`}>
                Volver
              </button>
              <button type="submit" disabled={!canSubmit} className={`${btnPrimary} flex-1`}>
                {pay.isPending && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                {pay.isPending ? 'Cobrando...' : `Cobrar ${formatMXN(order.total)}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
