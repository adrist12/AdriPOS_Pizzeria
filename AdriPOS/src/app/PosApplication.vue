<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import LoginView from '../presentation/auth/LoginView.vue'
import type { LoginResponse } from '../domain/auth/types'
import MainMenuView from '../presentation/pos/MainMenuView.vue'
import TablesView from '../presentation/pos/TablesView.vue'
import OrderView from '../presentation/pos/OrderView.vue'
import KitchenView from '../presentation/pos/KitchenView.vue'
import AccountingView from '../presentation/pos/AccountingView.vue'
import AccountingEntryView from '../presentation/pos/AccountingEntryView.vue'
import DeliverySalesView from '../presentation/pos/DeliverySalesView.vue'
import type { PosTable, ServiceMode } from '../domain/pos/types'
import { isAccountingAdministrator } from '../domain/auth/accountingPermissions'
import { setApiToken } from '../infrastructure/http/posApi'
import { setSocketToken } from '../infrastructure/realtime/authSocket'
import {
  clearLoginSession,
  loadLoginSession,
  saveLoginSession,
} from '../infrastructure/auth/sessionStorage'
import { posGateway } from './posGateway'

const restoredSession = loadLoginSession()
const session = ref<LoginResponse | null>(restoredSession)
type Screen = 'menu' | 'management' | 'order' | 'kitchen' | 'accounting' | 'accounting-entry' | 'delivery-sales'
const accountingEntryRoute = '#/accounting/movements/new'
const deliverySalesRoute = '#/accounting/delivery-sales'
const hiddenAccountingRoutes: Record<string, Screen> = {
  [accountingEntryRoute]: 'accounting-entry',
  [deliverySalesRoute]: 'delivery-sales',
}
const screen = ref<Screen>(hiddenAccountingRoutes[window.location.hash] ?? 'menu')
const tableMode = ref<'TABLES' | 'DELIVERY'>('TABLES')
const orderMode = ref<ServiceMode>('DINE_IN')
const selectedTable = ref<PosTable | null>(null)
let sessionExpiryTimer: number | undefined

function activateSession(authenticatedSession: LoginResponse): void {
  session.value = authenticatedSession
  saveLoginSession(authenticatedSession)
  setApiToken(authenticatedSession.token)
  setSocketToken(authenticatedSession.token)
  syncScreenWithRoute()

  if (sessionExpiryTimer !== undefined) window.clearTimeout(sessionExpiryTimer)
  sessionExpiryTimer = window.setTimeout(
    signOut,
    Math.max(0, authenticatedSession.expiresAt - Date.now()),
  )
}

if (restoredSession) {
  activateSession(restoredSession)
}

onMounted(() => window.addEventListener('hashchange', handleRouteChange))

function handleAuthenticated(authenticatedSession: LoginResponse): void {
  activateSession(authenticatedSession)
}

function signOut(): void {
  if (sessionExpiryTimer !== undefined) {
    window.clearTimeout(sessionExpiryTimer)
    sessionExpiryTimer = undefined
  }
  clearLoginSession()
  clearHiddenAccountingRoute()
  setApiToken(null)
  setSocketToken(null)
  session.value = null
  selectedTable.value = null
  screen.value = 'menu'
}

onUnmounted(() => {
  window.removeEventListener('hashchange', handleRouteChange)
  if (sessionExpiryTimer !== undefined) window.clearTimeout(sessionExpiryTimer)
})

function openManagement(): void {
  tableMode.value = 'TABLES'
  screen.value = 'management'
}

function syncScreenWithRoute(): void {
  const routeScreen = hiddenAccountingRoutes[window.location.hash]
  if (!routeScreen) return
  if (session.value && isAccountingAdministrator(session.value.user.roleId)) {
    screen.value = routeScreen
    return
  }
  screen.value = 'menu'
  clearHiddenAccountingRoute()
}

function handleRouteChange(): void {
  if (hiddenAccountingRoutes[window.location.hash]) {
    syncScreenWithRoute()
  } else if (screen.value === 'accounting-entry' || screen.value === 'delivery-sales') {
    screen.value = 'menu'
  }
}

function clearHiddenAccountingRoute(): void {
  if (hiddenAccountingRoutes[window.location.hash]) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
  }
}

function returnToMenu(): void {
  clearHiddenAccountingRoute()
  screen.value = 'menu'
}

function openAccounting(): void {
  if (!session.value || !isAccountingAdministrator(session.value.user.roleId)) {
    screen.value = 'menu'
    return
  }
  screen.value = 'accounting'
}

function openOrder(table: PosTable, mode: ServiceMode): void {
  selectedTable.value = table
  tableMode.value = mode === 'DELIVERY' ? 'DELIVERY' : 'TABLES'
  orderMode.value = mode
  screen.value = 'order'
}
</script>

<template>
  <LoginView
    v-if="!session"
    :gateway="posGateway"
    @authenticated="handleAuthenticated"
  />

  <DeliverySalesView
    v-else-if="screen === 'delivery-sales' && session && isAccountingAdministrator(session.user.roleId)"
    :gateway="posGateway"
    @back="returnToMenu"
    @sign-out="signOut"
  />

  <MainMenuView
    v-else-if="screen === 'menu'"
    :is-administrator="Boolean(session && isAccountingAdministrator(session.user.roleId))"
    @open-management="openManagement"
    @open-kitchen="screen = 'kitchen'"
    @open-accounting="openAccounting"
    @sign-out="signOut"
  />

  <AccountingView
    v-else-if="screen === 'accounting'"
    :gateway="posGateway"
    @back="returnToMenu"
    @sign-out="signOut"
  />

  <AccountingEntryView
    v-else-if="screen === 'accounting-entry' && session && isAccountingAdministrator(session.user.roleId)"
    :gateway="posGateway"
    @back="returnToMenu"
    @sign-out="signOut"
  />

  <TablesView
    :gateway="posGateway"
    v-else-if="screen === 'management'"
    :initial-mode="tableMode"
    @back="screen = 'menu'"
    @select="openOrder"
  />

  <OrderView
    :gateway="posGateway"
    v-else-if="screen === 'order' && selectedTable"
    :table="selectedTable"
    :mode="orderMode"
    :session="session"
    @back="screen = 'management'"
  />

  <KitchenView
    :gateway="posGateway"
    v-else
    @back="screen = 'menu'"
  />
</template>
