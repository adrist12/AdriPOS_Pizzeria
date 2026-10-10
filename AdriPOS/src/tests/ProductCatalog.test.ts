// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ProductCatalog from '../presentation/pos/ProductCatalog.vue'

const categories = [
  {
    id: 'pizza',
    name: 'Pizzas',
    products: [
      {
        productId: 'pizza-1',
        name: 'Pizza de prueba',
        price: 18000,
        categoryId: 'pizza',
        categoryName: 'Pizzas',
        taxes: [],
      },
    ],
  },
  {
    id: 'drinks',
    name: 'Bebidas',
    products: [
      {
        productId: 'drink-1',
        name: 'Agua de prueba',
        price: 3000,
        categoryId: 'drinks',
        categoryName: 'Bebidas',
        taxes: [],
      },
    ],
  },
  {
    id: 'standard',
    name: 'Estándar',
    products: [
      {
        productId: 'standard-1',
        name: 'Producto interno',
        price: 1000,
        categoryId: 'standard',
        categoryName: 'Estándar',
        taxes: [],
      },
    ],
  },
]

describe('ProductCatalog', () => {
  it('shows categories first and only displays a category products after opening it', async () => {
    const wrapper = mount(ProductCatalog, { props: { categories } })

    expect(wrapper.findAll('.category-card')).toHaveLength(2)
    expect(wrapper.text()).not.toContain('Estándar')
    expect(wrapper.text()).not.toContain('Producto interno')
    expect(wrapper.findAll('.product-card')).toHaveLength(0)

    await wrapper.findAll('.category-card')[0].trigger('click')

    expect(wrapper.findAll('.product-card')).toHaveLength(1)
    expect(wrapper.text()).toContain('Pizza de prueba')
    expect(wrapper.text()).not.toContain('Agua de prueba')
  })

  it('emits the selected product for the order to handle', async () => {
    const wrapper = mount(ProductCatalog, { props: { categories } })
    await wrapper.findAll('.category-card')[1].trigger('click')
    await wrapper.find('.product-card').trigger('click')

    expect(wrapper.emitted('selectProduct')?.[0]?.[0]).toMatchObject({
      productId: 'drink-1',
      categoryId: 'drinks',
    })
  })

  it('searches only within the currently selected category', async () => {
    const wrapper = mount(ProductCatalog, { props: { categories } })
    await wrapper.findAll('.category-card')[0].trigger('click')
    await wrapper.find('input[type="search"]').setValue('not found')

    expect(wrapper.findAll('.product-card')).toHaveLength(0)
    expect(wrapper.text()).toContain('No hay productos que coincidan.')
  })
})
