// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getProductCategoriesMock, getActiveOrderMock, sendOrderMock } = vi.hoisted(() => ({
  getProductCategoriesMock: vi.fn(),
  getActiveOrderMock: vi.fn(),
  sendOrderMock: vi.fn(),
}))

import OrderView from '../presentation/pos/OrderView.vue'

const table = {
  id: 'takeaway-1',
  name: 'LLEVAR 1',
  floorId: 'floor-1',
  waiterName: null,
  ticketId: null,
  occupied: null,
}

const session = {
  token: 'test-token',
  expiresAt: Date.now() + 60_000,
  user: { id: 'waiter-1', name: 'Ana', roleId: 'waiter' },
}

const gateway = {
  requestLogin: vi.fn(),
  isRealtimeConnected: vi.fn(() => false),
  onRealtimeConnectionChanged: vi.fn(() => vi.fn()),
  connectRealtime: vi.fn(),
  onKitchenItemUpdated: vi.fn(),
  onOrderChanged: vi.fn(() => vi.fn()),
  getTables: vi.fn(),
  getProductCategories: getProductCategoriesMock,
  getActiveOrder: getActiveOrderMock,
  sendOrder: sendOrderMock,
  moveOrder: vi.fn(),
  payOrder: vi.fn(),
  getKitchenTickets: vi.fn(),
  setKitchenItemStatus: vi.fn(),
  updateOrderItemNotes: vi.fn(),
  removeOrderItem: vi.fn(),
  cancelOrder: vi.fn(),
  printKitchenOrder: vi.fn(),
}

