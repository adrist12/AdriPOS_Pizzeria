<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import type { AccountingGateway } from '../../application/ports/PosGateway'
import type {
  AccountingMovement,
  AccountingMovementDetails,
  AccountingSummary,
} from '../../domain/accounting/types'

const props = defineProps<{ gateway: AccountingGateway }>()
const emit = defineEmits<{
  back: []
  signOut: []
}>()

const now = new Date()
const month = ref(now.getMonth() + 1)
const year = ref(now.getFullYear())
const summary = ref<AccountingSummary | null>(null)
const cashAccounts = ref<Array<{ id: number; name: string }>>([])
const movementTypes = ref<Array<{ id: number; name: string }>>([])
const movementSearch = ref('')
const startDate = ref(dateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)))
const endDate = ref(dateInputValue(now))
const details = ref<AccountingMovementDetails>({})
const editingMovement = ref<AccountingMovement | null>(null)
const editDate = ref('')
const editTypeId = ref('')
const editCashAccountId = ref('')
const editConcept = ref('')
const editAmount = ref('')
const editPassword = ref('')
const savingEdit = ref(false)
const loading = ref(false)
const synchronizing = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const showSyncPanel = ref(false)

const monthOptions = computed(() => Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  label: new Intl.DateTimeFormat('es-CO', { month: 'long' })
    .format(new Date(2024, index, 1)),
})))

const yearOptions = computed(() => Array.from({ length: 7 }, (_, index) => now.getFullYear() - 3 + index))
const paymentAccountSummaries = computed(() => {
  const accounts = new Map<string, { name: string; income: number; expenses: number }>()
  for (const movement of summary.value?.byPaymentAccount ?? []) {
    const account = accounts.get(movement.account) ?? {
      name: movement.account,
      income: 0,
      expenses: 0,
    }
    if (movement.type.toUpperCase() === 'INGRESO') {
      account.income += movement.total
    } else if (movement.type.toUpperCase() === 'EGRESO') {
      account.expenses += movement.total
    }
    accounts.set(movement.account, account)
  }
  return [...accounts.values()].sort((first, second) => first.name.localeCompare(second.name, 'es-CO'))
})
const filteredExpenses = computed(() => {
  const query = movementSearch.value.trim().toLocaleLowerCase('es-CO')
  return Object.values(details.value)
    .flatMap((cash) => cash.movements)
    .filter((movement) => movement.type.toUpperCase() === 'EGRESO')
    .filter((movement) => {
      if (!query) return true
      return [
        movement.concept,
        movement.type,
        movement.account,
        movement.cashAccount,
        movement.origin,
        formatDate(movement.date),
      ].some((value) => value?.toLocaleLowerCase('es-CO').includes(query))
    })
    .sort((first, second) => second.date.localeCompare(first.date) || second.id - first.id)
})
const expenseGroups = computed(() => {
  const accountNames = new Set(paymentAccountSummaries.value.map((account) => account.name))
  for (const movement of filteredExpenses.value) accountNames.add(movement.cashAccount)
  return [...accountNames]
    .sort((first, second) => first.localeCompare(second, 'es-CO'))
    .map((account) => ({
      account,
      movements: filteredExpenses.value.filter((movement) => movement.cashAccount === account),
    }))
})

async function openSyncPanel(): Promise<void> {
  showSyncPanel.value = true
  await nextTick()
  const panel = document.getElementById('sync-panel')
  panel?.querySelector<HTMLElement>('input, select')?.focus()
}

onMounted(async () => {
  loading.value = true
  errorMessage.value = ''
  try {
    const [accounts, types] = await Promise.all([
      props.gateway.getAccountingPaymentAccounts(),
      props.gateway.getAccountingMovementTypes(),
    ])
    cashAccounts.value = accounts
    movementTypes.value = types
    await loadReport()
  } catch (error) {
    errorMessage.value = messageFor(error)
  } finally {
    loading.value = false
  }
})

async function loadReport(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const [nextSummary, nextDetails] = await Promise.all([
      props.gateway.getAccountingSummary(month.value, year.value),
      props.gateway.getAccountingMovementDetails(month.value, year.value),
    ])
    summary.value = nextSummary
    details.value = nextDetails
  } catch (error) {
    errorMessage.value = messageFor(error)
  } finally {
    loading.value = false
  }
}

async function syncSales(): Promise<void> {
  successMessage.value = ''
  errorMessage.value = ''
  synchronizing.value = true
  try {
    const result = await props.gateway.syncAccountingSales(startDate.value, endDate.value)
    showSyncPanel.value = false
    successMessage.value =
      `Sincronización completa: ${result.synced} ventas importadas, ${result.skipped} ya existentes.`
    await loadReport()
  } catch (error) {
    errorMessage.value = messageFor(error)
  } finally {
    synchronizing.value = false
  }
}

function beginEdit(movement: AccountingMovement): void {
  editingMovement.value = movement
  editDate.value = dateOnly(movement.date)
  editTypeId.value = String(movement.typeId)
  editCashAccountId.value = String(
    movement.cashAccountId ?? cashAccounts.value[0]?.id ?? '',
  )
  editConcept.value = movement.concept ?? ''
  editAmount.value = String(movement.amount)
  editPassword.value = ''
  errorMessage.value = ''
}

function cancelEdit(): void {
  editingMovement.value = null
  editPassword.value = ''
}

async function saveEdit(): Promise<void> {
  const movement = editingMovement.value
  const parsedAmount = Number(editAmount.value)
  if (!movement || !editPassword.value) {
    errorMessage.value = 'Ingresa la contraseña de autorización para guardar los cambios.'
    return
  }
  if (!editDate.value || !editTypeId.value || !editCashAccountId.value
    || !editConcept.value.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    errorMessage.value = 'Revisa los datos del movimiento antes de continuar.'
    return
  }

  errorMessage.value = ''
  successMessage.value = ''
  savingEdit.value = true
  try {
    await props.gateway.updateAccountingMovement(movement.id, {
      date: editDate.value,
      typeId: Number(editTypeId.value),
      cashAccountId: Number(editCashAccountId.value),
      concept: editConcept.value.trim(),
      amount: parsedAmount,
      password: editPassword.value,
    })
    cancelEdit()
    successMessage.value = 'El movimiento se actualizó correctamente.'
    await loadReport()
  } catch (error) {
    errorMessage.value = messageFor(error)
  } finally {
    savingEdit.value = false
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDate(value: string): string {
  const date = value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value)
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(date)
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la operación.'
}

function dateInputValue(date: Date): string {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 10)
}

