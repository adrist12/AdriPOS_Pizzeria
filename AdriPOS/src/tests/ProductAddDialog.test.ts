// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ProductAddDialog from '../presentation/pos/ProductAddDialog.vue'

const product = {
  productId: 'pizza-1',
  name: 'Pizza',
  price: 18000,
  categoryId: 'pizza',
  categoryName: 'Pizzas',
  taxes: [],
}

describe('ProductAddDialog', () => {
  it('confirms the selected quantity, note and takeaway option', async () => {
    const wrapper = mount(ProductAddDialog, {
      props: { product },
    })

    await wrapper.find('[aria-label="Añadir una unidad"]').trigger('click')
    await wrapper.find('textarea').setValue('Sin cebolla')
    await wrapper.find('input[type="checkbox"]').setValue(true)
    await wrapper.find('.product-dialog-add').trigger('click')

    expect(wrapper.emitted('confirm')?.[0]?.[0]).toEqual({
      product,
      quantity: 2,
      notes: 'Sin cebolla',
      takeaway: true,
    })
  })

  it('always offers the takeaway option', async () => {
    const wrapper = mount(ProductAddDialog, {
      props: { product },
    })

    expect(wrapper.find('.product-dialog-takeaway').exists()).toBe(true)
    await wrapper.find('.product-dialog-add').trigger('click')
    expect(wrapper.emitted('confirm')?.[0]?.[0]).toMatchObject({ takeaway: false })
  })
})
