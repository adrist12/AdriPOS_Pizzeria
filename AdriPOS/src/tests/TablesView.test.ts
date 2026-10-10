// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import TablesView from '../presentation/pos/TablesView.vue'

describe('TablesView', () => {
  const gateway = {
    requestLogin: vi.fn(),
    isRealtimeConnected: vi.fn(() => false),
    onRealtimeConnectionChanged: vi.fn(() => vi.fn()),
    connectRealtime: vi.fn(),
    onKitchenItemUpdated: vi.fn(),
    onOrderChanged: vi.fn(() => vi.fn()),
    getTables: vi.fn(),
    getProductCategories: vi.fn(),
    getActiveOrder: vi.fn(),
    sendOrder: vi.fn(),
    moveOrder: vi.fn(),
    payOrder: vi.fn(),
    getKitchenTickets: vi.fn(),
    setKitchenItemStatus: vi.fn(),
    updateOrderItemNotes: vi.fn(),
    removeOrderItem: vi.fn(),
    cancelOrder: vi.fn(),
    printKitchenOrder: vi.fn(),
  }

  beforeEach(() => {
    gateway.getTables.mockReset()
    gateway.getTables.mockResolvedValue([
      {
        id: 'table-1',
        name: 'Mesa 1',
        floorId: 'floor-1',
        waiterName: null,
        ticketId: null,
        occupied: null,
      },
      {
        id: 'takeaway-1',
        name: 'LLEVAR 1',
        floorId: 'floor-1',
        waiterName: 'Ana',
        ticketId: 'takeaway-1',
        occupied: null,
      },
      {
        id: 'delivery-1',
        name: 'Domicilio 1',
        floorId: 'floor-1',
        waiterName: 'Ana',
        ticketId: 'delivery-1',
        occupied: null,
      },
    ])
  })

  it('shows salon and takeaway tables in one section', async () => {
    const wrapper = mount(TablesView, {
      props: { initialMode: 'TABLES', gateway },
    })
    await flushPromises()

    expect(wrapper.findAll('.table-card')).toHaveLength(2)
    expect(wrapper.text()).toContain('Mesa 1')
    expect(wrapper.text()).toContain('LLEVAR 1')
    expect(wrapper.text()).not.toContain('Domicilio 1')

    await wrapper.find('.table-card').trigger('click')

    expect(wrapper.emitted('select')?.[0]).toEqual([
      expect.objectContaining({ id: 'table-1' }),
      'DINE_IN',
    ])
    await wrapper.findAll('.table-card')[1].trigger('click')
    expect(wrapper.emitted('select')?.[1]?.[1]).toBe('TAKEAWAY')
  })

  it('shows only places whose name contains domicilio for home-delivery tickets', async () => {
    const wrapper = mount(TablesView, {
      props: { initialMode: 'DELIVERY', gateway },
    })
    await flushPromises()

    expect(wrapper.findAll('.table-card')).toHaveLength(1)
    expect(wrapper.text()).toContain('Domicilio 1')
    expect(wrapper.text()).not.toContain('LLEVAR 1')
    expect(wrapper.text()).toContain('OCUPADA')

    await wrapper.find('.table-card').trigger('click')

    expect(wrapper.emitted('select')?.[0]?.[1]).toBe('DELIVERY')
  })

  it('shows a retry action when the table request fails', async () => {
    gateway.getTables.mockRejectedValueOnce(new Error('Sin conexión'))
    const wrapper = mount(TablesView, {
      props: { initialMode: 'TABLES', gateway },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Sin conexión')
    expect(wrapper.text()).toContain('Volver a intentar')
  })
})
