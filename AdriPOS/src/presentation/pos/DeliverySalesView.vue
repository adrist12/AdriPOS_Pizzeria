<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { AccountingGateway } from '../../application/ports/PosGateway'
import type { AccountingDeliverySalesSummary } from '../../domain/accounting/types'

const props = defineProps<{ gateway: AccountingGateway }>()
const emit = defineEmits<{
  back: []
  signOut: []
}>()

const now = new Date()
const month = ref(now.getMonth() + 1)
const year = ref(now.getFullYear())
const summary = ref<AccountingDeliverySalesSummary | null>(null)
const loading = ref(false)
const errorMessage = ref('')

const monthOptions = computed(() => Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  label: new Intl.DateTimeFormat('es-CO', { month: 'long' })
    .format(new Date(2024, index, 1)),
})))
const yearOptions = computed(() => Array.from({ length: 7 }, (_, index) => now.getFullYear() - 3 + index))

onMounted(loadReport)

async function loadReport(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    summary.value = await props.gateway.getAccountingDeliverySalesSummary(month.value, year.value)
  } catch (error) {
    summary.value = null
    errorMessage.value = error instanceof Error
      ? error.message
      : 'No se pudo consultar el conteo de domicilios.'
  } finally {
    loading.value = false
  }
}

function formatPeriod(period: string): string {
  if (/^\d{4}-\d{2}$/.test(period)) {
    const [periodYear, periodMonth] = period.split('-').map(Number)
    return `${monthOptions.value[periodMonth - 1]?.label ?? ''} ${periodYear}`
  }
  return period
}
</script>

<template>
  <main class="delivery-page">
    <header class="delivery-header">
      <div class="delivery-brand" aria-label="AdriPOS"><span>a</span>adri<strong>pos</strong></div>
      <span class="delivery-spacer"></span>
      <button class="delivery-secondary" type="button" @click="emit('back')">Volver</button>
      <button class="delivery-secondary" type="button" @click="emit('signOut')">Cerrar sesión</button>
    </header>

    <section class="delivery-content">
      <div class="delivery-toolbar">
        <div>
          <p class="delivery-eyebrow">INFORME PRIVADO</p>
          <h1>Ventas de domicilio</h1>
          <p>Conteo de recibos pagados agrupados por puesto de domicilio.</p>
        </div>
        <form class="delivery-period" @submit.prevent="loadReport">
          <label>
            <span>Mes</span>
            <select v-model.number="month" aria-label="Mes">
              <option v-for="option in monthOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>
          <label>
            <span>Año</span>
            <select v-model.number="year" aria-label="Año">
              <option v-for="option in yearOptions" :key="option" :value="option">{{ option }}</option>
            </select>
          </label>
          <button type="submit" :disabled="loading">{{ loading ? 'Consultando…' : 'Consultar' }}</button>
        </form>
      </div>

      <p v-if="errorMessage" class="delivery-alert" role="alert">
        No se pudo consultar el reporte: {{ errorMessage }}
      </p>

      <div v-if="loading && !summary" class="delivery-loading" role="status">Cargando ventas de domicilio…</div>
      <template v-else-if="summary">
        <section class="delivery-total" aria-label="Total de ventas de domicilio">
          <span class="delivery-home-icon" aria-hidden="true">⌂</span>
          <div>
            <p>VENTAS DEL PERIODO</p>
            <strong>{{ summary.totalSales }}</strong>
            <span>{{ summary.totalSales === 1 ? 'venta' : 'ventas' }} · {{ formatPeriod(summary.period) }}</span>
          </div>
        </section>

        <section class="delivery-table-panel">
          <header>
            <div><h2>Ventas por puesto</h2><p>Detalle por cada mesa configurada para domicilios.</p></div>
            <span>{{ summary.byTable.length }} {{ summary.byTable.length === 1 ? 'puesto' : 'puestos' }}</span>
          </header>
          <ul v-if="summary.byTable.length" class="delivery-table-list">
            <li v-for="table in summary.byTable" :key="table.tableName">
              <span class="table-name"><span aria-hidden="true">⌂</span>{{ table.tableName }}</span>
              <strong>{{ table.sales }} {{ table.sales === 1 ? 'venta' : 'ventas' }}</strong>
            </li>
          </ul>
          <p v-else class="delivery-empty">No hay ventas de domicilio registradas en este periodo.</p>
        </section>
      </template>
    </section>
  </main>
</template>

