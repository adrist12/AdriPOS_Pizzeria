// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { PosGateway } from '../application/ports/PosGateway'
import KitchenView from '../presentation/pos/KitchenView.vue'

describe('KitchenView realtime updates', () => {
  it('reloads the selected station after an order changes', async () => {
    let onOrderChanged: ((event: { tableId: string }) => void) | undefined
    const gateway: PosGateway = {
      requestLogin: vi.fn(),
      isRealtimeConnected: () => true,
      onRealtimeConnectionChanged: () => vi.fn(),
      connectRealtime: vi.fn(),
      onKitchenItemUpdated: () => vi.fn(),
      onOrderChanged: (handler) => {
        onOrderChanged = handler
        return vi.fn()
      },
      getTables: vi.fn(),
      getProductCategories: vi.fn(),
      getActiveOrder: vi.fn(),
      sendOrder: vi.fn(),
      moveOrder: vi.fn(),
      payOrder: vi.fn(),
      updateOrderItemNotes: vi.fn(),
      removeOrderItem: vi.fn(),
      cancelOrder: vi.fn(),
      printKitchenOrder: vi.fn(),
      getKitchenTickets: vi.fn().mockResolvedValue([]),
      setKitchenItemStatus: vi.fn(),
    }
    const wrapper = mount(KitchenView, {
      props: { gateway },
    })
    await flushPromises()

    expect(gateway.getKitchenTickets).toHaveBeenCalledTimes(1)
    onOrderChanged?.({ tableId: 'table-1' })
    await flushPromises()

    expect(gateway.getKitchenTickets).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('renders every item included in the complete ticket returned for a station', async () => {
    const gateway: PosGateway = {
      requestLogin: vi.fn(),
      isRealtimeConnected: () => true,
      onRealtimeConnectionChanged: () => vi.fn(),
      connectRealtime: vi.fn(),
      onKitchenItemUpdated: () => vi.fn(),
      onOrderChanged: () => vi.fn(),
      getTables: vi.fn(),
      getProductCategories: vi.fn(),
      getActiveOrder: vi.fn(),
      sendOrder: vi.fn(),
      moveOrder: vi.fn(),
      payOrder: vi.fn(),
      updateOrderItemNotes: vi.fn(),
      removeOrderItem: vi.fn(),
      cancelOrder: vi.fn(),
      printKitchenOrder: vi.fn(),
      getKitchenTickets: vi.fn().mockResolvedValue([{
        ticketId: 'ticket-1',
        tableId: 'table-1',
        tableName: 'Mesa 4',
        waiterName: 'Ana',
        status: 'PENDING',
        createdAt: new Date(Date.now() - 65 * 60_000).toISOString(),
        items: [
          {
            itemId: 'pizza-line',
            name: 'Pizza',
            quantity: 1,
            status: 'PENDING',
            notes: 'PARA LLEVAR',
            createdAt: new Date().toISOString(),
          },
          {
            itemId: 'plancha-line',
            name: 'Hamburguesa',
            quantity: 2,
            status: 'PENDING',
            notes: null,
            createdAt: new Date().toISOString(),
          },
          {
            itemId: 'drink-line',
            name: 'Limonada',
            quantity: 1,
            status: 'READY',
            notes: null,
            createdAt: new Date().toISOString(),
          },
        ],
      }]),
      setKitchenItemStatus: vi.fn(),
    }
    const wrapper = mount(KitchenView, { props: { gateway } })
    await flushPromises()

    expect(wrapper.text()).toContain('Mesa 4')
    expect(wrapper.text()).not.toContain('table-1')
    expect(wrapper.text()).toContain('Tiempo en cocina:')
    expect(wrapper.text()).toContain('1 h 05 min')
    expect(wrapper.text()).toContain('Pizza')
    expect(wrapper.text()).toContain('Hamburguesa')
    expect(wrapper.text()).toContain('Limonada')
    expect(wrapper.text()).toContain('PARA LLEVAR')
    expect(wrapper.text()).toContain('LISTO')
    expect(wrapper.findAll('.kitchen-item')).toHaveLength(3)
    wrapper.unmount()
  })
})
