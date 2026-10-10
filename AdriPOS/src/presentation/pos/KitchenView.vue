<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { KitchenItemUpdate, KitchenTicket } from '../../domain/pos/types'
import type { PosGateway } from '../../application/ports/PosGateway'

const emit = defineEmits<{ back: [] }>()
const props = defineProps<{ gateway: PosGateway }>()

const stations = ['PIZZAS', 'PIZZAS_GRANDES', 'PLANCHA'] as const
type Station = typeof stations[number]

const stationLabels: Record<Station, string> = {
  PIZZAS: 'Pizzas',
  PIZZAS_GRANDES: 'Pizzas grandes',
  PLANCHA: 'Plancha',
}

const selectedStation = ref<Station>('PIZZAS')
const tickets = ref<KitchenTicket[]>([])
const currentTime = ref(Date.now())
const loading = ref(false)
const errorMessage = ref('')
const updatingItem = ref('')
let unsubscribeKitchenUpdates: (() => void) | undefined
let unsubscribeOrderChanges: (() => void) | undefined
let elapsedTimer: number | undefined

function formatElapsedTime(createdAt: string): string {
  const startTime = new Date(createdAt).getTime()
  if (!Number.isFinite(startTime)) return 'Tiempo no disponible'

  const elapsedMinutes = Math.floor(Math.max(0, currentTime.value - startTime) / 60_000)
  if (elapsedMinutes === 0) return 'Menos de 1 min'

  const hours = Math.floor(elapsedMinutes / 60)
  const minutes = elapsedMinutes % 60
  return hours > 0
    ? `${hours} h ${String(minutes).padStart(2, '0')} min`
    : `${elapsedMinutes} min`
}

async function loadTickets(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    tickets.value = await props.gateway.getKitchenTickets(selectedStation.value)
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'No se pudo cargar cocina.'
  } finally {
    loading.value = false
  }
}

async function markItem(ticketId: string, itemId: string): Promise<void> {
  updatingItem.value = itemId
  errorMessage.value = ''
  try {
    await props.gateway.setKitchenItemStatus(ticketId, itemId, 'READY')
    await loadTickets()
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'No se pudo actualizar el producto.'
  } finally {
    updatingItem.value = ''
  }
}

function handleItemUpdate(_event: KitchenItemUpdate): void {
  void loadTickets()
}

onMounted(() => {
  elapsedTimer = window.setInterval(() => {
    currentTime.value = Date.now()
  }, 30_000)
  unsubscribeKitchenUpdates = props.gateway.onKitchenItemUpdated(handleItemUpdate)
  unsubscribeOrderChanges = props.gateway.onOrderChanged(() => {
    void loadTickets()
  })
  props.gateway.connectRealtime()
  void loadTickets()
})

onUnmounted(() => {
  if (elapsedTimer !== undefined) window.clearInterval(elapsedTimer)
  unsubscribeKitchenUpdates?.()
  unsubscribeOrderChanges?.()
})
</script>

<template>
  <main class="workspace-page kitchen-page">
    <header class="workspace-header">
      <div class="page-title">
        <span class="page-title-icon" aria-hidden="true">◈</span>
        <div>
          <p class="eyebrow">PANTALLA DE PRODUCCIÓN</p>
          <h1>Cocina</h1>
        </div>
      </div>
      <button class="outline-button" type="button" @click="$emit('back')">← Menú</button>
    </header>

    <section class="kitchen-content">
      <div class="kitchen-toolbar">
        <div>
          <p class="eyebrow">ESTACIÓN ACTIVA</p>
          <h2>{{ stationLabels[selectedStation] }}</h2>
        </div>
        <div class="station-tabs" role="tablist" aria-label="Estaciones de cocina">
          <button
            v-for="station in stations"
            :key="station"
            type="button"
            role="tab"
            :aria-selected="selectedStation === station"
            :class="{ 'is-active': selectedStation === station }"
            @click="selectedStation = station; loadTickets()"
          >
            {{ stationLabels[station] }}
          </button>
        </div>
      </div>

      <p v-if="errorMessage" class="form-error" role="alert">{{ errorMessage }}</p>
      <div v-if="loading && !tickets.length" class="state-card" role="status">Cargando comandas…</div>
      <div v-else-if="!tickets.length" class="state-card kitchen-empty">
        <span aria-hidden="true">✓</span>
        <strong>Todo al día</strong>
        <p>No hay productos pendientes en esta estación.</p>
      </div>

      <div v-else class="kitchen-grid">
        <article v-for="ticket in tickets" :key="ticket.ticketId" class="kitchen-ticket">
          <header class="ticket-header">
            <div>
              <p class="eyebrow">MESA / PUESTO</p>
              <h3>{{ ticket.tableName }}</h3>
            </div>
            <span class="ticket-time">
              {{ new Date(ticket.createdAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) }}
            </span>
          </header>
          <p class="ticket-waiter">Atiende {{ ticket.waiterName }}</p>
          <p class="ticket-elapsed">Tiempo en cocina: {{ formatElapsedTime(ticket.createdAt) }}</p>
          <div class="ticket-items">
            <div v-for="item in ticket.items" :key="item.itemId" class="kitchen-item">
              <div class="kitchen-item-quantity">{{ item.quantity }}×</div>
              <div class="kitchen-item-info">
                <strong>{{ item.name }}</strong>
                <p v-if="item.notes">{{ item.notes }}</p>
                <span
                  class="kitchen-item-status"
                  :class="{ 'is-ready': item.status === 'READY' }"
                >
                  {{ item.status === 'READY' ? 'LISTO' : 'PENDIENTE' }}
                </span>
              </div>
              <button
                class="ready-button"
                type="button"
                :disabled="item.status === 'READY' || updatingItem === item.itemId"
                @click="markItem(ticket.ticketId, item.itemId)"
              >
                {{ item.status === 'READY' ? 'Listo' : 'Marcar listo' }}
              </button>
            </div>
          </div>
        </article>
      </div>
    </section>
  </main>
</template>
