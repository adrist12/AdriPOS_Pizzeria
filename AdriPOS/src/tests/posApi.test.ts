import { describe, expect, it, vi } from 'vitest'
import {
  getActiveOrder,
  normalizeProductCategories,
  payOrder,
  printKitchenOrder,
  setApiToken,
} from '../infrastructure/http/posApi'

describe('normalizeProductCategories', () => {
  it('groups a flat product response by its UniCenta category', () => {
    const categories = normalizeProductCategories([
      {
        productId: 'pizza-1',
        name: 'Pizza',
        price: 18000,
        taxes: [],
        categoryId: 'pizza',
        categoryName: 'Pizzas',
      },
      {
        productId: 'drink-1',
        name: 'Agua',
        price: 3000,
        taxes: [],
        categoryId: 'drinks',
        categoryName: 'Bebidas',
      },
      {
        productId: 'pizza-2',
        name: 'Pizza vegetariana',
        price: 20000,
        taxes: [],
        categoryId: 'pizza',
        categoryName: 'Pizzas',
      },
    ])

    expect(categories).toHaveLength(2)
    expect(categories[0].products.map(({ productId }) => productId)).toEqual([
      'pizza-1',
      'pizza-2',
    ])
    expect(categories[1].name).toBe('Bebidas')
  })

  describe('printKitchenOrder', () => {
    it('requests printing of the active table order from the authenticated back end', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
      vi.stubGlobal('fetch', fetchMock)
      setApiToken('session-token')

      await printKitchenOrder({ tableId: 'table 1' })

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/orders/table%201/print'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer session-token',
          }),
        }),
      )
      vi.unstubAllGlobals()
      setApiToken(null)
    })
  })

  describe('payOrder', () => {
    it('sends an authenticated cash payment to the encoded order endpoint', async () => {
      const paymentResult = {
        receiptId: 'receipt-1',
        ticketCode: 'POS-43',
        paymentMethod: 'cash' as const,
        productSubtotal: 18000,
        deliveryFee: 3000,
        customerTotal: 21000,
        amountReceived: 25000,
        change: 4000,
      }
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(paymentResult), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      vi.stubGlobal('fetch', fetchMock)
      setApiToken('session-token')

      await expect(payOrder('delivery 1', {
        paymentMethod: 'cash',
        amountReceived: 25000,
      })).resolves.toEqual(paymentResult)

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, requestOptions] = fetchMock.mock.calls[0]
      expect(url).toContain('/api/orders/delivery%201/pay')
      expect(requestOptions).toMatchObject({
        method: 'POST',
        headers: {
          Authorization: 'Bearer session-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ paymentMethod: 'cash', amountReceived: 25000 }),
      })
      vi.unstubAllGlobals()
      setApiToken(null)
    })
  })

  describe('getActiveOrder', () => {
    it('treats an empty order response as a normal null value', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response('null', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      vi.stubGlobal('fetch', fetchMock)

      await expect(getActiveOrder('seat-empty')).resolves.toBeNull()

      vi.unstubAllGlobals()
    })
  })

  it('keeps a server response that is already grouped', () => {
    const grouped = [
      {
        id: 'drinks',
        name: 'Bebidas',
        products: [
          {
            productId: 'drink-1',
            name: 'Agua',
            price: 3000,
            taxes: [],
            categoryId: 'drinks',
            categoryName: 'Bebidas',
          },
        ],
      },
    ]

    expect(normalizeProductCategories(grouped)).toEqual(grouped)
  })

  it('rejects an incompatible response with an actionable error', () => {
    expect(() => normalizeProductCategories([{ id: 'pizza', name: 'Pizzas' }]))
      .toThrow('Reinicia el back')
  })
})
