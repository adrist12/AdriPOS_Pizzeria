<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Product, ProductCategory } from '../../domain/pos/types'

const props = defineProps<{
  categories: ProductCategory[]
}>()

const emit = defineEmits<{
  selectProduct: [product: Product]
}>()

const selectedCategoryId = ref<string | null>(null)
const searchTerm = ref('')

const visibleCategories = computed(() =>
  props.categories.filter((category) => {
    const normalizedName = category.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLocaleLowerCase()
    return normalizedName !== 'estandar' && normalizedName !== 'standard'
  }),
)

const selectedCategory = computed(
  () => visibleCategories.value.find((category) => category.id === selectedCategoryId.value) ?? null,
)

const visibleProducts = computed(() => {
  const products = selectedCategory.value?.products ?? []
  const query = searchTerm.value.trim().toLocaleLowerCase()
  if (!query) return products
  return products.filter((product) =>
    product.name.toLocaleLowerCase().includes(query),
  )
})

function openCategory(categoryId: string): void {
  selectedCategoryId.value = categoryId
  searchTerm.value = ''
}

function showCategories(): void {
  selectedCategoryId.value = null
  searchTerm.value = ''
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(price)
}
</script>

<template>
  <section class="catalog-panel">
    <div class="section-heading">
      <div>
        <p class="eyebrow">CATÁLOGO</p>
        <h2>{{ selectedCategory?.name ?? 'Categorías' }}</h2>
      </div>
      <label v-if="selectedCategory" class="search-box">
        <span class="visually-hidden">Buscar productos de {{ selectedCategory.name }}</span>
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="8.5" cy="8.5" r="5.5" />
          <path d="m13 13 4 4" />
        </svg>
        <input v-model="searchTerm" type="search" placeholder="Buscar producto" />
      </label>
    </div>

    <div v-if="!selectedCategory" class="category-grid">
      <button
        v-for="category in visibleCategories"
        :key="category.id"
        class="category-card"
        type="button"
        @click="openCategory(category.id)"
      >
        <span class="category-card-count">{{ category.products?.length ?? 0 }} productos</span>
        <strong>{{ category.name }}</strong>
        <span class="category-card-arrow" aria-hidden="true">↗</span>
      </button>
      <div v-if="!visibleCategories.length" class="state-card">
        No se encontraron categorías con productos en UniCenta.
      </div>
    </div>

    <template v-else>
      <button class="catalog-back-button" type="button" @click="showCategories">
        ← Todas las categorías
      </button>
      <div v-if="visibleProducts.length" class="product-grid">
        <button
          v-for="product in visibleProducts"
          :key="product.productId"
          class="product-card"
          type="button"
          @click="emit('selectProduct', product)"
        >
          <span class="product-add" aria-hidden="true">+</span>
          <strong>{{ product.name }}</strong>
          <span>{{ formatPrice(product.price) }}</span>
        </button>
      </div>
      <div v-else class="state-card">No hay productos que coincidan.</div>
    </template>
  </section>
</template>
