<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { LoginResponse } from '../../domain/auth/types'
import {
  calculateOrderAmounts,
  deliveryDetailsForMode,
} from '../../application/orders/orderCalculations'
import type {
  ActiveOrder,
  DeliveryDetails,
  OrderItem,
  PayOrderResult,
  PaymentMethod,
  PosTable,
  ProductCategory,
  Product,
  ServiceMode,
} from '../../domain/pos/types'
import type { PosGateway } from '../../application/ports/PosGateway'
import { serviceModeForTableName } from '../../domain/pos/serviceMode'
import ProductCatalog from './ProductCatalog.vue'
import ProductAddDialog from './ProductAddDialog.vue'

const props = defineProps<{
  table: PosTable
  mode: ServiceMode
  session: LoginResponse
  gateway: PosGateway
}>()

const emit = defineEmits<{ back: [] }>()

const categories = ref<ProductCategory[]>([])
const selectedProduct = ref<Product | null>(null)
const existingOrder = ref<ActiveOrder | null>(null)
const draftItems = ref<OrderItem[]>([])
const customerName = ref('')
const phone = ref('')
const address = ref('')
const deliveryFeeText = ref('0')
const loading = ref(true)
const submitting = ref(false)
const printing = ref(false)
const loadingMoveDestinations = ref(false)
const movingOrder = ref(false)
const payingOrder = ref(false)
const moveDialogOpen = ref(false)
const payDialogOpen = ref(false)
const paymentMethod = ref<PaymentMethod>('cash')
const cashReceivedText = ref('')
const paymentError = ref('')
const paymentResult = ref<PayOrderResult | null>(null)
const moveDestinations = ref<PosTable[]>([])
const selectedMoveDestinationId = ref('')
const moveError = ref('')
const errorMessage = ref('')
const notice = ref('')
const showOrder = ref(false)
const editingNoteProductId = ref<string | null>(null)
const savedNoteText = ref('')
const currentTime = ref(Date.now())
let orderClock: number | undefined
let unsubscribeOrderChanges: (() => void) | undefined

const isCustomerOrder = computed(() => props.mode !== 'DINE_IN')
const isDelivery = computed(() => props.mode === 'DELIVERY')
const modeLabel = computed(() => {
  if (props.mode === 'DELIVERY') return 'DOMICILIO'
  if (props.mode === 'TAKEAWAY') return 'PARA LLEVAR'
  return 'SALÓN'
})

const visibleItems = computed(() => [
  ...(existingOrder.value?.items ?? []).map((item, index) => ({
    ...item,
    saved: true,
    lineKey: item.lineId ?? `${item.productId}-saved-${index}`,
  })),
  ...draftItems.value.map((item, index) => ({
    ...item,
    saved: false,
    lineKey: `${item.productId}-${item.takeaway ? 'takeaway' : 'here'}-${index}`,
  })),
])

const deliveryDetails = computed<DeliveryDetails | null>(() =>
  deliveryDetailsForMode(
    props.mode,
    customerName.value,
    phone.value,
    address.value,
    Number(deliveryFeeText.value),
  ),
)

const amounts = computed(() =>
  calculateOrderAmounts(visibleItems.value, deliveryDetails.value),
)
const cashChange = computed(() => {
  const received = Number(cashReceivedText.value)
  return Number.isFinite(received)
    ? Math.max(0, received - amounts.value.customerTotal)
    : 0
})

function canEditSavedNote(item: OrderItem & { saved: boolean }): boolean {
  if (!item.saved || !item.createdAt) return !item.saved
  const addedAt = new Date(item.createdAt).getTime()
  const elapsed = currentTime.value - addedAt
  return Number.isFinite(addedAt) && elapsed >= 0 && elapsed <= 10 * 60 * 1000
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(amount)
}

function restoreCustomerDetails(order: ActiveOrder | null): void {
  if (!order?.delivery) {
    customerName.value = ''
    phone.value = ''
    address.value = ''
    deliveryFeeText.value = '0'
    return
  }
  customerName.value = order.delivery.customerName ?? ''
  phone.value = order.delivery.phone ?? ''
  address.value = order.delivery.address ?? ''
  deliveryFeeText.value = String(order.delivery.deliveryFee)
}

