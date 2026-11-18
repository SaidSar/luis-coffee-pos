import type { DeliveryDraft } from '../../stores/posDraftStore';

export type DeliveryField = 'customerName' | keyof DeliveryDraft;
export type DeliveryErrors = Partial<Record<DeliveryField, string>>;

const MONEY_RE = /^\d+(\.\d{1,2})?$/;
export const MAX_DELIVERY_FEE = 1000; // mismo tope que el servidor

// Mismas reglas que el backend (el servidor sigue siendo la autoridad y normaliza el teléfono)
export const validateDelivery = (customerName: string | undefined, d: DeliveryDraft): DeliveryErrors => {
  const e: DeliveryErrors = {};
  const name = (customerName ?? '').trim();
  if (!name) e.customerName = 'El nombre del cliente es obligatorio.';
  else if (name.length > 80) e.customerName = 'Máximo 80 caracteres.';
  const digits = d.phone.replace(/[\s\-().]/g, '').replace(/^\+?52(?=\d{10}$)/, '');
  if (!d.phone.trim()) e.phone = 'El teléfono es obligatorio.';
  else if (!/^\d{10}$/.test(digits)) e.phone = 'Usa 10 dígitos (ej. 669 123 4567).';
  if (!d.address.trim()) e.address = 'La dirección es obligatoria.';
  else if (d.address.trim().length > 250) e.address = 'Máximo 250 caracteres.';
  if (d.reference.trim().length > 200) e.reference = 'Máximo 200 caracteres.';
  const fee = d.deliveryFee.trim() || '0';
  if (!MONEY_RE.test(fee)) e.deliveryFee = 'Usa un monto con hasta 2 decimales.';
  else if (Number(fee) > MAX_DELIVERY_FEE) e.deliveryFee = `El cargo máximo es $${MAX_DELIVERY_FEE}.`;
  return e;
};

// Mapa de errores del servidor (details.path) a los campos del formulario
export const deliveryErrorsFromServer = (fe: Record<string, string>): DeliveryErrors => ({
  ...(fe.customerName ? { customerName: fe.customerName } : {}),
  ...(fe['delivery.phone'] ? { phone: fe['delivery.phone'] } : {}),
  ...(fe['delivery.address'] ? { address: fe['delivery.address'] } : {}),
  ...(fe['delivery.reference'] ? { reference: fe['delivery.reference'] } : {}),
  ...(fe['delivery.deliveryFee'] ? { deliveryFee: fe['delivery.deliveryFee'] } : {}),
});
