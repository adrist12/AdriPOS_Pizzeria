<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { AccountingGateway } from '../../application/ports/PosGateway'

const props = defineProps<{ gateway: AccountingGateway }>()
const emit = defineEmits<{
  back: []
  signOut: []
}>()

const date = ref(localDateInput(new Date()))
const typeId = ref('')
const cashAccountId = ref('')
const concept = ref('')
const amount = ref('')
const movementTypes = ref<Array<{ id: number; name: string }>>([])
const cashAccounts = ref<Array<{ id: number; name: string }>>([])
const loading = ref(false)
const submitting = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

onMounted(async () => {
  loading.value = true
  try {
    const [accounts, types] = await Promise.all([
      props.gateway.getAccountingPaymentAccounts(),
      props.gateway.getAccountingMovementTypes(),
    ])
    cashAccounts.value = accounts
    movementTypes.value = types
    cashAccountId.value = accounts[0] ? String(accounts[0].id) : ''
    const defaultType = types.find((type) => type.name.toUpperCase() === 'EGRESO')
      ?? types.find((type) => type.name.toUpperCase() === 'INGRESO')
    typeId.value = defaultType ? String(defaultType.id) : ''
  } catch (error) {
    errorMessage.value = messageFor(error)
  } finally {
    loading.value = false
  }
})

async function saveMovement(): Promise<void> {
  errorMessage.value = ''
  successMessage.value = ''
  const parsedAmount = Number(amount.value)
  if (!date.value || !typeId.value || !cashAccountId.value || !concept.value.trim()
    || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    errorMessage.value = 'Completa todos los campos con un monto mayor que cero.'
    return
  }

  submitting.value = true
  try {
    await props.gateway.recordAccountingMovement({
      date: date.value,
      typeId: Number(typeId.value),
      cashAccountId: Number(cashAccountId.value),
      concept: concept.value.trim(),
      amount: parsedAmount,
    })
    successMessage.value = 'El movimiento quedó registrado en la fecha seleccionada.'
    concept.value = ''
    amount.value = ''
  } catch (error) {
    errorMessage.value = messageFor(error)
  } finally {
    submitting.value = false
  }
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la operación.'
}