async function loadOrderScreen(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const [catalogCategories, activeOrder] = await Promise.all([
      props.gateway.getProductCategories(),
      props.gateway.getActiveOrder(props.table.id),
    ])
    categories.value = catalogCategories
    existingOrder.value = activeOrder
    restoreCustomerDetails(activeOrder)
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'No se pudo cargar el pedido.'
  } finally {
    loading.value = false
  }
}

function openProductConfirmation(product: Product): void {
  selectedProduct.value = product
}

function confirmProduct(selection: {
  product: Product
  quantity: number
  notes: string
  takeaway: boolean
}): void {
  notice.value = ''
  const existing = draftItems.value.find((item) =>
    item.productId === selection.product.productId &&
    item.notes === (selection.notes || undefined) &&
    Boolean(item.takeaway) === selection.takeaway,
  )
  if (existing) {
    existing.quantity += selection.quantity
  } else {
    draftItems.value.push({
      productId: selection.product.productId,
      productName: selection.product.name,
      price: selection.product.price,
      quantity: selection.quantity,
      notes: selection.notes || undefined,
      takeaway: selection.takeaway,
      taxes: selection.product.taxes,
    })
  }
  selectedProduct.value = null
}

function changeQuantity(productId: string, change: number): void {
  const item = draftItems.value.find((line) => line.productId === productId)
  if (!item) return
  item.quantity += change
  if (item.quantity <= 0) {
    draftItems.value = draftItems.value.filter((line) => line.productId !== productId)
  }
}

function changeNotes(productId: string, notes: string): void {
  const item = draftItems.value.find((line) => line.productId === productId)
  if (item) item.notes = notes
}

function removeDraftItem(productId: string): void {
  draftItems.value = draftItems.value.filter((item) => item.productId !== productId)
}

function beginNoteEdit(item: OrderItem): void {
  editingNoteProductId.value = item.productId
  savedNoteText.value = item.notes ?? ''
}

function cancelNoteEdit(): void {
  editingNoteProductId.value = null
  savedNoteText.value = ''
}

async function saveSavedNote(item: OrderItem): Promise<void> {
  if (!canEditSavedNote({ ...item, saved: true })) return
  submitting.value = true
  errorMessage.value = ''
  try {
    await props.gateway.updateOrderItemNotes(
      props.table.id,
      item.lineId ?? item.productId,
      savedNoteText.value,
    )
    const savedItem = existingOrder.value?.items.find(
      (line) => (line.lineId ?? line.productId) === (item.lineId ?? item.productId),
    )
    if (savedItem) savedItem.notes = savedNoteText.value.trim() || undefined
    notice.value = 'Nota actualizada.'
    cancelNoteEdit()
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'No se pudo actualizar la nota.'
  } finally {
    submitting.value = false
  }
}

async function removeItem(item: OrderItem & { saved: boolean }): Promise<void> {
  errorMessage.value = ''
  if (!item.saved) {
    removeDraftItem(item.productId)
    return
  }

  submitting.value = true
  try {
    await props.gateway.removeOrderItem(
      props.table.id,
      item.lineId ?? item.productId,
    )
    if (existingOrder.value) {
      existingOrder.value.items = existingOrder.value.items.filter(
        (line) => (line.lineId ?? line.productId) !== (item.lineId ?? item.productId),
      )
      if (existingOrder.value.items.length === 0) existingOrder.value = null
    }
    notice.value = 'Producto eliminado del pedido.'
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'No se pudo eliminar el producto.'
  } finally {
    submitting.value = false
  }
}

async function cancelActiveOrder(): Promise<void> {
  if (!existingOrder.value || !window.confirm(
    '¿Cancelar toda la orden? Se eliminarán el ticket abierto en UniCenta y su comanda de cocina. Esta acción no se puede deshacer.',
  )) {
    return
  }

  errorMessage.value = ''
  submitting.value = true
  try {
    await props.gateway.cancelOrder(props.table.id)
    existingOrder.value = null
    draftItems.value = []
    customerName.value = ''
    phone.value = ''
    address.value = ''
    deliveryFeeText.value = '0'
    notice.value = 'Orden cancelada y puesto liberado.'
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'No se pudo cancelar la orden.'
  } finally {
    submitting.value = false
  }
}

