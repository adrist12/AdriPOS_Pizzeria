export type ServiceMode = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY'

export interface DeliveryDetails {
  customerName: string | null
  phone: string | null
  address: string | null
  deliveryFee: number
}

export interface TaxInfo {
  taxId: string
  name: string
  rate: number
  cascade: boolean
  categoryId: string
}

export interface Product {
  productId: string
  name: string
  price: number
  taxes: TaxInfo[]
  categoryId: string
  categoryName: string
}

export interface ProductCategory {
  id: string
  name: string
  products: Product[]
}

export interface OrderItem {
  lineId?: string
  productId: string
  productName: string
  price: number
  quantity: number
  notes?: string
  takeaway?: boolean
  createdAt?: string
  taxes: TaxInfo[]
}

export interface PosTable {
  id: string
  name: string
  floorId: string
  waiterName: string | null
  ticketId: string | null
  occupied: string | null
}

export interface ActiveOrder {
  orderId: string | null
  tableId: string
  waiterName: string
  waiterId: string
  createdAt: string
  items: OrderItem[]
  delivery: DeliveryDetails | null
}

export interface OrderToSend {
  requestId: string
  tableId: string
  waiterName: string
  waiterId: string
  createdAt: string
  items: OrderItem[]
  delivery: DeliveryDetails | null
}

export interface KitchenPrintRequest {
  tableId: string
}

export interface MoveOrderRequest {
  currentTableId: string
  newTableId: string
}

export type PaymentMethod = 'cash' | 'bank'

export interface PayOrderRequest {
  paymentMethod: PaymentMethod
  amountReceived: number
}

export interface PayOrderResult {
  receiptId: string
  ticketCode: string
  paymentMethod: PaymentMethod
  productSubtotal: number
  deliveryFee: number
  customerTotal: number
  amountReceived: number
  change: number
}

export interface KitchenItem {
  itemId: string
  name: string
  quantity: number
  status: 'PENDING' | 'READY'
  notes: string | null
  createdAt: string
}

export interface KitchenTicket {
  ticketId: string
  tableId: string
  tableName: string
  waiterName: string
  status: string
  createdAt: string
  items: KitchenItem[]
}

export interface KitchenItemUpdate {
  ticketId: string
  itemId: string
  status: 'PENDING' | 'READY'
}

export interface OrderAmounts {
  productsSubtotal: number
  deliveryFee: number
  customerTotal: number
}