function dateOnly(value: string): string {
  return value.slice(0, 10)
}
</script>

<template>
  <main class="accounting-page">
    <header class="ledger-header">
      <div class="ledger-brand" aria-label="AdriPOS">
        <span class="ledger-brand-mark" aria-hidden="true">a</span>
        <span>adri<span>pos</span></span>
      </div>
      <span class="ledger-header-divider" aria-hidden="true"></span>
      <div class="ledger-heading">
        <span class="ledger-heading-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none"><path d="M4 19.5h16M6.5 16V9m5.5 7V4m5.5 12v-4" /></svg>
        </span>
        <div><h1>Contabilidad</h1><p>Control financiero de tu pizzería</p></div>
      </div>
      <span class="ledger-header-spacer"></span>
      <button class="header-back" type="button" @click="emit('back')">
        <span aria-hidden="true">←</span><span>Volver al menú</span>
      </button>
      <button class="header-signout" type="button" @click="emit('signOut')" aria-label="Cerrar sesión">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10m4-4 4-4-4-4m4 4H9" /></svg>
      </button>
    </header>

    <main class="ledger-main">
      <div class="ledger-toolbar">
        <div><p class="ledger-kicker">INFORME FINANCIERO</p><h2>Resumen mensual</h2>
          <p class="ledger-subtitle">Consulta los ingresos del periodo y revisa cada egreso.</p></div>
        <form class="ledger-period" @submit.prevent="loadReport">
          <label><span>Mes</span>
            <select id="accounting-month" v-model.number="month" aria-label="Mes">
              <option v-for="option in monthOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <label><span>Año</span>
            <select id="accounting-year" v-model.number="year" aria-label="Año">
              <option v-for="option in yearOptions" :key="option" :value="option">{{ option }}</option>
            </select>
          </label>
          <button class="period-submit" type="submit" :disabled="loading">{{ loading ? 'Consultando…' : 'Consultar' }}</button>
        </form>
      </div>

      <p v-if="errorMessage && !editingMovement" class="ledger-notice ledger-notice-error" role="alert">
        <span aria-hidden="true">!</span>{{ errorMessage }}
      </p>
      <p v-if="successMessage" class="ledger-notice ledger-notice-success" role="status">
        <span aria-hidden="true">✓</span>{{ successMessage }}
      </p>

      <section v-if="summary" class="payment-summary" aria-label="Ingresos y egresos por método de pago">
        <header class="payment-summary-heading">
          <div><p class="ledger-kicker">DESGLOSE POR CATEGORÍA</p><h2>Ingresos y egresos por método de pago</h2>
            <p class="ledger-subtitle">Cada caja muestra sus ingresos y egresos por separado.</p></div>
          <span class="payment-summary-period">{{ monthOptions[month - 1]?.label }} {{ year }}</span>
        </header>
        <div v-if="paymentAccountSummaries.length" class="payment-summary-grid">
          <article v-for="account in paymentAccountSummaries" :key="account.name" class="payment-summary-card">
            <h3>{{ account.name }}</h3>
            <dl>
              <div><dt>Ingresos</dt><dd class="payment-income">{{ formatCurrency(account.income) }}</dd></div>
              <div><dt>Egresos</dt><dd class="payment-expense">{{ formatCurrency(account.expenses) }}</dd></div>
            </dl>
          </article>
        </div>
        <p v-else class="payment-summary-empty">No hay ingresos o egresos clasificados por método de pago en este periodo.</p>
      </section>
      <div v-else-if="loading" class="ledger-loading" role="status">
        <span class="ledger-spinner" aria-hidden="true"></span> Cargando resumen mensual…
      </div>

      <section v-if="summary" class="expenses-panel">
        <header class="expenses-toolbar">
          <div class="expenses-title">
            <span class="expenses-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M12 3.5v17M17 7.5H9.5a3 3 0 0 0 0 6H14a3 3 0 0 1 0 6H6.5" /></svg>
            </span>
            <div><h2>Egresos</h2><p>Movimientos registrados durante el periodo</p></div>
            <span class="expense-count">{{ filteredExpenses.length }}</span>
          </div>
          <div class="expenses-actions">
            <label class="movement-search">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4 4" /></svg>
              <input v-model="movementSearch" type="search" placeholder="Buscar egresos…" aria-label="Buscar egresos">
              <button v-if="movementSearch" class="clear-search" type="button" aria-label="Limpiar búsqueda" @click="movementSearch = ''">×</button>
            </label>
            <button class="sync-action-button" type="button" @click="openSyncPanel">
              <span aria-hidden="true">↻</span><span>Sincronizar</span>
            </button>
          </div>
        </header>

        <div v-if="filteredExpenses.length" class="expense-groups">
          <section
            v-for="group in expenseGroups"
            :key="group.account"
            class="expense-group"
            :aria-label="`Egresos de ${group.account}`"
          >
            <header class="expense-group-heading">
              <h3>{{ group.account }}</h3>
              <span>{{ group.movements.length }} {{ group.movements.length === 1 ? 'egreso' : 'egresos' }}</span>
            </header>
            <div v-if="group.movements.length" class="expense-table-wrap">
              <table class="expense-table">
                <thead><tr><th scope="col">Descripción</th><th scope="col">Fecha</th>
                  <th scope="col">Monto</th><th scope="col"><span class="visually-hidden">Acciones</span></th></tr></thead>
                <tbody>
                  <tr v-for="movement in group.movements" :key="movement.id">
                    <td class="expense-name-cell">
                      <span class="expense-row-icon" aria-hidden="true">↗</span>
                      <span><strong>{{ movement.concept || 'Sin descripción' }}</strong>
                        <small>{{ movement.origin === 'POS' ? 'Sincronizado desde UniCenta' : 'Registro manual' }}</small></span>
                    </td>
                    <td class="expense-date-cell">{{ formatDate(movement.date) }}</td>
                    <td class="expense-value">{{ formatCurrency(movement.amount) }}</td>
                    <td class="expense-edit-cell">
                      <button class="edit-button" type="button"
                        :aria-label="`Editar egreso: ${movement.concept || formatCurrency(movement.amount)}`"
                        @click="beginEdit(movement)">
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m14 5 5 5M4 20l4.5-1 10.8-10.8a2.1 2.1 0 0 0-3-3L5.5 16 4 20Z" /></svg>
                        <span>Editar</span>
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="expense-group-empty">No hay egresos de {{ group.account }}{{ movementSearch ? ' que coincidan con la búsqueda' : ' en este periodo' }}.</p>
          </section>
        </div>
        <div v-else class="expense-empty">
          <span class="empty-illustration" aria-hidden="true">✓</span>
          <strong>{{ movementSearch ? 'No encontramos resultados' : 'Aún no hay egresos este mes' }}</strong>
          <p>{{ movementSearch ? 'Prueba con otra descripción, fecha o método de pago.' : 'Cuando registres un gasto, aparecerá aquí para que puedas consultarlo.' }}</p>
        </div>
        <footer v-if="filteredExpenses.length" class="expenses-footer">
          Mostrando {{ filteredExpenses.length }} {{ filteredExpenses.length === 1 ? 'movimiento' : 'movimientos' }}
          <span>·</span> {{ monthOptions[month - 1]?.label }} {{ year }}
        </footer>
      </section>
    </main>

    <div v-if="showSyncPanel" class="ledger-modal-backdrop" @click.self="showSyncPanel = false">
      <section id="sync-panel" class="ledger-modal" role="dialog" aria-modal="true" aria-labelledby="sync-title">
        <header class="ledger-modal-header">
          <div class="modal-icon sync-modal-icon" aria-hidden="true">↻</div>
          <div><p class="modal-kicker">IMPORTACIÓN DE VENTAS</p><h2 id="sync-title">Sincronizar UniCenta</h2>
            <p>Importa los recibos del periodo indicado. Los ya importados no se duplican.</p></div>
          <button class="modal-close" type="button" aria-label="Cerrar" @click="showSyncPanel = false">×</button>
        </header>
        <form class="ledger-modal-form" @submit.prevent="syncSales">
          <div class="modal-date-grid">
            <label>Desde<input v-model="startDate" type="date" required></label>
            <label>Hasta<input v-model="endDate" type="date" required></label>
          </div>
          <div class="modal-hint"><span aria-hidden="true">i</span> Por defecto se selecciona desde el primer día de este mes hasta hoy.</div>
          <p v-if="errorMessage" class="ledger-notice ledger-notice-error modal-error" role="alert">{{ errorMessage }}</p>
          <footer class="ledger-modal-actions">
            <button class="modal-cancel" type="button" @click="showSyncPanel = false">Cancelar</button>
            <button class="modal-submit" type="submit" :disabled="synchronizing">{{ synchronizing ? 'Sincronizando…' : 'Iniciar sincronización' }}</button>
          </footer>
        </form>
      </section>
    </div>

    <div v-if="editingMovement" class="ledger-modal-backdrop" @click.self="cancelEdit">
      <section class="ledger-modal" role="dialog" aria-modal="true" aria-labelledby="edit-dialog-title">
        <header class="ledger-modal-header">
          <div class="modal-icon edit-modal-icon" aria-hidden="true">✎</div>
          <div><p class="modal-kicker">EDICIÓN PROTEGIDA</p><h2 id="edit-dialog-title">Editar movimiento</h2>
            <p>Confirma los cambios y autorízalos con la contraseña del administrador.</p></div>
          <button class="modal-close" type="button" aria-label="Cerrar" @click="cancelEdit">×</button>
        </header>
        <form class="ledger-modal-form edit-form" @submit.prevent="saveEdit">
          <label>Fecha<input v-model="editDate" type="date" required></label>
          <label>Tipo de movimiento<select v-model="editTypeId" required>
            <option v-for="type in movementTypes" :key="type.id" :value="String(type.id)">{{ type.name }}</option></select></label>
          <label>Método de pago<select v-model="editCashAccountId" required>
            <option v-for="account in cashAccounts" :key="account.id" :value="String(account.id)">{{ account.name }}</option></select></label>
          <label>Descripción<input v-model="editConcept" maxlength="255" required></label>
          <label>Monto<span class="amount-input-wrap"><span>$</span><input v-model="editAmount" min="0.01" step="0.01" type="number" required></span></label>
          <label>Contraseña de autorización<input v-model="editPassword" type="password" autocomplete="current-password" placeholder="Ingresa la contraseña" required></label>
          <p v-if="errorMessage" class="ledger-notice ledger-notice-error modal-error" role="alert">{{ errorMessage }}</p>
          <footer class="ledger-modal-actions">
            <button class="modal-cancel" type="button" @click="cancelEdit">Cancelar</button>
            <button class="modal-submit" type="submit" :disabled="savingEdit">{{ savingEdit ? 'Guardando…' : 'Guardar cambios' }}</button>
          </footer>
        </form>
      </section>
    </div>
  </main>
