import { describe, expect, it } from 'vitest'
import {
  calculateOrderAmounts,
  deliveryDetailsForMode,
} from '../application/orders/orderCalculations'
import type { OrderItem } from '../domain/pos/types'

const items: OrderItem[] = [
  {
    productId: 'pizza-1',
    productName: 'Pizza',
    price: 18000,
    quantity: 2,
    taxes: [],
  },
]

describe('order totals and external delivery fee', () => {
  it('keeps the delivery charge separate from UniCenta product subtotal', () => {
    const delivery = deliveryDetailsForMode(
      'DELIVERY',
      'Cliente',
      '3001234567',
      'Calle 1',
      7000,
    )

    expect(calculateOrderAmounts(items, delivery)).toEqual({
      productsSubtotal: 36000,
      deliveryFee: 7000,
      customerTotal: 43000,
    })
  })

  it('does not add a delivery charge to takeaway orders', () => {
    const takeaway = deliveryDetailsForMode(
      'TAKEAWAY',
      'Cliente',
      '3001234567',
      'Ignored address',
      9000,
    )

    expect(takeaway).toEqual({
      customerName: 'Cliente',
      phone: '3001234567',
      address: null,
      deliveryFee: 0,
    })
    expect(calculateOrderAmounts(items, takeaway).customerTotal).toBe(36000)
  })

  it('does not include customer information for dine-in orders', () => {
    expect(
      deliveryDetailsForMode('DINE_IN', '', '', '', 0),
    ).toBeNull()
    expect(calculateOrderAmounts(items, null)).toEqual({
      productsSubtotal: 36000,
      deliveryFee: 0,
      customerTotal: 36000,
    })
  })
})