describe('OrderView', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    getProductCategoriesMock.mockReset()
    getActiveOrderMock.mockReset()
    sendOrderMock.mockReset()
    gateway.moveOrder.mockReset()
    gateway.moveOrder.mockResolvedValue(undefined)
    gateway.payOrder.mockReset()
    gateway.payOrder.mockResolvedValue({
      receiptId: 'receipt-1',
      ticketCode: 'POS-1',
      paymentMethod: 'cash',
      productSubtotal: 18000,
      deliveryFee: 0,
      customerTotal: 18000,
      amountReceived: 18000,
      change: 0,
    })
    gateway.updateOrderItemNotes.mockReset()
    gateway.updateOrderItemNotes.mockResolvedValue(undefined)
    gateway.removeOrderItem.mockReset()
    gateway.removeOrderItem.mockResolvedValue(undefined)
    gateway.cancelOrder.mockReset()
    gateway.cancelOrder.mockResolvedValue(undefined)
    gateway.printKitchenOrder.mockReset()
    gateway.printKitchenOrder.mockResolvedValue(undefined)
    getProductCategoriesMock.mockResolvedValue([{
      id: 'cat-pizza',
      name: 'Pizzas',
      products: [{
        productId: 'pizza-1',
        name: 'Pizza de prueba',
        price: 18000,
        categoryId: 'cat-pizza',
        categoryName: 'Pizzas',
        taxes: [{
          taxId: 'tax-1',
          name: 'IVA',
          rate: 0.19,
          cascade: false,
          categoryId: 'category-1',
        }],
      }],
    }])
    getActiveOrderMock.mockResolvedValue(null)
    sendOrderMock.mockResolvedValue(undefined)
  })

  it('requires a delivery address but allows optional name and phone', async () => {
    const wrapper = mount(OrderView, {
      props: { table, mode: 'DELIVERY', session, gateway },
    })
    await flushPromises()
    await wrapper.find('.category-card').trigger('click')
    await wrapper.find('.product-card').trigger('click')
    await wrapper.find('.product-dialog-add').trigger('click')
    await wrapper.find('.order-toggle-button').trigger('click')
    await wrapper.find('.send-order-button').trigger('click')

    expect(wrapper.text()).toContain('Escribe la dirección de entrega.')
    expect(sendOrderMock).not.toHaveBeenCalled()
  })

  it('opens the order in a full-screen accessible drawer that can be dismissed', async () => {
    const wrapper = mount(OrderView, {
      props: { table, mode: 'TAKEAWAY', session, gateway },
    })
    await flushPromises()

    await wrapper.find('.order-toggle-button').trigger('click')
    expect(wrapper.find('[role="region"][aria-labelledby="current-order-title"]').exists())
      .toBe(true)
    expect(wrapper.find('#current-order-title').text()).toBe('Pedido actual')

    await wrapper.find('[aria-label="Cerrar pedido"]').trigger('click')
    expect(wrapper.find('[role="region"][aria-labelledby="current-order-title"]').exists())
      .toBe(false)
  })

  it('sends delivery details separately and only includes the product line in the order', async () => {
    const wrapper = mount(OrderView, {
      props: { table, mode: 'DELIVERY', session, gateway },
    })
    await flushPromises()
    await wrapper.find('.category-card').trigger('click')
    await wrapper.find('.product-card').trigger('click')
    await wrapper.find('.product-dialog-add').trigger('click')
    await wrapper.find('.order-toggle-button').trigger('click')
    await wrapper.find('input[autocomplete="name"]').setValue('Cliente')
    await wrapper.find('input[autocomplete="tel"]').setValue('3001234567')
    await wrapper.find('input[autocomplete="street-address"]').setValue('Calle 1')
    await wrapper.find('input[type="number"]').setValue('7000')

    expect(wrapper.text()).toContain('25.000')
    expect(wrapper.text()).toContain('18.000')

    await wrapper.find('.send-order-button').trigger('click')
    await flushPromises()

    expect(sendOrderMock).toHaveBeenCalledWith(expect.objectContaining({
      tableId: 'takeaway-1',
      waiterId: 'waiter-1',
      items: [expect.objectContaining({ productId: 'pizza-1', price: 18000 })],
      delivery: {
        customerName: 'Cliente',
        phone: '3001234567',
        address: 'Calle 1',
        deliveryFee: 7000,
      },
    }))
    expect(wrapper.text()).toContain('Comanda enviada a cocina.')
    expect(wrapper.text()).toContain('La tarifa se guarda como dato de domicilio')
  })

  it('sets zero delivery charge and no address for pickup orders', async () => {
    const wrapper = mount(OrderView, {
      props: { table, mode: 'TAKEAWAY', session, gateway },
    })
    await flushPromises()
    await wrapper.find('.category-card').trigger('click')
    await wrapper.find('.product-card').trigger('click')
    await wrapper.find('.product-dialog-add').trigger('click')
    await wrapper.find('.order-toggle-button').trigger('click')
    await wrapper.find('input[autocomplete="name"]').setValue('Cliente')
    await wrapper.find('input[autocomplete="tel"]').setValue('3001234567')
    await wrapper.find('.send-order-button').trigger('click')
    await flushPromises()

    expect(sendOrderMock).toHaveBeenCalledWith(expect.objectContaining({
      delivery: {
        customerName: 'Cliente',
        phone: '3001234567',
        address: null,
        deliveryFee: 0,
      },
    }))
  })

  it('keeps the order panel hidden until the user opens it', async () => {
    const wrapper = mount(OrderView, {
      props: { table, mode: 'TAKEAWAY', session, gateway },
    })
    await flushPromises()

    expect(wrapper.find('.order-panel').exists()).toBe(false)
    await wrapper.find('.order-toggle-button').trigger('click')
    expect(wrapper.find('.order-panel').exists()).toBe(true)
  })

  it('allows delivery orders without customer name or phone', async () => {
    const wrapper = mount(OrderView, {
      props: { table, mode: 'DELIVERY', session, gateway },
    })
    await flushPromises()
    await wrapper.find('.category-card').trigger('click')
    await wrapper.find('.product-card').trigger('click')
    await wrapper.find('.product-dialog-add').trigger('click')
    await wrapper.find('.order-toggle-button').trigger('click')
    await wrapper.find('input[autocomplete="street-address"]').setValue('Calle 1')
    await wrapper.find('.send-order-button').trigger('click')
    await flushPromises()

    expect(sendOrderMock).toHaveBeenCalledWith(expect.objectContaining({
      delivery: {
        customerName: null,
        phone: null,
        address: 'Calle 1',
        deliveryFee: 0,
      },
    }))
  })

  it('allows editing a saved note only while the server creation time is under ten minutes old', async () => {
    getActiveOrderMock.mockResolvedValue({
      orderId: 'takeaway-1',
      tableId: 'takeaway-1',
      waiterName: 'Ana',
      waiterId: 'waiter-1',
      createdAt: new Date().toISOString(),
      items: [{
        productId: 'pizza-1',
        productName: 'Pizza de prueba',
        price: 18000,
        quantity: 1,
        notes: 'Sin cebolla',
        createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        taxes: [],
      }],
      delivery: null,
    })
    const wrapper = mount(OrderView, {
      props: { table, mode: 'TAKEAWAY', session, gateway },
    })
    await flushPromises()
    await wrapper.find('.order-toggle-button').trigger('click')
    await wrapper.find('.saved-note button').trigger('click')
    await wrapper.find('.note-editor input').setValue('Sin cebolla, bien cocida')
    await wrapper.find('.note-editor button').trigger('click')
    await flushPromises()

    expect(gateway.updateOrderItemNotes).toHaveBeenCalledWith(
      'takeaway-1',
      'pizza-1',
      'Sin cebolla, bien cocida',
    )
    expect(wrapper.text()).toContain('Nota actualizada.')
  })

  it('deletes a saved product through the order gateway', async () => {
    getActiveOrderMock.mockResolvedValue({
      orderId: 'takeaway-1',
      tableId: 'takeaway-1',
      waiterName: 'Ana',
      waiterId: 'waiter-1',
      createdAt: new Date().toISOString(),
      items: [{
        productId: 'pizza-1',
        productName: 'Pizza de prueba',
        price: 18000,
        quantity: 1,
        createdAt: new Date().toISOString(),
        taxes: [],
      }],
      delivery: null,
    })
    const wrapper = mount(OrderView, {
      props: { table, mode: 'TAKEAWAY', session, gateway },
    })
    await flushPromises()
    await wrapper.find('.order-toggle-button').trigger('click')
    await wrapper.find('.remove-order-item').trigger('click')
    await flushPromises()

    expect(gateway.removeOrderItem).toHaveBeenCalledWith('takeaway-1', 'pizza-1')
    expect(wrapper.text()).toContain('Producto eliminado del pedido.')
  })

  it('cancels the entire active order, including its UniCenta open ticket', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    getActiveOrderMock.mockResolvedValue({
      orderId: 'takeaway-1',
      tableId: 'takeaway-1',
      waiterName: 'Ana',
      waiterId: 'waiter-1',
      createdAt: new Date().toISOString(),
      items: [{
        productId: 'pizza-1',
        productName: 'Pizza de prueba',
        price: 18000,
        quantity: 1,
        createdAt: new Date().toISOString(),
        taxes: [],
      }],
      delivery: null,
    })
    const wrapper = mount(OrderView, {
      props: { table, mode: 'TAKEAWAY', session, gateway },
    })
    await flushPromises()
    await wrapper.find('.order-toggle-button').trigger('click')
    await wrapper.find('.cancel-order-button').trigger('click')
    await flushPromises()

    expect(gateway.cancelOrder).toHaveBeenCalledWith('takeaway-1')
    expect(wrapper.text()).toContain('Orden cancelada y puesto liberado.')
    expect(wrapper.text()).toContain('Aún no hay productos.')
  })

  it('opens a pizza confirmation and keeps takeaway and dine-in versions as separate lines', async () => {
    const wrapper = mount(OrderView, {
      props: { table, mode: 'DINE_IN', session, gateway },
    })
    await flushPromises()
    await wrapper.find('.category-card').trigger('click')
    await wrapper.find('.product-card').trigger('click')

    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(wrapper.find('.product-dialog-takeaway').exists()).toBe(true)

    await wrapper.find('.product-dialog-takeaway input').setValue(true)
    await wrapper.find('.product-dialog-add').trigger('click')
    await wrapper.find('.product-card').trigger('click')
    await wrapper.find('.product-dialog-add').trigger('click')
    await wrapper.find('.order-toggle-button').trigger('click')

    const lines = wrapper.findAll('.order-line')
    expect(lines).toHaveLength(2)
    expect(lines[0].text()).toContain('PARA LLEVAR')
    expect(lines[1].text()).not.toContain('PARA LLEVAR')

    await wrapper.find('.send-order-button').trigger('click')
    await flushPromises()
    expect(sendOrderMock).toHaveBeenCalledWith(expect.objectContaining({
      items: [
        expect.objectContaining({ productId: 'pizza-1', takeaway: true }),
        expect.objectContaining({ productId: 'pizza-1', takeaway: false }),
      ],
    }))
  })

  it('shows takeaway option for products outside pizza categories', async () => {
    getProductCategoriesMock.mockResolvedValueOnce([{
      id: 'drinks',
      name: 'Bebidas',
      products: [{
        productId: 'drink-1',
        name: 'Agua',
        price: 3000,
        categoryId: 'drinks',
        categoryName: 'Bebidas',
        taxes: [],
      }],
    }])
    const wrapper = mount(OrderView, {
      props: { table, mode: 'DINE_IN', session, gateway },
    })
    await flushPromises()
    await wrapper.find('.category-card').trigger('click')
    await wrapper.find('.product-card').trigger('click')

    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(wrapper.find('.product-dialog-takeaway').exists()).toBe(true)
  })

  it('prints a saved complete order through the gateway', async () => {
    const wrapper = mount(OrderView, {
      props: { table, mode: 'TAKEAWAY', session, gateway },
    })
    await flushPromises()
    await wrapper.find('.category-card').trigger('click')
    await wrapper.find('.product-card').trigger('click')
    await wrapper.find('.product-dialog-add').trigger('click')
    await wrapper.find('.order-toggle-button').trigger('click')
    await wrapper.find('.send-order-button').trigger('click')
    await flushPromises()

    await wrapper.find('.print-order-button').trigger('click')
    await flushPromises()

    expect(gateway.printKitchenOrder).toHaveBeenCalledWith({ tableId: 'takeaway-1' })
    expect(wrapper.text()).toContain('Comanda enviada a la impresora.')
  })

  it('requires sending draft products before printing a saved order', async () => {
    getActiveOrderMock.mockResolvedValueOnce({
      orderId: 'takeaway-1',
      tableId: 'takeaway-1',
      waiterName: 'Ana',
      waiterId: 'waiter-1',
      createdAt: new Date().toISOString(),
      items: [{
        productId: 'pizza-1',
        productName: 'Pizza anterior',
        price: 18000,
        quantity: 1,
        taxes: [],
      }],
      delivery: null,
    })
    const wrapper = mount(OrderView, {
      props: { table, mode: 'TAKEAWAY', session, gateway },
    })
    await flushPromises()
    await wrapper.find('.category-card').trigger('click')
    await wrapper.find('.product-card').trigger('click')
    await wrapper.find('.product-dialog-add').trigger('click')
    await wrapper.find('.order-toggle-button').trigger('click')

    expect(wrapper.find('.print-order-button').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Envía primero los productos nuevos')
    expect(gateway.printKitchenOrder).not.toHaveBeenCalled()
  })

  it('moves a saved order to a free place of the same service type', async () => {
    getActiveOrderMock.mockResolvedValueOnce({
      orderId: 'takeaway-1',
      tableId: 'takeaway-1',
      waiterName: 'Ana',
      waiterId: 'waiter-1',
      createdAt: new Date().toISOString(),
      items: [{
        productId: 'pizza-1',
        productName: 'Pizza',
        price: 18000,
        quantity: 1,
        taxes: [],
      }],
      delivery: { customerName: null, phone: null, address: null, deliveryFee: 0 },
    })
    gateway.getTables.mockResolvedValueOnce([
      { ...table, ticketId: 'takeaway-1' },
      { ...table, id: 'takeaway-2', name: 'LLEVAR 2', ticketId: null },
      { ...table, id: 'dine-in-1', name: 'Mesa 1', ticketId: null },
      { ...table, id: 'takeaway-3', name: 'LLEVAR 3', ticketId: 'occupied-ticket' },
    ])
    const wrapper = mount(OrderView, {
      props: { table, mode: 'TAKEAWAY', session, gateway },
    })
    await flushPromises()
    await wrapper.find('.order-toggle-button').trigger('click')
    await wrapper.find('.move-order-button').trigger('click')
    await flushPromises()

    const destinationOptions = wrapper.findAll('.move-destination-option')
    expect(destinationOptions).toHaveLength(1)
    expect(destinationOptions[0].text()).toContain('LLEVAR 2')
    expect(wrapper.text()).not.toContain('Mesa 1')
    expect(wrapper.text()).not.toContain('LLEVAR 3')

    await destinationOptions[0].find('input').setValue()
    await wrapper.find('.confirm-move-order-button').trigger('click')
    await flushPromises()

    expect(gateway.moveOrder).toHaveBeenCalledWith({
      currentTableId: 'takeaway-1',
      newTableId: 'takeaway-2',
    })
    expect(wrapper.emitted('back')).toHaveLength(1)
  })

  it('collects cash including delivery fee and displays the change and UniCenta ticket number', async () => {
    getActiveOrderMock.mockResolvedValueOnce({
      orderId: 'delivery-1',
      tableId: 'delivery-1',
      waiterName: 'Ana',
      waiterId: 'waiter-1',
      createdAt: new Date().toISOString(),
      items: [{
        productId: 'pizza-1',
        productName: 'Pizza',
        price: 18000,
        quantity: 1,
        taxes: [],
      }],
      delivery: {
        customerName: 'Cliente',
        phone: '3000000000',
        address: 'Calle 1',
        deliveryFee: 3000,
      },
    })
    gateway.payOrder.mockResolvedValueOnce({
      receiptId: 'receipt-1',
      ticketCode: 'POS-43',
      paymentMethod: 'cash',
      productSubtotal: 18000,
      deliveryFee: 3000,
      customerTotal: 21000,
      amountReceived: 25000,
      change: 4000,
    })
    const wrapper = mount(OrderView, {
      props: {
        table: { ...table, id: 'delivery-1', name: 'Domicilio 1' },
        mode: 'DELIVERY',
        session,
        gateway,
      },
    })
    await flushPromises()
    await wrapper.find('.order-toggle-button').trigger('click')
    await wrapper.find('.pay-order-button').trigger('click')
    await wrapper.find('input[aria-label="Efectivo recibido"]').setValue('25000')
    expect(wrapper.text()).toContain('4.000')

    await wrapper.find('.payment-dialog .product-dialog-add').trigger('click')
    await flushPromises()

    expect(gateway.payOrder).toHaveBeenCalledWith('delivery-1', {
      paymentMethod: 'cash',
      amountReceived: 25000,
    })
    expect(wrapper.text()).toContain('POS-43')
    expect(wrapper.text()).toContain('Registrada en UniCenta')
    await wrapper.find('.payment-dialog .product-dialog-add').trigger('click')
    expect(wrapper.emitted('back')).toHaveLength(1)
  })

  it('records Nequi as a bank payment for the exact customer total', async () => {
    getActiveOrderMock.mockResolvedValueOnce({
      orderId: 'takeaway-1',
      tableId: 'takeaway-1',
      waiterName: 'Ana',
      waiterId: 'waiter-1',
      createdAt: new Date().toISOString(),
      items: [{
        productId: 'pizza-1',
        productName: 'Pizza',
        price: 18000,
        quantity: 1,
        taxes: [],
      }],
      delivery: null,
    })
    gateway.payOrder.mockResolvedValueOnce({
      receiptId: 'receipt-2',
      ticketCode: 'POS-44',
      paymentMethod: 'bank',
      productSubtotal: 18000,
      deliveryFee: 0,
      customerTotal: 18000,
      amountReceived: 18000,
      change: 0,
    })
    const wrapper = mount(OrderView, {
      props: { table, mode: 'TAKEAWAY', session, gateway },
    })
    await flushPromises()
    await wrapper.find('.order-toggle-button').trigger('click')
    await wrapper.find('.pay-order-button').trigger('click')
    await wrapper.find('.payment-method-option input[value="bank"]').setValue()
    expect(wrapper.find('input[aria-label="Efectivo recibido"]').exists()).toBe(false)

    await wrapper.find('.payment-dialog .product-dialog-add').trigger('click')
    await flushPromises()

    expect(gateway.payOrder).toHaveBeenCalledWith('takeaway-1', {
      paymentMethod: 'bank',
      amountReceived: 18000,
    })
    expect(wrapper.text()).toContain('Pago registrado como Nequi.')
  })
})
