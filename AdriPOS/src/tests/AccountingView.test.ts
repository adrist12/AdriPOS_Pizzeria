// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { AccountingGateway } from '../application/ports/PosGateway'
import AccountingView from '../presentation/pos/AccountingView.vue'

describe('AccountingView', () => {
  it('loads period totals and cash detail through the gateway', async () => {
    const today = new Date()
    const expectedEndDate = localDateInput(today)
    const expectedStartDate = localDateInput(new Date(today.getFullYear(), today.getMonth(), 1))
    const gateway: AccountingGateway = {
      getAccountingPaymentAccounts: vi.fn().mockResolvedValue([{ id: 1, name: 'Efectivo' }]),
      getAccountingMovementTypes: vi.fn().mockResolvedValue([
        { id: 1, name: 'INGRESO' },
        { id: 2, name: 'EGRESO' },
      ]),
      getAccountingSummary: vi.fn().mockResolvedValue({
        period: '2026-05',
        income: 25000,
        expenses: 5000,
        balance: 20000,
        byPaymentAccount: [
          { account: 'Efectivo', type: 'INGRESO', total: 25000 },
          { account: 'Efectivo', type: 'EGRESO', total: 5000 },
          { account: 'Nequi', type: 'INGRESO', total: 18000 },
          { account: 'Nequi', type: 'EGRESO', total: 2000 },
        ],
      }),
      getAccountingMovementDetails: vi.fn().mockResolvedValue({
        Efectivo: {
          name: 'Efectivo',
          income: 25000,
          movements: [{
            id: 1,
            date: '2026-05-01T10:00:00Z',
            type: 'INGRESO',
            typeId: 1,
            cashAccountId: 1,
            amount: 25000,
            concept: 'Venta POS',
            account: 'VENTAS',
            cashAccount: 'Efectivo',
            origin: 'POS',
          }, {
            id: 2,
            date: '2026-05-02',
            type: 'EGRESO',
            typeId: 2,
            cashAccountId: 1,
            amount: 5000,
            concept: 'Compra de harina',
            account: 'GASTOS',
            cashAccount: 'Efectivo',
            origin: 'MANUAL',
          }, {
            id: 3,
            date: '2026-05-03',
            type: 'EGRESO',
            typeId: 2,
            cashAccountId: 2,
            amount: 2000,
            concept: 'Compra de empaques',
            account: 'GASTOS',
            cashAccount: 'Nequi',
            origin: 'MANUAL',
          }],
          expenses: [],
          totalExpenses: 7000,
        },
      }),
      getAccountingDeliverySalesSummary: vi.fn().mockResolvedValue({
        period: '2026-05',
        totalSales: 3,
        byTable: [{ tableName: 'Domicilio 1', sales: 3 }],
      }),
      recordAccountingMovement: vi.fn(),
      syncAccountingSales: vi.fn().mockResolvedValue({ synced: 0, skipped: 0 }),
      updateAccountingMovement: vi.fn().mockResolvedValue(undefined),
    }

    const wrapper = mount(AccountingView, { props: { gateway } })
    await flushPromises()

    expect(gateway.getAccountingSummary).toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('Venta POS')
    expect(wrapper.text()).toContain('Compra de harina')
    expect(wrapper.text()).toContain('Ingresos y egresos por método de pago')
    expect(wrapper.text()).not.toContain('INGRESOS DEL MES')
    expect(wrapper.text()).not.toContain('Balance')
    expect(wrapper.text()).toContain('Resumen mensual')
    expect(gateway.getAccountingDeliverySalesSummary).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('VENTAS DE DOMICILIO')
    expect(wrapper.find('#sync-panel').exists()).toBe(false)
    expect(wrapper.find('#movement-panel').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Nuevo egreso')
    const paymentCards = wrapper.findAll('.payment-summary-card')
    expect(paymentCards).toHaveLength(2)
    expect(paymentCards.find((card) => card.text().includes('Efectivo'))?.text())
      .toContain('$ 25.000')
    expect(paymentCards.find((card) => card.text().includes('Efectivo'))?.text())
      .toContain('$ 5.000')
    expect(paymentCards.find((card) => card.text().includes('Nequi'))?.text())
      .toContain('$ 18.000')
    expect(paymentCards.find((card) => card.text().includes('Nequi'))?.text())
      .toContain('$ 2.000')
    expect(wrapper.findAll('.expense-group')).toHaveLength(2)
    expect(wrapper.find('.expense-group[aria-label="Egresos de Efectivo"]').text())
      .toContain('Compra de harina')
    expect(wrapper.find('.expense-group[aria-label="Egresos de Nequi"]').text())
      .toContain('Compra de empaques')

    await wrapper.find('.sync-action-button').trigger('click')
    await flushPromises()
    expect(wrapper.find('#sync-panel').exists()).toBe(true)
    expect(wrapper.find('#sync-panel input[type="date"]').element).toHaveProperty('value', expectedStartDate)
    expect(wrapper.findAll('#sync-panel input[type="date"]')[1].element)
      .toHaveProperty('value', expectedEndDate)

    await wrapper.find('#sync-panel form').trigger('submit')
    await flushPromises()
    expect(gateway.syncAccountingSales).toHaveBeenCalledWith(expectedStartDate, expectedEndDate)
    expect(wrapper.find('#sync-panel').exists()).toBe(false)

    await wrapper.find('#accounting-year').setValue('2025')
    expect(gateway.getAccountingSummary).toHaveBeenCalledTimes(2)
    await wrapper.find('.ledger-period').trigger('submit')
    await flushPromises()
    expect(gateway.getAccountingSummary).toHaveBeenCalledTimes(3)

    await wrapper.find('[aria-label="Buscar egresos"]').setValue('inexistente')
    expect(wrapper.text()).toContain('No encontramos resultados')
    await wrapper.find('[aria-label="Buscar egresos"]').setValue('empaques')
    expect(wrapper.find('.expense-group[aria-label="Egresos de Efectivo"]').text())
      .toContain('No hay egresos de Efectivo que coincidan con la búsqueda')
    expect(wrapper.find('.expense-group[aria-label="Egresos de Nequi"]').text())
      .toContain('Compra de empaques')
    await wrapper.find('[aria-label="Buscar egresos"]').setValue('harina')
    expect(wrapper.text()).toContain('Compra de harina')
    await wrapper.find('[aria-label="Editar egreso: Compra de harina"]').trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    await wrapper.find('[role="dialog"] input[autocomplete="current-password"]').setValue('test-password')
    await wrapper.find('[role="dialog"] form').trigger('submit')
    await flushPromises()
    expect(gateway.updateAccountingMovement).toHaveBeenCalledWith(2, expect.objectContaining({
      concept: 'Compra de harina',
      password: 'test-password',
    }))
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.findAll('.payment-summary-card')).toHaveLength(2)
  })

})

function localDateInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