async function printKitchenOrder(): Promise<void> {
  if (!existingOrder.value || draftItems.value.length > 0 || printing.value) return

  printing.value = true
  errorMessage.value = ''
  try {
    await props.gateway.printKitchenOrder({ tableId: props.table.id })
    notice.value = 'Comanda enviada a la impresora.'
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'No se pudo imprimir la comanda.'
  } finally {
    printing.value = false
  }
}

async function openMoveDialog(): Promise<void> {
  if (!existingOrder.value || draftItems.value.length > 0 || movingOrder.value) return

  moveDialogOpen.value = true
  loadingMoveDestinations.value = true
  selectedMoveDestinationId.value = ''
  moveError.value = ''
  try {
    const allTables = await props.gateway.getTables()
    moveDestinations.value = allTables.filter((candidate) =>
      candidate.id !== props.table.id &&
      candidate.ticketId === null &&
      serviceModeForTableName(candidate.name) === props.mode,
    )
  } catch (error) {
    moveError.value =
      error instanceof Error ? error.message : 'No se pudieron cargar los puestos disponibles.'
  } finally {
    loadingMoveDestinations.value = false
  }
}

async function confirmMoveOrder(): Promise<void> {
  if (!existingOrder.value || !selectedMoveDestinationId.value || movingOrder.value) return
  const destination = moveDestinations.value.find(
    (candidate) => candidate.id === selectedMoveDestinationId.value,
  )
  if (!destination) {
    moveError.value = 'Selecciona un puesto disponible.'
    return
  }

  movingOrder.value = true
  moveError.value = ''
  try {
    await props.gateway.moveOrder({
      currentTableId: props.table.id,
      newTableId: destination.id,
    })
    moveDialogOpen.value = false
    notice.value = `Orden movida a ${destination.name}.`
    emit('back')
  } catch (error) {
    moveError.value =
      error instanceof Error ? error.message : 'No se pudo mover la orden.'
  } finally {
    movingOrder.value = false
  }
}

function openPayDialog(): void {
  if (!existingOrder.value || draftItems.value.length > 0 || payingOrder.value) return
  paymentMethod.value = 'cash'
  cashReceivedText.value = String(Math.ceil(amounts.value.customerTotal))
  paymentError.value = ''
  payDialogOpen.value = true
}

async function confirmPayment(): Promise<void> {
  if (!existingOrder.value || draftItems.value.length > 0 || payingOrder.value) return

  const amountReceived = paymentMethod.value === 'bank'
    ? amounts.value.customerTotal
    : Number(cashReceivedText.value)
  if (
    !Number.isSafeInteger(amountReceived) ||
    amountReceived < amounts.value.customerTotal
  ) {
    paymentError.value = 'El efectivo recibido debe cubrir el total del cliente.'
    return
  }

  payingOrder.value = true
  paymentError.value = ''
  try {
    paymentResult.value = await props.gateway.payOrder(props.table.id, {
      paymentMethod: paymentMethod.value,
      amountReceived,
    })
    existingOrder.value = null
    draftItems.value = []
    payDialogOpen.value = false
  } catch (error) {
    paymentError.value =
      error instanceof Error ? error.message : 'No se pudo registrar el pago.'
  } finally {
    payingOrder.value = false
  }
}

function finishPayment(): void {
  paymentResult.value = null
  emit('back')
}

function updateDeliveryFee(event: Event): void {
  const input = event.currentTarget
  if (input instanceof HTMLInputElement) {
    deliveryFeeText.value = input.value
  }
}

