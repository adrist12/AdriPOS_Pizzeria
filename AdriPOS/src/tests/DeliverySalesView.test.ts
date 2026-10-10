// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { AccountingGateway } from '../application/ports/PosGateway'
import DeliverySalesView from '../presentation/pos/DeliverySalesView.vue'

describe('DeliverySalesView', () => {
  it('shows paid delivery sales grouped by table and refreshes the selected month', async () => {
    const gateway: AccountingGateway = {
      getAccountingPaymentAccounts: vi.fn(),
      getAccountingMovementTypes: vi.fn(),
      getAccountingSummary: vi.fn(),
      getAccountingMovementDetails: vi.fn(),
      getAccountingDeliverySalesSummary: vi.fn()
        .mockResolvedValueOnce({
          period: '2026-10',
          totalSales: 5,
          byTable: [
            { tableName: 'Domicilio 1', sales: 3 },
            { tableName: 'Domicilio 2', sales: 2 },
          ],
        })
        .mockResolvedValueOnce({
          period: '2025-10',
          totalSales: 1,
          byTable: [{ tableName: 'Domicilio 2', sales: 1 }],
        }),
      recordAccountingMovement: vi.fn(),
      updateAccountingMovement: vi.fn(),
      syncAccountingSales: vi.fn(),
    }
    const wrapper = mount(DeliverySalesView, { props: { gateway } })
    await flushPromises()

    expect(wrapper.text()).toContain('Ventas de domicilio')
    expect(wrapper.text()).toContain('Domicilio 1')
    expect(wrapper.text()).toContain('5')
    expect(gateway.getAccountingDeliverySalesSummary).toHaveBeenCalledTimes(1)

    await wrapper.find('select[aria-label="Año"]').setValue('2025')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(gateway.getAccountingDeliverySalesSummary).toHaveBeenLastCalledWith(
      new Date().getMonth() + 1,
      2025,
    )
    expect(wrapper.text()).toContain('Domicilio 2')
  })

  it('shows the backend schema error instead of a misleading empty report', async () => {
    const gateway: AccountingGateway = {
      getAccountingPaymentAccounts: vi.fn(),
      getAccountingMovementTypes: vi.fn(),
      getAccountingSummary: vi.fn(),
      getAccountingMovementDetails: vi.fn(),
      getAccountingDeliverySalesSummary: vi.fn().mockRejectedValue(
        new Error('UniCenta no tiene receipts.TABLENAME ni receipts.ATTRIBUTES.'),
      ),
      recordAccountingMovement: vi.fn(),
      updateAccountingMovement: vi.fn(),
      syncAccountingSales: vi.fn(),
    }
    const wrapper = mount(DeliverySalesView, { props: { gateway } })
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('receipts.TABLENAME')
    expect(wrapper.text()).not.toContain('No hay ventas de domicilio registradas')
  })
})
