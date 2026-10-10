<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { serviceModeForTableName } from '../../domain/pos/serviceMode'
import type { PosTable, ServiceMode } from '../../domain/pos/types'
import type { PosGateway } from '../../application/ports/PosGateway'

type TableSection = 'TABLES' | 'DELIVERY'

const props = defineProps<{
  initialMode: TableSection
  gateway: PosGateway
}>()

const emit = defineEmits<{
  back: []
  select: [table: PosTable, mode: ServiceMode]
}>()

const tables = ref<PosTable[]>([])
const selectedMode = ref<TableSection>(props.initialMode)
const loading = ref(true)
const errorMessage = ref('')
let unsubscribeOrderChanges: (() => void) | undefined

const visibleTables = computed(() => {
  return tables.value.filter((table) => {
    const tableMode = serviceModeForTableName(table.name)
    return selectedMode.value === 'DELIVERY'
      ? tableMode === 'DELIVERY'
      : tableMode !== 'DELIVERY'
  })
})

const occupiedCount = computed(
  () => visibleTables.value.filter((table) => table.ticketId !== null).length,
)

async function loadTables(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    tables.value = await props.gateway.getTables()
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'No se pudieron cargar las mesas.'
  } finally {
    loading.value = false
  }
}

function chooseMode(mode: TableSection): void {
  selectedMode.value = mode
}

function selectTable(table: PosTable): void {
  const mode: ServiceMode =
    selectedMode.value === 'DELIVERY'
      ? 'DELIVERY'
      : serviceModeForTableName(table.name)
  emit('select', table, mode)
}

onMounted(() => {
  unsubscribeOrderChanges = props.gateway.onOrderChanged(() => {
    void loadTables()
  })
  props.gateway.connectRealtime()
  void loadTables()
})

onUnmounted(() => {
  unsubscribeOrderChanges?.()
})
</script>

<template>
  <main class="workspace-page">
    <header class="workspace-header">
      <div class="page-title">
        <span class="page-title-icon" aria-hidden="true">◉</span>
        <h1>Gestión de mesas</h1>
      </div>
      <button class="outline-button" type="button" @click="$emit('back')">← Menú</button>
    </header>

    <section class="tables-content">
      <div class="table-mode-tabs" role="tablist" aria-label="Canal del pedido">
        <button
          class="table-mode-tab"
          :class="{ 'is-active': selectedMode === 'TABLES' }"
          role="tab"
          :aria-selected="selectedMode === 'TABLES'"
          type="button"
          @click="chooseMode('TABLES')"
        >
          <span aria-hidden="true">♧</span> Mesas y para llevar
        </button>
        <button
          class="delivery-mode-tab"
          :class="{ 'is-active': selectedMode === 'DELIVERY' }"
          role="tab"
          :aria-selected="selectedMode === 'DELIVERY'"
          type="button"
          @click="chooseMode('DELIVERY')"
        >
          <span aria-hidden="true">➜</span> Domicilios
        </button>
      </div>

      <div class="table-summary">
        <div>
          <p class="eyebrow">{{ selectedMode === 'TABLES' ? 'SALÓN Y RECOGIDA EN LOCAL' : 'ENTREGA A DOMICILIO' }}</p>
          <h2>{{ selectedMode === 'TABLES' ? 'Selecciona una mesa o puesto para llevar' : 'Selecciona un puesto para el domicilio' }}</h2>
        </div>
        <p class="occupancy-summary">
          <span class="occupancy-dot"></span>
          {{ occupiedCount }} ocupada{{ occupiedCount === 1 ? '' : 's' }}
          <span class="summary-divider">/</span>
          {{ visibleTables.length }} total
        </p>
      </div>

      <div v-if="loading" class="state-card" role="status">Cargando puestos…</div>
      <div v-else-if="errorMessage" class="state-card state-card-error" role="alert">
        <p>{{ errorMessage }}</p>
        <button class="outline-button" type="button" @click="loadTables">Volver a intentar</button>
      </div>
      <div v-else-if="visibleTables.length === 0" class="state-card">
        No hay puestos configurados para esta opción en UniCenta.
      </div>

      <div v-else class="table-grid">
        <button
          v-for="table in visibleTables"
          :key="table.id"
          class="table-card"
          :class="{ 'is-occupied': table.ticketId !== null }"
          type="button"
          @click="selectTable(table)"
        >
          <span class="table-card-name">{{ table.name }}</span>
          <span class="table-card-status">
            {{ table.ticketId !== null ? 'OCUPADA' : 'LIBRE' }}
          </span>
        </button>
      </div>
    </section>
  </main>
</template>