function validateOrder(): string | null {
  if (draftItems.value.length === 0) return 'Agrega al menos un producto nuevo.'
  if (!isCustomerOrder.value) return null
  if (isDelivery.value && !address.value.trim()) return 'Escribe la dirección de entrega.'

  const fee = Number(deliveryFeeText.value)
  if (
    deliveryFeeText.value.trim() === '' ||
    !Number.isFinite(fee) ||
    fee < 0
  ) {
    return 'La tarifa de domicilio debe ser un valor válido igual o mayor que cero.'
  }
  return null
}
async function submitOrder(): Promise<void> {
  if (submitting.value) return
  errorMessage.value = ''
  notice.value = ''

  const validationError = validateOrder()
  if (validationError) {
    errorMessage.value = validationError
    return
  }

  submitting.value = true
  try {
    const sentAt = new Date().toISOString()
    const sentItems = draftItems.value.map((item) => ({
      ...item,
      createdAt: sentAt,
    }))
    await props.gateway.sendOrder({
      requestId: crypto.randomUUID(),
      tableId: props.table.id,
      waiterName: props.session.user.name,
      waiterId: props.session.user.id,
      createdAt: sentAt,
      items: sentItems,
      delivery: deliveryDetails.value,
    })

    draftItems.value = []
    const sentOrderItems = [
      ...(existingOrder.value?.items ?? []),
      ...sentItems,
    ]
    existingOrder.value = {
      orderId: existingOrder.value?.orderId ?? null,
      tableId: props.table.id,
      waiterName: props.session.user.name,
      waiterId: props.session.user.id,
      createdAt: existingOrder.value?.createdAt ?? sentAt,
      items: sentOrderItems,
      delivery: deliveryDetails.value,
    }
    notice.value = 'Comanda enviada a cocina.'
    try {
      const refreshedOrder = await props.gateway.getActiveOrder(props.table.id)
      if (refreshedOrder) existingOrder.value = refreshedOrder
    } catch (refreshError) {
      const detail = refreshError instanceof Error
        ? refreshError.message
        : 'error desconocido'
      errorMessage.value = `La comanda se envió, pero no se pudo actualizar el pedido: ${detail}`
    }
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'No se pudo enviar la comanda.'
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  void loadOrderScreen()
  unsubscribeOrderChanges = props.gateway.onOrderChanged((event) => {
    if (event.tableId !== props.table.id || submitting.value) return
    void props.gateway.getActiveOrder(props.table.id).then((order) => {
      existingOrder.value = order
      restoreCustomerDetails(order)
    }).catch((error: unknown) => {
      errorMessage.value =
        error instanceof Error ? error.message : 'No se pudo actualizar el pedido.'
    })
  })
  orderClock = window.setInterval(() => {
    currentTime.value = Date.now()
  }, 10_000)
})

onUnmounted(() => {
  if (orderClock !== undefined) window.clearInterval(orderClock)
  unsubscribeOrderChanges?.()
})
</script>