function localDateInput(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
</script>

<template>
  <main class="entry-page">
    <header class="entry-header">
      <div class="entry-brand" aria-label="AdriPOS"><span>a</span>adri<strong>pos</strong></div>
      <span class="entry-spacer"></span>
      <button class="entry-secondary" type="button" @click="emit('back')">Volver</button>
      <button class="entry-signout" type="button" @click="emit('signOut')">Cerrar sesión</button>
    </header>

    <section class="entry-card">
      <p class="entry-eyebrow">REGISTRO CONTABLE PRIVADO</p>
      <h1>Nuevo movimiento</h1>
      <p class="entry-description">Registra un ingreso o egreso y asígnalo a la fecha en que ocurrió.</p>

      <p v-if="errorMessage" class="entry-message entry-error" role="alert">{{ errorMessage }}</p>
      <p v-if="successMessage" class="entry-message entry-success" role="status">{{ successMessage }}</p>

      <form class="entry-form" @submit.prevent="saveMovement">
        <label>
          <span>Fecha del movimiento</span>
          <input v-model="date" type="date" required :disabled="loading || submitting">
        </label>
        <label>
          <span>Tipo</span>
          <select v-model="typeId" required :disabled="loading || submitting">
            <option value="" disabled>Selecciona ingreso o egreso</option>
            <option v-for="type in movementTypes" :key="type.id" :value="String(type.id)">
              {{ type.name }}
            </option>
          </select>
        </label>
        <label>
          <span>Caja o método de pago</span>
          <select v-model="cashAccountId" required :disabled="loading || submitting">
            <option value="" disabled>Selecciona una caja</option>
            <option v-for="account in cashAccounts" :key="account.id" :value="String(account.id)">
              {{ account.name }}
            </option>
          </select>
        </label>
        <label>
          <span>Concepto</span>
          <input
            v-model="concept"
            type="text"
            maxlength="255"
            autocomplete="off"
            placeholder="Ej.: Compra de ingredientes"
            required
            :disabled="loading || submitting"
          >
        </label>
        <label>
          <span>Monto</span>
          <input
            v-model="amount"
            type="number"
            min="0.01"
            step="0.01"
            inputmode="decimal"
            placeholder="0"
            required
            :disabled="loading || submitting"
          >
        </label>
        <button class="entry-submit" type="submit" :disabled="loading || submitting">
          {{ loading ? 'Cargando…' : submitting ? 'Guardando…' : 'Guardar movimiento' }}
        </button>
      </form>
      <p class="entry-footnote">Esta pantalla requiere una sesión autorizada de administrador.</p>
    </section>
  </main>
</template>

<style scoped>
.entry-page {
  min-height: 100dvh;
  padding: 0 1rem 3rem;
  color: #202b25;
  background: #f5f7f5;
}
.entry-header {
  display: flex;
  align-items: center;
  gap: .65rem;
  min-height: 76px;
  width: min(100%, 1080px);
  margin: 0 auto;
  border-bottom: 1px solid #e5eae6;
}
.entry-brand { display: flex; align-items: center; color: #202b25; font-size: 1.2rem; font-weight: 800; }
.entry-brand > span {
  display: grid; width: 1.8rem; height: 1.8rem; margin-right: .45rem;
  place-items: center; border-radius: .55rem; color: white; background: #277653;
  font-style: italic;
}
.entry-brand strong { color: #277653; }
.entry-spacer { flex: 1; }
.entry-secondary, .entry-signout {
  min-height: 42px; border: 1px solid #dfe7e1; border-radius: .6rem;
  padding: .55rem .85rem; color: #435148; background: white; font-weight: 650; cursor: pointer;
}
.entry-card {
  width: min(100%, 680px); margin: 3.5rem auto 0; padding: clamp(1.25rem, 4vw, 2.5rem);
  border: 1px solid #e4eae5; border-radius: 1.1rem; background: white;
  box-shadow: 0 18px 48px #253b2e0d;
}
.entry-eyebrow { margin: 0 0 .7rem; color: #277653; font-size: .72rem; font-weight: 800; letter-spacing: .12em; }
.entry-card h1 { margin: 0; font-size: clamp(1.6rem, 5vw, 2rem); letter-spacing: -.04em; }
.entry-description { margin: .65rem 0 1.8rem; color: #748078; line-height: 1.5; }
.entry-form { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.entry-form label { display: grid; gap: .45rem; color: #45534a; font-size: .84rem; font-weight: 650; }
.entry-form input, .entry-form select {
  width: 100%; min-height: 46px; border: 1px solid #dce5de; border-radius: .6rem;
  padding: .65rem .75rem; color: #243128; background: white; font: inherit;
}
.entry-form input:focus, .entry-form select:focus { outline: 3px solid #d8eee0; border-color: #39865f; }
.entry-submit {
  grid-column: 1 / -1; min-height: 48px; margin-top: .35rem; border: 0; border-radius: .65rem;
  color: white; background: #277653; font: inherit; font-weight: 750; cursor: pointer;
}
.entry-submit:hover:not(:disabled) { background: #1f6345; }
.entry-submit:disabled { opacity: .6; cursor: wait; }
.entry-message { border-radius: .55rem; padding: .75rem .9rem; font-size: .9rem; line-height: 1.4; }
.entry-error { color: #9f3529; background: #fff0ed; }
.entry-success { color: #246743; background: #edf8f0; }
.entry-footnote { margin: 1.35rem 0 0; color: #8a948d; font-size: .77rem; text-align: center; }
@media (max-width: 560px) {
  .entry-page { padding: 0 .75rem 2rem; }
  .entry-header { min-height: 66px; }
  .entry-header button { padding: .45rem .55rem; font-size: .77rem; }
  .entry-card { margin-top: 1.5rem; }
  .entry-form { grid-template-columns: 1fr; }
  .entry-submit { grid-column: auto; }
}
</style>
