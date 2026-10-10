<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { LoginResponse } from '../../domain/auth/types'
import type { PosGateway } from '../../application/ports/PosGateway'

const props = defineProps<{ gateway: PosGateway }>()

const emit = defineEmits<{
  authenticated: [session: LoginResponse]
}>()

const name = ref('')
const password = ref('')
const showPassword = ref(false)
const isSubmitting = ref(false)
const errorMessage = ref('')
const isConnected = ref(props.gateway.isRealtimeConnected())
let unsubscribeConnection: (() => void) | undefined

async function submitLogin(): Promise<void> {
  if (isSubmitting.value) return

  errorMessage.value = ''
  isSubmitting.value = true

  try {
    const session = await props.gateway.requestLogin({
      name: name.value.trim(),
      password: password.value,
    })

    emit('authenticated', session)
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'No se pudo iniciar sesión. Inténtalo de nuevo.'
  } finally {
    isSubmitting.value = false
  }
}

onMounted(() => {
  unsubscribeConnection = props.gateway.onRealtimeConnectionChanged((connected) => {
    isConnected.value = connected
  })
  props.gateway.connectRealtime()
})

onUnmounted(() => {
  unsubscribeConnection?.()
})
</script>

<template>
  <main class="login-page">
    <section class="login-panel" aria-labelledby="login-title">
      <div class="login-panel-inner">
        <a class="brand" href="/" aria-label="AdriPOS, inicio">
          <span class="brand-mark" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
          </span>
          <span class="brand-name">adri<span>pos</span></span>
        </a>

        <div class="login-heading">
          <p class="eyebrow">PUNTO DE VENTA</p>
          <h1 id="login-title">Bienvenido<br />de nuevo.</h1>
          <p class="login-description">
            Ingresa tus credenciales para continuar al sistema.
          </p>
        </div>

        <form class="login-form" @submit.prevent="submitLogin">
          <label class="field-label" for="username">Usuario</label>
          <div class="input-wrap">
            <svg
              class="input-icon"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle cx="12" cy="8" r="3.5" />
              <path d="M5 20c.5-3.5 3.2-5.5 7-5.5s6.5 2 7 5.5" />
            </svg>
            <input
              id="username"
              v-model="name"
              name="username"
              type="text"
              autocomplete="username"
              placeholder="Tu usuario"
              required
              :disabled="isSubmitting"
            />
          </div>

          <div class="password-label-row">
            <label class="field-label" for="password">Contraseña</label>
          </div>
          <div class="input-wrap">
            <svg
              class="input-icon"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <rect x="5" y="10" width="14" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            <input
              id="password"
              v-model="password"
              name="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="Ingresa tu contraseña"
              required
              :disabled="isSubmitting"
            />
            <button
              class="password-toggle"
              type="button"
              :aria-label="showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'"
              :aria-pressed="showPassword"
              @click="showPassword = !showPassword"
            >
              {{ showPassword ? 'Ocultar' : 'Mostrar' }}
            </button>
          </div>

          <p v-if="errorMessage" class="form-error" role="alert">
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="10" cy="10" r="7.5" />
              <path d="M10 6v4.5M10 13.5v.1" />
            </svg>
            {{ errorMessage }}
          </p>

          <button class="login-button" type="submit" :disabled="isSubmitting">
            <span>{{ isSubmitting ? 'Verificando…' : 'Iniciar sesión' }}</span>
            <svg
              v-if="!isSubmitting"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
            >
              <path d="M4 10h12M10 4l6 6-6 6" />
            </svg>
            <span v-else class="button-spinner" aria-hidden="true"></span>
          </button>
        </form>

        <div class="connection-status" aria-live="polite">
          <span
            class="connection-dot"
            :class="{ 'is-connected': isConnected }"
          ></span>
          <span>
            {{ isConnected ? 'Servidor conectado' : 'Conectando al servidor…' }}
          </span>
        </div>
      </div>

      <footer class="login-footer">
        <span>ADRI POS</span>
        <span>GESTIÓN INTELIGENTE</span>
      </footer>
    </section>

    <aside class="brand-panel" aria-label="Información de AdriPOS">
      <div class="ambient ambient-one"></div>
      <div class="ambient ambient-two"></div>

      <div class="brand-panel-content">
        <div class="panel-overline">
          <span></span>
          <span>CONTROL · SERVICIO · PRECISIÓN</span>
        </div>

        <div class="panel-copy">
          <p class="eyebrow">TU NEGOCIO, EN ORDEN</p>
          <h2>Todo fluye<br />desde aquí<span>.</span></h2>
          <p>
            Una operación más clara para tu equipo. Pedidos, mesas y cocina,
            trabajando en sincronía.
          </p>
        </div>

        <div class="panel-graphic" aria-hidden="true">
          <div class="graphic-ring ring-back"></div>
          <div class="graphic-ring ring-front"></div>
          <div class="graphic-core">
            <span class="core-mark">
              <i></i><i></i><i></i>
            </span>
          </div>
          <span class="orbit-point point-one"></span>
          <span class="orbit-point point-two"></span>
          <span class="orbit-point point-three"></span>
          <span class="graphic-caption">ADRI POS / 01</span>
        </div>

        <div class="panel-bottom">
          <span>DISEÑADO PARA EL RITMO DE TU COCINA</span>
          <span class="panel-index">01 <i></i> 03</span>
        </div>
      </div>
    </aside>
  </main>
</template>
