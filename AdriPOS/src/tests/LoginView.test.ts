// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requestLoginMock, connectionChangedMock, connectRealtimeMock } = vi.hoisted(() => ({
  requestLoginMock: vi.fn(),
  connectionChangedMock: vi.fn(() => vi.fn()),
  connectRealtimeMock: vi.fn(),
}))

const gateway = {
  requestLogin: requestLoginMock,
  isRealtimeConnected: vi.fn(() => false),
  onRealtimeConnectionChanged: connectionChangedMock,
  connectRealtime: connectRealtimeMock,
  onKitchenItemUpdated: vi.fn(() => vi.fn()),
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
  getAccountingPaymentAccounts: vi.fn(),
  getAccountingMovementTypes: vi.fn(),
  getAccountingSummary: vi.fn(),
  getAccountingMovementDetails: vi.fn(),
  getAccountingDeliverySalesSummary: vi.fn(),
  recordAccountingMovement: vi.fn(),
  syncAccountingSales: vi.fn(),
  updateAccountingMovement: vi.fn(),
}

import LoginView from '../presentation/auth/LoginView.vue'

describe('LoginView', () => {
  beforeEach(() => {
    requestLoginMock.mockReset()
    connectionChangedMock.mockClear()
    connectRealtimeMock.mockReset()
    gateway.isRealtimeConnected.mockReturnValue(false)
  })

  it('submits typed credentials and emits the authenticated session', async () => {
    const session = {
      token: 'jwt-token',
      expiresAt: Date.now() + 60_000,
      user: { id: 'waiter-1', name: 'Ana', roleId: 'waiter' },
    }
    requestLoginMock.mockResolvedValue(session)
    const wrapper = mount(LoginView, { props: { gateway } })

    await wrapper.find('#username').setValue('  Ana  ')
    await wrapper.find('#password').setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(requestLoginMock).toHaveBeenCalledWith({
      name: 'Ana',
      password: 'secret',
    })
    expect(wrapper.emitted('authenticated')?.[0]).toEqual([session])
  })

  it('shows authentication errors to the user', async () => {
    requestLoginMock.mockRejectedValue(new Error('Credenciales inválidas'))
    const wrapper = mount(LoginView, { props: { gateway } })

    await wrapper.find('#username').setValue('Ana')
    await wrapper.find('#password').setValue('incorrecta')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('Credenciales inválidas')
    expect(wrapper.emitted('authenticated')).toBeUndefined()
  })
})
