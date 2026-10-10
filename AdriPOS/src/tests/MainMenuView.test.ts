// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MainMenuView from '../presentation/pos/MainMenuView.vue'

describe('MainMenuView', () => {
  it('opens the management section and keeps kitchen as a separate destination', async () => {
    const wrapper = mount(MainMenuView)
    const buttons = wrapper.findAll('.module-card')

    expect(buttons).toHaveLength(2)
    expect(wrapper.text()).toContain('Gestión de mesas')
    expect(wrapper.text()).toContain('Cocina')

    await buttons[0].trigger('click')
    await buttons[1].trigger('click')

    expect(wrapper.emitted('openManagement')).toHaveLength(1)
    expect(wrapper.emitted('openKitchen')).toHaveLength(1)
    expect(wrapper.emitted('openTables')).toBeUndefined()
  })

  it('shows accounting only for an administrator', () => {
    const waiter = mount(MainMenuView)
    expect(waiter.findAll('.module-card')).toHaveLength(2)

    const administrator = mount(MainMenuView, { props: { isAdministrator: true } })
    expect(administrator.findAll('.module-card')).toHaveLength(3)
    expect(administrator.text()).toContain('Contabilidad')
  })
})
