import { usePosDraftStore, type DeliveryDraft } from '../../stores/posDraftStore';
import { inputBase } from './posUi';
import type { DeliveryErrors, DeliveryField } from './deliveryValidation';

const inputCls = (invalid: boolean) => `${inputBase} ${invalid ? 'border-red-700' : ''}`;

interface Props { errors: DeliveryErrors; onFieldChange: (f: DeliveryField) => void }

export default function DeliveryForm({ errors, onFieldChange }: Props) {
  const customerName     = usePosDraftStore((s) => s.customerName);
  const delivery         = usePosDraftStore((s) => s.delivery);
  const setCustomerName  = usePosDraftStore((s) => s.setCustomerName);
  const setDeliveryField = usePosDraftStore((s) => s.setDeliveryField);

  const describedBy = (f: DeliveryField, hint?: string) =>
    [errors[f] ? `delivery-${f}-error` : '', hint ?? ''].filter(Boolean).join(' ') || undefined;
  const err = (f: DeliveryField) => errors[f] && <p id={`delivery-${f}-error`} className="mt-1 text-sm text-red-700">{errors[f]}</p>;

  const onDelivery = (f: keyof DeliveryDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setDeliveryField(f, e.target.value);
    onFieldChange(f);
  };

  return (
    <fieldset className="flex flex-col gap-3 border border-espresso/20 rounded-xl p-3">
      <legend className="px-1 text-sm font-semibold text-espresso">Datos de entrega</legend>
      <div>
        <label htmlFor="delivery-customerName" className="block text-sm font-medium text-espresso mb-1">Cliente *</label>
        <input id="delivery-customerName" value={customerName ?? ''} autoComplete="name" maxLength={100}
          onChange={(e) => { setCustomerName(e.target.value); onFieldChange('customerName'); }}
          aria-invalid={!!errors.customerName} aria-describedby={describedBy('customerName')} className={inputCls(!!errors.customerName)} />
        {err('customerName')}
      </div>
      <div>
        <label htmlFor="delivery-phone" className="block text-sm font-medium text-espresso mb-1">Teléfono *</label>
        <input id="delivery-phone" type="tel" inputMode="tel" autoComplete="tel" value={delivery.phone} onChange={onDelivery('phone')}
          aria-invalid={!!errors.phone} aria-describedby={describedBy('phone', 'delivery-phone-hint')} className={inputCls(!!errors.phone)} />
        <p id="delivery-phone-hint" className="mt-1 text-xs text-espresso/70">10 dígitos, ej. 669 123 4567</p>
        {err('phone')}
      </div>
      <div>
        <label htmlFor="delivery-address" className="block text-sm font-medium text-espresso mb-1">Dirección *</label>
        <textarea id="delivery-address" rows={2} value={delivery.address} onChange={onDelivery('address')} autoComplete="street-address"
          aria-invalid={!!errors.address} aria-describedby={describedBy('address')} className={`${inputCls(!!errors.address)} py-2 resize-none`} />
        {err('address')}
      </div>
      <div>
        <label htmlFor="delivery-reference" className="block text-sm font-medium text-espresso mb-1">Referencia (opcional)</label>
        <input id="delivery-reference" value={delivery.reference} onChange={onDelivery('reference')}
          aria-invalid={!!errors.reference} aria-describedby={describedBy('reference')} className={inputCls(!!errors.reference)} />
        {err('reference')}
      </div>
      <div>
        <label htmlFor="delivery-deliveryFee" className="block text-sm font-medium text-espresso mb-1">Cargo de envío (MXN)</label>
        <input id="delivery-deliveryFee" inputMode="decimal" autoComplete="off" value={delivery.deliveryFee} onChange={onDelivery('deliveryFee')}
          aria-invalid={!!errors.deliveryFee} aria-describedby={describedBy('deliveryFee')} className={inputCls(!!errors.deliveryFee)} />
        {err('deliveryFee')}
      </div>
    </fieldset>
  );
}