<template>
  <main class="workspace-page order-page">
    <header class="workspace-header">
      <div class="page-title">
        <span class="page-title-icon" aria-hidden="true">◉</span>
        <div>
          <p class="eyebrow">{{ modeLabel }}</p>
          <h1>{{ table.name }}</h1>
        </div>
      </div>
      <button class="outline-button" type="button" @click="$emit('back')">← Puestos</button>
    </header>

    <div v-if="loading" class="state-card" role="status">Cargando menú y pedido…</div>
    <div v-else-if="errorMessage && categories.length === 0" class="state-card state-card-error" role="alert">
      <p>{{ errorMessage }}</p>
      <button class="outline-button" type="button" @click="loadOrderScreen">Volver a intentar</button>
    </div>

    <section v-else class="order-layout" :class="{ 'order-is-open': showOrder }">
      <div class="catalog-column">
        <ProductCatalog
          :categories="categories"
          @select-product="openProductConfirmation"
        />

        <button
          class="login-button order-toggle-button"
          type="button"
          :aria-expanded="showOrder"
          @click="showOrder = !showOrder"
        >
          {{ showOrder ? 'Ocultar pedido' : `Ver pedido (${visibleItems.length})` }}
          <span aria-hidden="true">{{ showOrder ? '−' : '＋' }}</span>
        </button>
      </div>

      <Transition name="order-drawer">
      <aside
        v-if="showOrder"
        class="order-panel"
        role="region"
        aria-labelledby="current-order-title"
      >
        <div class="section-heading order-panel-heading">
          <div>
            <p class="eyebrow">COMANDA</p>
            <h2 id="current-order-title">Pedido actual</h2>
          </div>
          <span class="item-count">{{ visibleItems.length }} líneas</span>
          <button
            class="order-panel-close"
            type="button"
            aria-label="Cerrar pedido"
            @click="showOrder = false"
          >
            ×
          </button>
        </div>

        <div v-if="existingOrder?.items.length" class="saved-order-note">
          Incluye artículos ya enviados. Los nuevos se agregarán como otra ronda.
        </div>

        <div class="order-items">
          <div v-if="!visibleItems.length" class="empty-cart">
            <span aria-hidden="true">＋</span>
            <p>Aún no hay productos.<br />Elige algo del catálogo.</p>
          </div>
          <article
            v-for="item in visibleItems"
            :key="item.lineKey"
            class="order-line"
          >
            <div class="order-line-top">
              <div>
                <strong>{{ item.productName }}</strong>
                <span v-if="item.saved" class="sent-tag">ENVIADO</span>
                <span v-if="item.takeaway" class="takeaway-tag">PARA LLEVAR</span>
              </div>
              <strong>{{ formatCurrency(item.price * item.quantity) }}</strong>
            </div>
            <div class="order-line-bottom">
              <div v-if="!item.saved" class="quantity-control">
                <button type="button" :aria-label="`Quitar una unidad de ${item.productName}`" @click="changeQuantity(item.productId, -1)">−</button>
                <span>{{ item.quantity }}</span>
                <button type="button" :aria-label="`Añadir una unidad de ${item.productName}`" @click="changeQuantity(item.productId, 1)">+</button>
              </div>
              <span v-else class="saved-quantity">Cantidad: {{ item.quantity }}</span>
              <button
                class="remove-order-item"
                type="button"
                :disabled="submitting"
                :aria-label="`Eliminar ${item.productName} del pedido`"
                @click="removeItem(item)"
              >
                Eliminar
              </button>
            </div>
            <div v-if="editingNoteProductId === item.productId" class="note-editor">
              <input
                v-model="savedNoteText"
                class="notes-input"
                maxlength="255"
                :aria-label="`Nota para ${item.productName}`"
                placeholder="Nota cocina"
              />
              <button type="button" :disabled="submitting" @click="saveSavedNote(item)">Guardar</button>
              <button type="button" @click="cancelNoteEdit">Cancelar</button>
            </div>
            <div v-else-if="!item.saved" class="note-editor">
              <input
                class="notes-input"
                maxlength="255"
                :value="item.notes ?? ''"
                :aria-label="`Nota para ${item.productName}`"
                placeholder="Nota cocina"
                @input="changeNotes(item.productId, ($event.target as HTMLInputElement).value)"
              />
            </div>
            <div v-else class="note-editor saved-note">
              <span>{{ item.notes || 'Sin nota' }}</span>
              <button
                v-if="canEditSavedNote(item)"
                type="button"
                @click="beginNoteEdit(item)"
              >
                Editar nota
              </button>
              <span v-else class="note-deadline">
                {{ item.createdAt ? 'Plazo de edición vencido' : 'Edición no disponible' }}
              </span>
            </div>
          </article>
        </div>

        <div v-if="isCustomerOrder" class="customer-fields">
          <div class="section-heading compact-heading">
            <div>
              <p class="eyebrow">DATOS DEL CLIENTE</p>
              <h3>{{ isDelivery ? 'Entrega a domicilio' : 'Pedido para llevar' }}</h3>
            </div>
          </div>
          <label>
            Nombre (opcional)
            <input v-model="customerName" autocomplete="name" placeholder="Nombre del cliente" />
          </label>
          <label>
            Teléfono (opcional)
            <input v-model="phone" type="tel" autocomplete="tel" placeholder="Número de contacto" />
          </label>
          <label v-if="isDelivery">
            Dirección
            <input v-model="address" autocomplete="street-address" placeholder="Dirección de entrega" />
          </label>
          <label v-if="isDelivery">
            Tarifa de domicilio
            <input
              :value="deliveryFeeText"
              type="number"
              min="0"
              step="1"
              inputmode="decimal"
              @input="updateDeliveryFee"
            />
          </label>
        </div>

        <p v-if="notice" class="success-message" role="status">{{ notice }}</p>
        <p v-if="errorMessage" class="form-error order-error" role="alert">{{ errorMessage }}</p>

        <div class="order-totals">
          <div><span>Productos · UniCenta</span><strong>{{ formatCurrency(amounts.productsSubtotal) }}</strong></div>
          <div v-if="isDelivery"><span>Domicilio · AdriPOS</span><strong>{{ formatCurrency(amounts.deliveryFee) }}</strong></div>
          <div class="customer-total"><span>Total cliente</span><strong>{{ formatCurrency(amounts.customerTotal) }}</strong></div>
          <p v-if="isDelivery" class="fee-explanation">
            La tarifa se guarda como dato de domicilio y no se añade al ticket de productos de UniCenta.
          </p>
        </div>

        <button
          class="login-button send-order-button"
          type="button"
          :disabled="submitting || draftItems.length === 0"
          @click="submitOrder"
        >
          {{ submitting ? 'Enviando…' : 'Enviar comanda a cocina' }}
          <span v-if="submitting" class="button-spinner" aria-hidden="true"></span>
          <span v-else aria-hidden="true">→</span>
        </button>
        <p v-if="existingOrder && draftItems.length > 0" class="print-order-hint">
          Envía primero los productos nuevos para imprimir la comanda completa.
        </p>
        <button
          v-if="existingOrder"
          class="login-button pay-order-button"
          type="button"
          :disabled="submitting || printing || movingOrder || payingOrder || draftItems.length > 0"
          @click="openPayDialog"
        >
          Cobrar y cerrar venta
        </button>
        <p v-if="existingOrder && draftItems.length > 0" class="print-order-hint">
          Envía primero los productos nuevos antes de cobrar.
        </p>
        <button
          v-if="existingOrder"
          class="outline-button print-order-button"
          type="button"
          :disabled="submitting || printing || payingOrder || draftItems.length > 0"
          @click="printKitchenOrder"
        >
          {{ printing ? 'Enviando a impresora…' : 'Imprimir comanda' }}
        </button>
        <p v-if="existingOrder && draftItems.length > 0" class="print-order-hint">
          Envía primero los productos nuevos antes de mover el pedido.
        </p>
        <button
          v-if="existingOrder"
          class="outline-button print-order-button move-order-button"
          type="button"
          :disabled="submitting || printing || movingOrder || payingOrder || draftItems.length > 0"
          @click="openMoveDialog"
        >
          Mover a otro puesto
        </button>
        <button
          v-if="existingOrder"
          class="cancel-order-button"
          type="button"
          :disabled="submitting || payingOrder"
          @click="cancelActiveOrder"
        >
          Cancelar y eliminar toda la orden
        </button>
      </aside>
      </Transition>
    </section>
    <ProductAddDialog
      v-if="selectedProduct"
      :product="selectedProduct"
      @confirm="confirmProduct"
      @cancel="selectedProduct = null"
    />
    <div
      v-if="moveDialogOpen"
      class="product-dialog-backdrop"
      @click.self="moveDialogOpen = false"
    >
      <section
        class="product-dialog move-order-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="move-order-title"
      >
        <header class="product-dialog-header">
          <div>
            <p class="eyebrow">TRASLADAR COMANDA</p>
            <h2 id="move-order-title">Mover desde {{ table.name }}</h2>
          </div>
          <button
            class="product-dialog-close"
            type="button"
            aria-label="Cerrar"
            :disabled="movingOrder"
            @click="moveDialogOpen = false"
          >
            ×
          </button>
        </header>

        <p class="move-order-description">
          Solo aparecen puestos libres del mismo tipo. Si el destino se ocupa antes de confirmar,
          el servidor rechazará el traslado y conservará la orden en su origen.
        </p>

        <div v-if="loadingMoveDestinations" class="state-card" role="status">
          Cargando puestos disponibles…
        </div>
        <div v-else-if="moveDestinations.length" class="move-destination-list">
          <label
            v-for="destination in moveDestinations"
            :key="destination.id"
            class="move-destination-option"
            :class="{ 'is-selected': selectedMoveDestinationId === destination.id }"
          >
            <input
              v-model="selectedMoveDestinationId"
              type="radio"
              name="move-destination"
              :value="destination.id"
            />
            <span>{{ destination.name }}</span>
            <small>LIBRE</small>
          </label>
        </div>
        <div v-else-if="!moveError" class="state-card">
          No hay puestos libres compatibles para mover esta orden.
        </div>

        <p v-if="moveError" class="form-error" role="alert">{{ moveError }}</p>
        <footer class="product-dialog-actions">
          <button
            class="product-dialog-cancel"
            type="button"
            :disabled="movingOrder"
            @click="moveDialogOpen = false"
          >
            Cancelar
          </button>
          <button
            class="product-dialog-add confirm-move-order-button"
            type="button"
            :disabled="loadingMoveDestinations || movingOrder || !selectedMoveDestinationId"
            @click="confirmMoveOrder"
          >
            {{ movingOrder ? 'Moviendo…' : 'Confirmar traslado' }}
          </button>
        </footer>
      </section>
    </div>
    <div
      v-if="payDialogOpen"
      class="product-dialog-backdrop"
      @click.self="!payingOrder && (payDialogOpen = false)"
    >
      <section
        class="product-dialog payment-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-dialog-title"
      >
        <header class="product-dialog-header">
          <div>
            <p class="eyebrow">REGISTRAR PAGO</p>
            <h2 id="payment-dialog-title">{{ table.name }}</h2>
          </div>
          <button
            class="product-dialog-close"
            type="button"
            aria-label="Cerrar"
            :disabled="payingOrder"
            @click="payDialogOpen = false"
          >
            ×
          </button>
        </header>

        <div class="payment-summary">
          <div><span>Productos que quedarán en UniCenta</span><strong>{{ formatCurrency(amounts.productsSubtotal) }}</strong></div>
          <div v-if="isDelivery"><span>Domicilio registrado en AdriPOS</span><strong>{{ formatCurrency(amounts.deliveryFee) }}</strong></div>
          <div class="customer-total"><span>Total recibido del cliente</span><strong>{{ formatCurrency(amounts.customerTotal) }}</strong></div>
        </div>
        <p v-if="isDelivery" class="fee-explanation">
          La tarifa se conserva como dato de AdriPOS y no se suma al ticket ni al pago de UniCenta.
        </p>

        <fieldset class="payment-methods">
          <legend>Método de pago</legend>
          <label class="payment-method-option">
            <input v-model="paymentMethod" type="radio" name="payment-method" value="cash" />
            <span>Efectivo</span>
            <small>UniCenta: cash</small>
          </label>
          <label class="payment-method-option">
            <input v-model="paymentMethod" type="radio" name="payment-method" value="bank" />
            <span>Nequi</span>
            <small>UniCenta: bank</small>
          </label>
        </fieldset>

        <label v-if="paymentMethod === 'cash'" class="cash-received-field">
          Efectivo recibido
          <input
            v-model="cashReceivedText"
            type="number"
            min="0"
            step="1"
            inputmode="numeric"
            aria-label="Efectivo recibido"
          />
        </label>
        <p v-if="paymentMethod === 'cash'" class="payment-change">
          Vueltas: <strong>{{ formatCurrency(cashChange) }}</strong>
        </p>
        <p v-else class="payment-nequi-hint">
          Registra el pago de Nequi después de verificar que llegó el valor exacto.
        </p>

        <p v-if="paymentError" class="form-error" role="alert">{{ paymentError }}</p>
        <footer class="product-dialog-actions">
          <button
            class="product-dialog-cancel"
            type="button"
            :disabled="payingOrder"
            @click="payDialogOpen = false"
          >
            Cancelar
          </button>
          <button
            class="product-dialog-add"
            type="button"
            :disabled="payingOrder || !Number.isSafeInteger(Number(cashReceivedText)) && paymentMethod === 'cash'"
            @click="confirmPayment"
          >
            {{ payingOrder ? 'Registrando venta…' : 'Confirmar pago' }}
          </button>
        </footer>
      </section>
    </div>
    <div
      v-if="paymentResult"
      class="product-dialog-backdrop"
    >
      <section
        class="product-dialog payment-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-result-title"
      >
        <p class="eyebrow">VENTA CERRADA</p>
        <h2 id="payment-result-title">Registrada en UniCenta</h2>
        <div class="payment-summary">
          <div><span>Ticket UniCenta</span><strong>{{ paymentResult.ticketCode }}</strong></div>
          <div><span>Productos en UniCenta</span><strong>{{ formatCurrency(paymentResult.productSubtotal) }}</strong></div>
          <div v-if="paymentResult.deliveryFee > 0"><span>Domicilio en AdriPOS</span><strong>{{ formatCurrency(paymentResult.deliveryFee) }}</strong></div>
          <div><span>Total recibido</span><strong>{{ formatCurrency(paymentResult.customerTotal) }}</strong></div>
          <div><span>Vueltas</span><strong>{{ formatCurrency(paymentResult.change) }}</strong></div>
        </div>
        <p class="success-message" role="status">
          Pago registrado como {{ paymentResult.paymentMethod === 'bank' ? 'Nequi' : 'Efectivo' }}.
        </p>
        <footer class="product-dialog-actions">
          <button class="product-dialog-add" type="button" @click="finishPayment">
            Volver a Gestión de mesas
          </button>
        </footer>
      </section>
    </div>
  </main>
</template>
