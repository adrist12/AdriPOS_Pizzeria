import type {
  DeliveryDetails,
  OrderAmounts,
  OrderItem,
  ServiceMode,
} from '../../domain/pos/types'

export function calculateOrderAmounts(
  items: OrderItem[],
  delivery: DeliveryDetails | null,
): OrderAmounts {
  const productsSubtotal = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  )
  const deliveryFee = delivery?.deliveryFee ?? 0

  return {
    productsSubtotal,
    deliveryFee,
    customerTotal: productsSubtotal + deliveryFee,
  }
}

export function deliveryDetailsForMode(
  mode: ServiceMode,
  customerName: string,
  phone: string,
  address: string,
  deliveryFee: number,
): DeliveryDetails | null {
  if (mode === 'DINE_IN') return null

  return {
    customerName: customerName.trim() || null,
    phone: phone.trim() || null,
    address: mode === 'DELIVERY' ? address.trim() || null : null,
    deliveryFee: mode === 'DELIVERY' ? deliveryFee : 0,
  }
}