<style scoped>
.delivery-page { min-height: 100dvh; padding: 0 1rem 3rem; color: #202b25; background: #f5f7f5; }
.delivery-header {
  display: flex; align-items: center; gap: .65rem; min-height: 76px;
  width: min(100%, 1080px); margin: 0 auto; border-bottom: 1px solid #e5eae6;
}
.delivery-brand { display: flex; align-items: center; color: #202b25; font-size: 1.2rem; font-weight: 800; }
.delivery-brand > span {
  display: grid; width: 1.8rem; height: 1.8rem; margin-right: .45rem; place-items: center;
  border-radius: .55rem; color: white; background: #277653; font-style: italic;
}
.delivery-brand strong { color: #277653; }
.delivery-spacer { flex: 1; }
.delivery-secondary, .delivery-period button {
  min-height: 42px; border: 1px solid #dfe7e1; border-radius: .6rem;
  padding: .55rem .85rem; color: #435148; background: white; font: inherit; font-weight: 650; cursor: pointer;
}
.delivery-content { width: min(100%, 960px); margin: 2.3rem auto 0; }
.delivery-toolbar { display: flex; align-items: end; justify-content: space-between; gap: 1.25rem; margin-bottom: 1.4rem; }
.delivery-eyebrow { margin: 0 0 .55rem; color: #277653; font-size: .7rem; font-weight: 800; letter-spacing: .12em; }
.delivery-toolbar h1 { margin: 0; color: #1f2d24; font-size: clamp(1.5rem, 4vw, 2rem); letter-spacing: -.04em; }
.delivery-toolbar p:last-child { margin: .45rem 0 0; color: #78837b; font-size: .86rem; }
.delivery-period { display: flex; align-items: end; gap: .55rem; }
.delivery-period label { display: grid; gap: .35rem; color: #69766d; font-size: .72rem; font-weight: 700; }
.delivery-period select {
  min-height: 42px; border: 1px solid #dce5de; border-radius: .55rem; padding: .5rem .7rem;
  color: #344238; background: white; font: inherit; text-transform: capitalize;
}
.delivery-period button { color: white; border-color: #277653; background: #277653; }
.delivery-period button:disabled { opacity: .6; cursor: wait; }
.delivery-total {
  display: flex; align-items: center; gap: 1rem; min-height: 158px; border-radius: .9rem;
  padding: 1.5rem 1.8rem; color: white; background: linear-gradient(120deg, #205f42, #32835d);
  box-shadow: 0 12px 30px #1f69451c;
}
.delivery-home-icon {
  display: grid; width: 3.5rem; height: 3.5rem; flex: 0 0 auto; place-items: center;
  border-radius: .9rem; color: #d5efdf; background: #ffffff1f; font-size: 2rem;
}
.delivery-total p { margin: 0 0 .3rem; color: #d5eadc; font-size: .7rem; font-weight: 750; letter-spacing: .1em; }
.delivery-total strong { display: block; font-size: clamp(2.2rem, 6vw, 3rem); letter-spacing: -.05em; line-height: 1.1; }
.delivery-total div > span { display: block; margin-top: .35rem; color: #d1e6d9; font-size: .82rem; text-transform: capitalize; }
.delivery-table-panel {
  overflow: hidden; margin-top: 1.2rem; border: 1px solid #e5ebe6; border-radius: .85rem;
  background: white; box-shadow: 0 3px 14px #2130260a;
}
.delivery-table-panel > header {
  display: flex; align-items: center; justify-content: space-between; gap: .75rem;
  border-bottom: 1px solid #edf0ed; padding: 1.1rem 1.3rem;
}
.delivery-table-panel h2 { margin: 0; color: #2d3b31; font-size: 1rem; }
.delivery-table-panel header p { margin: .3rem 0 0; color: #859087; font-size: .78rem; }
.delivery-table-panel header > span { color: #738076; font-size: .75rem; white-space: nowrap; }
.delivery-table-list { margin: 0; padding: 0; list-style: none; }
.delivery-table-list li { display: flex; align-items: center; justify-content: space-between; gap: 1rem; min-height: 58px; border-bottom: 1px solid #f0f2f0; padding: .65rem 1.3rem; }
.delivery-table-list li:last-child { border-bottom: 0; }
.table-name { display: flex; align-items: center; gap: .65rem; color: #47564b; font-size: .87rem; }
.table-name > span { display: grid; width: 2rem; height: 2rem; place-items: center; border-radius: .55rem; color: #32795a; background: #eaf4ed; }
.delivery-table-list strong { color: #277653; font-size: .86rem; white-space: nowrap; }
.delivery-empty, .delivery-loading { padding: 2rem 1rem; color: #818c84; font-size: .85rem; text-align: center; }
.delivery-alert { border-radius: .55rem; padding: .8rem 1rem; color: #9f3529; background: #fff0ed; font-size: .85rem; line-height: 1.5; }
@media (max-width: 700px) {
  .delivery-page { padding: 0 .75rem 2rem; }
  .delivery-header { min-height: 66px; }
  .delivery-header button { padding: .45rem .55rem; font-size: .76rem; }
  .delivery-content { margin-top: 1.4rem; }
  .delivery-toolbar { align-items: stretch; flex-direction: column; }
  .delivery-period { display: grid; grid-template-columns: 1fr 1fr; }
  .delivery-period button { grid-column: 1 / -1; }
  .delivery-total { min-height: 135px; padding: 1.2rem; }
}
</style>
