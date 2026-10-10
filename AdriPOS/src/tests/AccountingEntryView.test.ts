// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { AccountingGateway } from '../application/ports/PosGateway'
import AccountingEntryView from '../presentation/pos/AccountingEntryView.vue'

describe('AccountingEntryView', () => {
  it('registers an income or expense for the selected date', async () => {
    const gateway: AccountingGateway = {
      getAccountingPaymentAccounts: vi.fn().mockResolvedValue([{ id: 1, name: 'Efectivo' }]),
      getAccountingMovementTypes: vi.fn().mockResolvedValue([
        { id: 1, name: 'INGRESO' },
        { id: 2, name: 'EGRESO' },
      ]),
      getAccountingSummary: vi.fn(),
      getAccountingMovementDetails: vi.fn(),
      getAccountingDeliverySalesSummary: vi.fn(),
      recordAccountingMovement: vi.fn().mockResolvedValue(undefined),
      updateAccountingMovement: vi.fn(),
      syncAccountingSales: vi.fn(),
    }
    const wrapper = mount(AccountingEntryView, { props: { gateway } })
    await flushPromises()

    expect((wrapper.find('input[type="date"]').element as HTMLInputElement).value)
      .toBe(localDateInput(new Date()))
    expect((wrapper.find('select').element as HTMLSelectElement).value).toBe('2')

    await wrapper.find('input[type="date"]').setValue('2026-08-21')
    await wrapper.find('select').setValue('1')
    await wrapper.find('input[placeholder="Ej.: Compra de ingredientes"]').setValue('Venta especial')
    await wrapper.find('input[type="number"]').setValue('27500')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(gateway.recordAccountingMovement).toHaveBeenCalledWith({
      date: '2026-08-21',
      typeId: 1,
      cashAccountId: 1,
      concept: 'Venta especial',
      amount: 27500,
    })
    expect(wrapper.text()).toContain('El movimiento quedó registrado en la fecha seleccionada.')
  })
})

function localDateInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
