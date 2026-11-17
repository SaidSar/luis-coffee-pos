// Tipos del Punto de Venta según el schema y las respuestas reales de /api/tables y /api/orders.
// Los Decimal de Prisma llegan como string.

export type TableStatus   = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING';
export type OrderType     = 'DINE_IN' | 'TAKEOUT' | 'DELIVERY';
export type OrderStatus   = 'OPEN' | 'IN_KITCHEN' | 'SERVED' | 'PAID' | 'CANCELLED';
export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER';

// Tipos que el POS puede crear (DELIVERY queda para el módulo de Entregas)
export type PosOrderType = Extract<OrderType, 'DINE_IN' | 'TAKEOUT'>;

// Estados a los que se puede pasar con PATCH /api/orders/:id/status
export type OrderStatusChange = Extract<OrderStatus, 'IN_KITCHEN' | 'SERVED' | 'CANCELLED'>;

export interface ActiveOrderRef {
  id:           string;
  ticketNumber: number;
  status:       OrderStatus;
}

export interface Table {
  id:          string;
  number:      number;
  capacity:    number;
  status:      TableStatus;
  activeOrder: ActiveOrderRef | null;
}

export interface OrderItem {
  id:        string;
  orderId:   string;
  productId: string;
  quantity:  number;
  unitPrice: string;
  notes:     string | null;
  lineTotal: string;
  product:   { id: string; name: string };
}

export interface Payment {
  id:          string;
  orderId:     string;
  method:      PaymentMethod;
  amount:      string;
  changeGiven: string | null;
  paidAt:      string;
}

export interface Order {
  id:           string;
  ticketNumber: number;
  customerName: string | null;
  tableId:      string | null;
  userId:       string;
  type:         OrderType;
  status:       OrderStatus;
  createdAt:    string;
  updatedAt:    string;
  items:        OrderItem[];
  table:        { id: string; number: number } | null;
  user:         { id: string; name: string };
  payment:      Payment | null;
  total:        string;
}

export interface OrderItemInput {
  productId: string;
  quantity:  number;
  notes?:    string;
}

export interface CreateOrderInput {
  type:          PosOrderType;
  tableId?:      string;
  customerName?: string;
  items:         OrderItemInput[];
}

export interface PayOrderInput {
  method:         PaymentMethod;
  amountReceived: string;
}
