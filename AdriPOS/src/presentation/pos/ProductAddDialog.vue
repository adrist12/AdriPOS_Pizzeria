<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Product } from '../../domain/pos/types'

const props = defineProps<{
  product: Product
}>()

const emit = defineEmits<{
  confirm: [selection: {
    product: Product
    quantity: number
    notes: string
    takeaway: boolean
  }]
  cancel: []
}>()

const quantity = ref(1)
const notes = ref('')
const takeaway = ref(false)
const subtotal = computed(() => props.product.price * quantity.value)

function formatPrice(price: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(price)
}

watch(
  () => props.product.productId,
  () => {
    quantity.value = 1
    notes.value = ''
    takeaway.value = false
  },
)

function confirm(): void {
  emit('confirm', {
    product: props.product,
    quantity: quantity.value,
    notes: notes.value.trim(),
    takeaway: takeaway.value,
  })
}
</script>

<template>
  <div class="product-dialog-backdrop" @click.self="emit('cancel')">
    <section
      class="product-dialog"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="`add-product-title-${product.productId}`"
    >
      <header class="product-dialog-header">
        <div>
          <p class="eyebrow">CONFIRMAR PRODUCTO</p>
          <h2 :id="`add-product-title-${product.productId}`">{{ product.name }}</h2>
        </div>
        <button
          class="product-dialog-close"
          type="button"
          aria-label="Cerrar"
          @click="emit('cancel')"
        >
          ×
        </button>
      </header>

      <div class="product-dialog-quantity" aria-label="Cantidad">
        <button
          type="button"
          aria-label="Quitar una unidad"
          :disabled="quantity <= 1"
          @click="quantity -= 1"
        >
          −
        </button>
        <output aria-live="polite">{{ quantity }}</output>
        <button type="button" aria-label="Añadir una unidad" @click="quantity += 1">
          +
        </button>
      </div>

      <label class="product-dialog-notes">
        Nota para cocina (opcional)
        <textarea v-model="notes" maxlength="255" rows="2" placeholder="Ej. Sin cebolla..." />
      </label>

      <label class="product-dialog-takeaway">
        <input v-model="takeaway" type="checkbox" />
        <span class="product-dialog-switch" aria-hidden="true"></span>
        <span>
          <strong>Para llevar</strong>
          <small>Marcar este producto para la comanda de cocina</small>
        </span>
      </label>

      <footer class="product-dialog-actions">
        <button class="product-dialog-cancel" type="button" @click="emit('cancel')">
          Cancelar
        </button>
        <button class="product-dialog-add" type="button" @click="confirm">
          Agregar · {{ formatPrice(subtotal) }}
        </button>
      </footer>
    </section>
  </div>
</template>