</template>

<style scoped>
.accounting-page {
  min-height: 100dvh;
  padding: 1.5rem clamp(1rem, 3vw, 2rem) 3rem;
  color: #111827;
  background: #f3f4f6;
}
.accounting-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.25rem;
  max-width: 1016px;
  margin: 0 auto 2rem;
}
.accounting-title {
  display: flex;
  align-items: center;
  gap: .7rem;
  margin: 0;
  color: #101827;
  font-size: clamp(1.35rem, 2.4vw, 1.8rem);
  font-weight: 750;
  white-space: nowrap;
}
.accounting-title span { font-size: 1.55rem; }
.accounting-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: end;
  gap: .35rem;
}
.action-button, .consult-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: .35rem;
  min-height: 42px;
  border: 0;
  border-radius: .35rem;
  padding: .65rem .85rem;
  color: white;
  background: #2864e8;
  font: inherit;
  font-size: .82rem;
  font-weight: 650;
  cursor: pointer;
}
.action-button:hover, .consult-button:hover { background: #1d54c8; }
.action-button:disabled, .consult-button:disabled { opacity: .65; cursor: wait; }
.action-secondary { background: #9ca3af; }
.action-secondary:hover { background: #737b89; }
.action-danger { background: #e9483b; }
.action-danger:hover { background: #c93227; }
.accounting-panel, .summary-card {
  max-width: 1016px;
  margin: 0 auto  .75rem;
  border: 0;
  border-radius: .65rem;
  padding: 1.15rem .9rem;
  background: #fff;
  box-shadow: 0 2px 8px rgb(15 23 42 / 7%);
}
.accounting-panel h2 {
  margin: 0 0 .8rem;
  color: #101827;
  font-size: 1.22rem;
  font-weight: 720;
}
.accounting-panel h2 span { margin-right: .3rem; }
.report-period {
  display: inline-block;
  margin-left: .35rem;
  color: #737b89;
  font-size: .8rem;
  font-weight: 500;
}
.form-panel { padding: 1.5rem .9rem .85rem; }
.sync-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(160px, 200px));
  column-gap: 0;
  row-gap: 1.8rem;
}
.sync-form label, .movement-form label {
  display: grid;
  gap: .3rem;
  color: #111827;
  font-size: .8rem;
  font-weight: 600;
}
.sync-form input, .movement-form input, .movement-form select, .report-form select {
  width: 100%;
  min-height: 42px;
  border: 1px solid #d9dde4;
  border-radius: .3rem;
  padding: .55rem .7rem;
  color: #283244;
  background: white;
  font: inherit;
  font-size: .8rem;
}
.panel-actions {
  display: flex;
  grid-column: 1 / -1;
  justify-content: end;
  gap: .6rem;
}
.help-text { margin: .3rem 0 0; color: #737b89; font-size: .78rem; }
.movement-form {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  column-gap: .8rem;
  row-gap: 1.7rem;
}
.report-panel { padding: 1.4rem .9rem .9rem; }
.report-form {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: .8rem;
  align-items: center;
}
.report-form select {
  min-height: 44px;
  border-radius: .35rem;
}
.consult-button { min-height: 44px; width: 100%; }
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  clip-path: inset(50%);
}
.notice, .loading-message { max-width: 1016px; margin: 0 auto .75rem; }
.notice { border-radius: .4rem; padding: .8rem 1rem; font-size: .9rem; }
.notice-error { color: #842424; background: #ffebeb; }
.notice-success { color: #205a36; background: #e4f5e9; }
.loading-message { color: #62695d; }
.accounting-summary {
  max-width: 1016px;
  margin: 0 auto .75rem;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: .75rem;
}
.summary-card {
  display: grid;
  gap: .65rem;
  min-height: 108px;
  align-content: center;
  margin: 0;
  padding: .9rem;
}
.income-card { max-width: 100%; }
.summary-card span { color: #111827; font-size: .88rem; font-weight: 700; }
.summary-card strong { color: #111827; font-size: clamp(1.2rem, 2.2vw, 1.45rem); }
.payment-breakdown { max-width: 1016px; }
.payment-breakdown ul { display: grid; gap: .55rem; margin: 0; padding: 0; list-style: none; }
.payment-breakdown li { display: flex; justify-content: space-between; gap: .8rem; font-size: .9rem; }
.accounting-columns { max-width: 1016px; margin: 0 auto; }
.cash-group { border-top: 1px solid #edf0e9; }
.cash-group summary { display: flex; justify-content: space-between; gap: .8rem; padding: .9rem 0; font-weight: 700; cursor: pointer; }
.cash-group ul { margin: 0; padding: 0; list-style: none; }
.cash-group li { display: flex; justify-content: space-between; gap: 1rem; padding: .7rem 0; border-top: 1px solid #f0f1ed; }
.cash-group li span { display: grid; gap: .25rem; }
.cash-group small, .empty-state { color: #73796f; }
.expense-amount { color: #9a3b31; }
.expense-heading { display: flex; align-items: start; justify-content: space-between; gap: 1rem; }
.expense-heading h2 { margin-bottom: .25rem; }
.section-caption { margin: 0 0 1rem; color: #737b89; font-size: .84rem; }
.expense-count {
  display: grid;
  min-width: 2rem;
  min-height: 2rem;
  place-items: center;
  border-radius: 999px;
  color: #35445c;
  background: #eef2f7;
  font-size: .8rem;
  font-weight: 700;
}
.movement-search {
  display: flex;
  align-items: center;
  gap: .55rem;
  min-height: 46px;
  margin-bottom: .6rem;
  border: 1px solid #d9dde4;
  border-radius: .5rem;
  padding: 0 .75rem;
  background: #fff;
}
.movement-search:focus-within { border-color: #2864e8; box-shadow: 0 0 0 3px rgb(40 100 232 / 12%); }
.movement-search input { flex: 1; min-width: 0; border: 0; outline: 0; color: #283244; font: inherit; font-size: .9rem; }
.search-icon { color: #6d7788; font-size: 1.5rem; line-height: 1; }
.clear-search, .dialog-close {
  border: 0;
  color: #737b89;
  background: transparent;
  font-size: 1.4rem;
  cursor: pointer;
}
.expense-list { margin: 0; padding: 0; list-style: none; }
.expense-item {
  display: flex;
  align-items: center;
  gap: .8rem;
  border-top: 1px solid #edf0f4;
  padding: .85rem .2rem;
}
.expense-symbol {
  display: grid;
  width: 2.25rem;
  height: 2.25rem;
  flex: 0 0 auto;
  place-items: center;
  border-radius: .65rem;
  color: #a63a32;
  background: #fff0ef;
  font-size: 1.25rem;
  font-weight: 700;
}
.expense-description { display: grid; flex: 1; min-width: 0; gap: .2rem; }
.expense-description strong { overflow: hidden; color: #263142; text-overflow: ellipsis; white-space: nowrap; }
.expense-description small { color: #737b89; font-size: .78rem; }
.expense-amount { flex: 0 0 auto; font-variant-numeric: tabular-nums; }
.edit-button {
  min-height: 38px;
  border: 1px solid #d9dde4;
  border-radius: .4rem;
  padding: .4rem .65rem;
  color: #31415a;
  background: white;
  font: inherit;
  font-size: .8rem;
  font-weight: 650;
  cursor: pointer;
}
.edit-button:hover { border-color: #2864e8; color: #1d54c8; }
.modal-backdrop {
  position: fixed;
  z-index: 20;
  inset: 0;
  display: grid;
  align-items: center;
  justify-items: center;
  overflow-y: auto;
  padding: 1rem;
  background: rgb(17 24 39 / 54%);
}
.edit-dialog {
  width: min(100%, 520px);
  border-radius: .9rem;
  padding: 1.35rem;
  background: white;
  box-shadow: 0 24px 70px rgb(0 0 0 / 25%);
}
.edit-dialog-header { display: flex; align-items: start; justify-content: space-between; gap: 1rem; }
.edit-dialog-header h2 { margin: 0; color: #172033; font-size: 1.3rem; }
.dialog-eyebrow { margin: 0 0 .25rem; color: #2864e8; font-size: .68rem; font-weight: 800; letter-spacing: .1em; }
.dialog-help { margin: .7rem 0 1.1rem; color: #687386; font-size: .9rem; line-height: 1.5; }
.edit-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .8rem; }
.edit-form label { display: grid; gap: .35rem; color: #364152; font-size: .8rem; font-weight: 650; }
.edit-form input, .edit-form select {
  width: 100%;
  min-height: 44px;
  border: 1px solid #d9dde4;
  border-radius: .4rem;
  padding: .55rem .65rem;
  color: #283244;
  background: white;
  font: inherit;
  font-size: .85rem;
}
.edit-form label:nth-of-type(4), .edit-form label:nth-of-type(6) { grid-column: 1 / -1; }
.dialog-error { grid-column: 1 / -1; margin: 0; }
.dialog-actions { display: flex; grid-column: 1 / -1; justify-content: end; gap: .6rem; margin-top: .25rem; }
.empty-state { padding: 1rem 0; color: #73796f; text-align: center; }
@media (max-width: 700px) {
  .accounting-page { padding: 1rem .8rem 2rem; }
  .accounting-header { align-items: stretch; flex-direction: column; gap: .85rem; margin-bottom: 1rem; }
  .accounting-title { white-space: normal; }
  .accounting-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .action-button { min-height: 44px; padding: .55rem .45rem; font-size: .75rem; }
  .form-panel { padding: 1rem .8rem .8rem; }
  .sync-form { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .8rem; }
  .movement-form { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .8rem; }
  .panel-actions { gap: .45rem; }
  .panel-actions .action-button { flex: 1; }
  .report-form { grid-template-columns: 1fr 1fr; gap: .55rem; }
  .consult-button { grid-column: 1 / -1; }
  .accounting-summary { grid-template-columns: 1fr; gap: .5rem; }
  .summary-card { min-height: 78px; gap: .35rem; padding: .75rem .9rem; }
  .accounting-panel h2 { font-size: 1.05rem; }
  .expense-item { flex-wrap: wrap; gap: .55rem; }
  .expense-description { flex-basis: calc(100% - 3rem); }
  .expense-amount { margin-left: 2.8rem; }
  .edit-button { margin-left: auto; }
  .edit-dialog { padding: 1.1rem; }
  .edit-form { grid-template-columns: 1fr; }
  .edit-form label:nth-of-type(4), .edit-form label:nth-of-type(6) { grid-column: auto; }
  .dialog-actions { display: grid; grid-template-columns: 1fr 1fr; }
}

/* Accounting dashboard refresh */
.accounting-page {
  min-height: 100dvh;
  padding: 0 0 3rem;
  color: #202b25;
  background: #f5f7f5;
}
.ledger-header {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  min-height: 82px;
  padding: .75rem max(1.5rem, calc((100vw - 1160px) / 2));
  border-bottom: 1px solid #e7ebe7;
  background: #fff;
}
.ledger-brand {
  display: inline-flex;
  align-items: center;
  gap: .55rem;
  color: #202b25;
  font-size: 1.3rem;
  font-weight: 800;
  letter-spacing: -.07em;
  text-decoration: none;
}
.ledger-brand > span:last-child > span { color: #26835e; }
.ledger-brand-mark {
  display: grid;
  width: 2rem;
  height: 2rem;
  place-items: center;
  border-radius: .65rem;
  color: white;
  background: #277653;
  font-size: 1.35rem;
  font-style: italic;
  letter-spacing: -.1em;
}
.ledger-header-divider { width: 1px; height: 2.1rem; background: #e4e9e5; }
.ledger-heading { display: flex; align-items: center; gap: .7rem; }
.ledger-heading-icon {
  display: grid;
  width: 2.55rem;
  height: 2.55rem;
  place-items: center;
  border-radius: .75rem;
  color: #277653;
  background: #eaf4ee;
}
.ledger-heading-icon svg, .expenses-icon svg,
.expense-table svg, .movement-search svg, .header-signout svg {
  width: 1.3rem;
  height: 1.3rem;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}
.ledger-heading h1 { margin: 0; color: #1c2821; font-size: 1.03rem; font-weight: 750; }
.ledger-heading p { margin: .2rem 0 0; color: #818b83; font-size: .78rem; }
.ledger-header-spacer { flex: 1; }
.header-back, .header-signout {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: .45rem;
  min-height: 42px;
  border: 1px solid #e1e8e2;
  border-radius: .55rem;
  padding: .5rem .8rem;
  color: #46544a;
  background: #fff;
  font-size: .83rem;
  font-weight: 650;
  cursor: pointer;
}
.header-back:hover, .header-signout:hover { border-color: #b8c9bd; background: #f8fbf8; }
.header-signout { width: 42px; padding: .5rem; }
.header-signout svg { width: 1.15rem; height: 1.15rem; }
.ledger-main { width: min(100% - 3rem, 1160px); margin: 2rem auto 0; }
.ledger-toolbar {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1.5rem;
  margin-bottom: 1.35rem;
}
.ledger-kicker, .modal-kicker {
  margin: 0 0 .35rem;
  color: #348160;
  font-size: .68rem;
  font-weight: 800;
  letter-spacing: .12em;
}
.ledger-toolbar h2 { margin: 0; color: #202b25; font-size: clamp(1.55rem, 3vw, 2rem); letter-spacing: -.045em; }
.ledger-subtitle { margin: .45rem 0 0; color: #758077; font-size: .92rem; }
.ledger-period { display: flex; align-items: end; gap: .6rem; }
.ledger-period label, .ledger-modal-form > label, .modal-date-grid label {
  display: grid;
  gap: .35rem;
  color: #566258;
  font-size: .75rem;
  font-weight: 650;
}
.ledger-period label > span { padding-left: .15rem; }
.ledger-period select, .ledger-modal-form input, .ledger-modal-form select {
  min-width: 120px;
  min-height: 43px;
  border: 1px solid #dfe6df;
  border-radius: .55rem;
  padding: .55rem .7rem;
  color: #27352c;
  background: #fff;
  font: inherit;
  font-size: .85rem;
}
.ledger-period select:focus, .ledger-modal-form input:focus, .ledger-modal-form select:focus {
  border-color: #5a9c7b;
  outline: 3px solid rgb(50 130 91 / 13%);
}
.period-submit, .new-expense-button, .sync-action-button, .modal-submit, .empty-cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: .45rem;
  min-height: 43px;
  border: 0;
  border-radius: .55rem;
  padding: .65rem .95rem;
  color: #fff;
  background: #277653;
  font: inherit;
  font-size: .82rem;
  font-weight: 700;
  cursor: pointer;
  transition: background .15s ease, transform .15s ease;
}
.period-submit:hover, .new-expense-button:hover, .modal-submit:hover, .empty-cta:hover { background: #1d6244; }
.sync-action-button { color: #375848; background: #edf5ef; }
.sync-action-button:hover { background: #e1eee4; }
.period-submit:disabled, .modal-submit:disabled { opacity: .6; cursor: wait; }
.ledger-notice {
  display: flex;
  align-items: start;
  gap: .55rem;
  width: min(100%, 1160px);
  margin: 0 auto .9rem;
  border-radius: .6rem;
  padding: .8rem 1rem;
  font-size: .87rem;
}
.ledger-notice > span:first-child {
  display: grid;
  width: 1.15rem;
  height: 1.15rem;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid currentColor;
  border-radius: 50%;
  font-size: .72rem;
  font-weight: 800;
}
.ledger-notice-error { color: #9a4136; background: #fff0ed; }
.ledger-notice-success { color: #276c4a; background: #e9f5ed; }
.payment-summary {
  margin-bottom: 1.2rem;
  border: 1px solid #e7ece7;
  border-radius: .85rem;
  padding: 1.25rem 1.4rem;
  background: white;
  box-shadow: 0 3px 14px rgb(33 48 38 / 4%);
}
.payment-summary-heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
.payment-summary-heading h2 { margin: .2rem 0 0; color: #26332a; font-size: 1.05rem; }
.payment-summary-heading .ledger-subtitle { margin: .25rem 0 0; }
.payment-summary-period { color: #78847b; font-size: .78rem; text-transform: capitalize; white-space: nowrap; }
.payment-summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 1fr)); gap: .8rem; }
.payment-summary-card { border: 1px solid #e8ede9; border-radius: .7rem; padding: .95rem 1rem; background: #fbfcfb; }
.payment-summary-card h3 { margin: 0 0 .7rem; color: #2e3d33; font-size: .9rem; }
.payment-summary-card dl { display: grid; gap: .55rem; margin: 0; }
.payment-summary-card dl > div { display: flex; align-items: center; justify-content: space-between; gap: .8rem; }
.payment-summary-card dt { color: #768179; font-size: .78rem; }
.payment-summary-card dd { margin: 0; font-size: .86rem; font-weight: 750; font-variant-numeric: tabular-nums; }
.payment-income { color: #277653; }
.payment-expense { color: #a44c3e; }
.payment-summary-empty { margin: 0; color: #818c84; font-size: .82rem; }
.ledger-loading { display: flex; min-height: 140px; align-items: center; justify-content: center; gap: .7rem; color: #6d7b70; }
.ledger-spinner { width: 1.2rem; height: 1.2rem; border: 2px solid #dce8df; border-top-color: #277653; border-radius: 50%; animation: ledger-spin .8s linear infinite; }
@keyframes ledger-spin { to { transform: rotate(360deg); } }
.expenses-panel {
  overflow: hidden;
  border: 1px solid #e7ece7;
  border-radius: .85rem;
  background: white;
  box-shadow: 0 3px 14px rgb(33 48 38 / 4%);
}
.expense-groups { display: grid; gap: 1rem; padding: 0 1.2rem 1.2rem; }
.expense-group { overflow: hidden; border: 1px solid #e7ece7; border-radius: .7rem; background: white; }
.expense-group-heading { display: flex; min-height: 48px; align-items: center; justify-content: space-between; gap: .75rem; border-bottom: 1px solid #edf0ed; padding: .65rem 1rem; background: #f8faf8; }
.expense-group-heading h3 { margin: 0; color: #2f3d33; font-size: .86rem; font-weight: 750; }
.expense-group-heading span { color: #78847b; font-size: .72rem; white-space: nowrap; }
.expense-group-empty { margin: 0; padding: 1rem; color: #879188; font-size: .8rem; }
.expenses-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1.25rem 1.4rem; }
.expenses-title { display: flex; align-items: center; gap: .75rem; min-width: 0; }
.expenses-icon { display: grid; width: 2.6rem; height: 2.6rem; flex: 0 0 auto; place-items: center; border-radius: .7rem; color: #9a6537; background: #fbf1e7; }
.expenses-title h2 { margin: 0; color: #26332a; font-size: 1.08rem; font-weight: 750; }
.expenses-title p { margin: .22rem 0 0; color: #818b83; font-size: .78rem; }
.expense-count {
  display: grid;
  min-width: 1.7rem;
  height: 1.7rem;
  place-items: center;
  margin-left: .1rem;
  border-radius: 999px;
  color: #607066;
  background: #f0f4f0;
  font-size: .75rem;
  font-weight: 750;
}
.expenses-actions { display: flex; align-items: center; gap: .55rem; }
.movement-search { display: flex; width: min(30vw, 260px); min-height: 42px; align-items: center; gap: .5rem; margin: 0; border: 1px solid #e2e8e2; border-radius: .55rem; padding: 0 .7rem; background: #fff; }
.movement-search:focus-within { border-color: #70a88a; box-shadow: 0 0 0 3px rgb(50 130 91 / 10%); }
.movement-search svg { width: 1.05rem; height: 1.05rem; flex: 0 0 auto; color: #89948b; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; }
.movement-search input { width: 100%; min-width: 0; border: 0; outline: 0; color: #303d33; background: transparent; font: inherit; font-size: .8rem; }
.movement-search input::placeholder { color: #9aa39c; }
.clear-search { border: 0; color: #737b89; background: transparent; font-size: 1.3rem; cursor: pointer; }
.new-expense-button, .sync-action-button { min-height: 42px; white-space: nowrap; }
.new-expense-button > span:first-child { font-size: 1.2rem; line-height: .7; }
.sync-action-button { border: 1px solid #e4ece5; }
.expense-table-wrap { overflow-x: auto; }
.expense-table { width: 100%; border-collapse: collapse; text-align: left; }
.expense-table thead { background: #f7f9f7; }
.expense-table th { height: 43px; padding: 0 1rem; color: #7b877e; font-size: .68rem; font-weight: 750; letter-spacing: .07em; text-transform: uppercase; }
.expense-table th:first-child, .expense-table td:first-child { padding-left: 1.4rem; }
.expense-table th:last-child, .expense-table td:last-child { padding-right: 1.4rem; text-align: right; }
.expense-table td { height: 68px; border-top: 1px solid #edf0ed; padding: .65rem 1rem; color: #49564c; font-size: .82rem; white-space: nowrap; }
.expense-name-cell { display: flex; align-items: center; gap: .65rem; }
.expense-name-cell > span:last-child { display: grid; gap: .2rem; }
.expense-name-cell strong { max-width: 310px; overflow: hidden; color: #2b372e; font-size: .84rem; text-overflow: ellipsis; }
.expense-name-cell small { color: #8c978e; font-size: .72rem; }
.expense-row-icon { display: grid; width: 2rem; height: 2rem; flex: 0 0 auto; place-items: center; border-radius: .6rem; color: #a65c49; background: #fff2ee; font-size: 1rem; font-weight: 750; transform: rotate(90deg); }
.payment-tag { display: inline-flex; align-items: center; border-radius: 999px; padding: .35rem .6rem; color: #627067; background: #f1f5f1; font-size: .72rem; font-weight: 650; }
.expense-value { color: #a44c3e !important; font-weight: 750; font-variant-numeric: tabular-nums; }
.expense-edit-cell { width: 90px; }
.edit-button { display: inline-flex; align-items: center; gap: .35rem; border: 0; padding: .45rem .55rem; color: #637268; background: transparent; font: inherit; font-size: .76rem; font-weight: 650; cursor: pointer; }
.edit-button:hover { border: 0; color: #26744f; background: #eff6f0; }
.expense-table .edit-button svg { width: .95rem; height: .95rem; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.expense-empty { display: grid; justify-items: center; padding: 3.5rem 1rem; text-align: center; }
.empty-illustration { display: grid; width: 3rem; height: 3rem; place-items: center; margin-bottom: .8rem; border-radius: 50%; color: #37815d; background: #eaf4ed; font-size: 1.2rem; font-weight: 800; }
.expense-empty > strong { color: #334238; font-size: .95rem; }
.expense-empty p { max-width: 340px; margin: .45rem 0 1rem; color: #859087; font-size: .82rem; line-height: 1.5; }
.empty-cta { min-height: 40px; font-size: .78rem; }
.expenses-footer { border-top: 1px solid #edf0ed; padding: .75rem 1.4rem; color: #879188; font-size: .74rem; }
.expenses-footer span { margin: 0 .3rem; }
.ledger-modal-backdrop { position: fixed; z-index: 40; inset: 0; display: grid; align-items: center; justify-items: center; overflow-y: auto; padding: 1rem; background: rgb(17 31 23 / 48%); backdrop-filter: blur(3px); }
.ledger-modal { width: min(100%, 520px); max-height: min(92dvh, 780px); overflow-y: auto; border: 1px solid rgb(255 255 255 / 80%); border-radius: .95rem; padding: 1.4rem; background: #fff; box-shadow: 0 24px 80px rgb(20 43 29 / 24%); animation: ledger-modal-in .16s ease-out; }
@keyframes ledger-modal-in { from { opacity: 0; transform: translateY(8px) scale(.99); } to { opacity: 1; transform: translateY(0) scale(1); } }
.ledger-modal-header { display: flex; align-items: start; gap: .85rem; margin-bottom: 1.15rem; }
.ledger-modal-header > div:nth-child(2) { flex: 1; min-width: 0; }
.modal-icon { display: grid; width: 2.65rem; height: 2.65rem; flex: 0 0 auto; place-items: center; border-radius: .75rem; font-size: 1.3rem; font-weight: 750; }
.sync-modal-icon { color: #3e6a9c; background: #edf3fa; }
.movement-modal-icon { color: #277653; background: #eaf4ed; }
.edit-modal-icon { color: #9a6537; background: #fbf1e7; }
.ledger-modal-header h2 { margin: 0; color: #26332a; font-size: 1.2rem; letter-spacing: -.02em; }
.ledger-modal-header p:last-child { margin: .35rem 0 0; color: #7c877e; font-size: .8rem; line-height: 1.45; }
.modal-kicker { margin-bottom: .25rem !important; font-size: .62rem !important; }
.modal-close { width: 2rem; height: 2rem; flex: 0 0 auto; border: 0; border-radius: .45rem; color: #7f8a81; background: transparent; font-size: 1.45rem; line-height: 1; cursor: pointer; }
.modal-close:hover { color: #39473d; background: #f1f4f1; }
.ledger-modal-form { display: grid; gap: .85rem; }
.ledger-modal-form label { display: grid; gap: .35rem; color: #566258; font-size: .75rem; font-weight: 650; }
.ledger-modal-form input, .ledger-modal-form select { width: 100%; min-width: 0; min-height: 44px; }
.modal-date-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem; }
.modal-hint { display: flex; align-items: start; gap: .5rem; border-radius: .55rem; padding: .7rem .75rem; color: #6d7c70; background: #f3f7f3; font-size: .73rem; line-height: 1.4; }
.modal-hint > span { display: grid; width: 1rem; height: 1rem; flex: 0 0 auto; place-items: center; border: 1px solid #8aa18f; border-radius: 50%; font-size: .65rem; font-weight: 700; }
.ledger-modal-actions { display: flex; justify-content: end; gap: .55rem; margin-top: .35rem; padding-top: .9rem; border-top: 1px solid #edf0ed; }
.modal-cancel { min-height: 42px; border: 1px solid #dfe6df; border-radius: .55rem; padding: .6rem .9rem; color: #536157; background: #fff; font: inherit; font-size: .81rem; font-weight: 650; cursor: pointer; }
.modal-cancel:hover { background: #f6f8f6; }
.modal-submit { min-height: 42px; padding: .6rem 1rem; }
.amount-input-wrap { display: flex; min-height: 44px; align-items: center; border: 1px solid #dfe6df; border-radius: .55rem; padding-left: .7rem; color: #829087; background: #fff; }
.amount-input-wrap:focus-within { border-color: #5a9c7b; outline: 3px solid rgb(50 130 91 / 13%); }
.amount-input-wrap > span { font-size: .86rem; }
.ledger-modal-form .amount-input-wrap input { border: 0; outline: 0; }
.edit-form { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.edit-form > label:nth-of-type(4), .edit-form > label:nth-of-type(6) { grid-column: 1 / -1; }
.modal-error { width: 100%; margin: 0; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; clip-path: inset(50%); }
@media (max-width: 760px) {
  .ledger-header { min-height: 68px; gap: .7rem; padding: .7rem 1rem; }
  .ledger-brand { gap: .4rem; font-size: 1.1rem; }
  .ledger-brand-mark { width: 1.8rem; height: 1.8rem; }
  .ledger-header-divider { height: 1.7rem; }
  .ledger-heading { gap: .5rem; }
  .ledger-heading-icon { width: 2.15rem; height: 2.15rem; }
  .ledger-heading h1 { font-size: .9rem; }
  .ledger-heading p { display: none; }
  .header-back { width: 40px; min-height: 40px; padding: .45rem; font-size: 1rem; }
  .header-back > span:last-child { display: none; }
  .header-signout { width: 40px; min-height: 40px; }
  .ledger-main { width: min(100% - 1.5rem, 600px); margin-top: 1.25rem; }
  .ledger-toolbar { align-items: stretch; flex-direction: column; gap: 1rem; margin-bottom: 1rem; }
  .ledger-toolbar h2 { font-size: 1.55rem; }
  .ledger-subtitle { font-size: .84rem; }
  .ledger-period { display: grid; grid-template-columns: 1fr 1fr; gap: .55rem; }
  .ledger-period select { width: 100%; min-width: 0; }
  .period-submit { grid-column: 1 / -1; }
  .payment-summary { padding: 1rem; }
  .payment-summary-heading { align-items: start; flex-direction: column; gap: .35rem; }
  .expenses-toolbar { align-items: stretch; flex-direction: column; padding: 1rem; }
  .expenses-actions { display: grid; grid-template-columns: 1fr 1fr; }
  .movement-search { width: auto; grid-column: 1 / -1; }
  .sync-action-button { min-width: 0; padding: .55rem .4rem; font-size: .76rem; }
  .expense-table thead { display: none; }
  .expense-table, .expense-table tbody { display: block; width: 100%; }
  .expense-groups { gap: .75rem; padding: 0 .65rem .8rem; }
  .expense-table tbody { padding: .45rem .65rem; }
  .expense-table tbody tr {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: .4rem .6rem;
    margin: .45rem 0;
    border: 1px solid #edf0ed;
    border-radius: .7rem;
    padding: .75rem;
  }
  .expense-table td { width: auto; height: auto; border: 0; padding: .1rem 0; font-size: .77rem; }
  .expense-table th:first-child, .expense-table td:first-child { padding-left: 0; }
  .expense-table th:last-child, .expense-table td:last-child { padding-right: 0; text-align: left; }
  .expense-name-cell { grid-column: 1 / -1; }
  .expense-name-cell strong { max-width: 58vw; }
  .expense-date-cell::before { display: block; margin-bottom: .2rem; color: #929b93; content: "FECHA"; font-size: .58rem; font-weight: 750; letter-spacing: .06em; }
  .expense-table td:nth-child(3) { justify-self: end; text-align: right; }
  .expense-table td:nth-child(3)::before { display: block; margin-bottom: .2rem; color: #929b93; content: "MÉTODO"; font-size: .58rem; font-weight: 750; letter-spacing: .06em; }
  .expense-table td:nth-child(4) { align-self: center; color: #a44c3e; font-size: .88rem; }
  .expense-edit-cell { align-self: center; }
  .expenses-footer { padding: .75rem 1rem; }
  .edit-form { grid-template-columns: 1fr; }
  .edit-form > label:nth-of-type(4), .edit-form > label:nth-of-type(6) { grid-column: auto; }
}
@media (max-width: 390px) {
  .ledger-brand > span:last-child { display: none; }
  .ledger-header { gap: .55rem; }
  .expenses-title { gap: .5rem; }
  .expenses-title p { max-width: 190px; }
  .expense-count { min-width: 1.5rem; height: 1.5rem; }
  .sync-action-button span:last-child { display: none; }
  .ledger-modal { padding: 1rem; }
  .modal-date-grid { grid-template-columns: 1fr; }
}
</style>
