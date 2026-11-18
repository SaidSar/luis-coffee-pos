// Tipos del Punto de Venta según el schema y las respuestas reales de /api/tables y /api/orders.
// Los Decimal de Prisma llegan como string.

export type TableStatus   = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING' | 'MERGED';
export type OrderType     = 'DINE_IN' | 'TAKEOUT' | 'DELIVERY';
export type OrderStatus   = 'OPEN' | 'IN_KITCHEN' | 'SERVED' | 'PAID' | 'CANCELLED';
export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER';

// Tipos que el POS puede crear
export type PosOrderType = OrderType;

// Estados reales de la entrega (enum DeliveryStatus del schema)
export type DeliveryStatus = 'PENDING' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';

export interface Delivery {
  id:          string;
  orderId:     string;
  address:     string;
  phone:       string;
  reference:   string | null;
  deliveryFee: string;
  driverName:  string | null;
  status:      DeliveryStatus;
  createdAt:   string;
  inTransitAt: string | null;
  deliveredAt: string | null;
}

export interface DeliveryInput {
  phone:       string;
  address:     string;
  reference?:  string;
  deliveryFee: string;
}

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
  active:           boolean;
  mergedIntoId:     string | null; // en secundarias: id de la principal
  mergedIntoNumber: number | null; // en secundarias: número de la principal
  mergedNumbers:    number[];      // en la principal: números de sus secundarias
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
  delivery:     Delivery | null;
  itemsTotal:   string; // solo productos
  total:        string; // productos + cargo de envío (calculado en el servidor)
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
  delivery?:     DeliveryInput;
  items:         OrderItemInput[];
}

// Respuesta de GET /api/deliveries
export interface DeliveryCard {
  id:          string;
  status:      DeliveryStatus;
  phone:       string;
  address:     string;
  reference:   string | null;
  deliveryFee: string;
  driverName:  string | null;
  createdAt:   string;
  inTransitAt: string | null;
  deliveredAt: string | null;
  order: {
    id:            string;
    ticketNumber:  number;
    status:        OrderStatus;
    customerName:  string | null;
    itemsTotal:    string;
    total:         string;
    paid:          boolean;
    paymentMethod: PaymentMethod | null;
    items:         { id: string; quantity: number; name: string }[];
  };
}

export interface DeliveryList { items: DeliveryCard[]; count: number; limit: number; offset: number }

export interface PayOrderInput {
  method:         PaymentMethod;
  amountReceived: string;
}
