<script setup lang="ts">
defineProps<{
  isAdministrator?: boolean
}>()

defineEmits<{
  openManagement: []
  openKitchen: []
  openAccounting: []
  signOut: []
}>()
</script>

<template>
  <main class="workspace-page">
    <header class="workspace-header">
      <a class="brand" href="/" aria-label="AdriPOS">
        <span class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></span>
        <span class="brand-name">adri<span>pos</span></span>
      </a>
      <button class="text-button" type="button" @click="$emit('signOut')">
        Cerrar sesión
      </button>
    </header>

    <section class="workspace-content">
      <div class="workspace-intro">
        <p class="eyebrow">CENTRO DE OPERACIONES</p>
        <h1>¿Qué vamos a atender?</h1>
        <p>Elige el canal de servicio para comenzar a gestionar pedidos.</p>
      </div>

      <div class="module-grid">
        <button class="module-card module-card-featured" type="button" @click="$emit('openManagement')">
          <span class="module-icon" aria-hidden="true">01</span>
          <span class="module-label">PEDIDOS Y SERVICIO</span>
          <strong>Gestión de mesas</strong>
          <span class="module-description">Administra mesas, pedidos para llevar y domicilios.</span>
          <span class="module-arrow" aria-hidden="true">↗</span>
        </button>

        <button class="module-card module-card-kitchen" type="button" @click="$emit('openKitchen')">
          <span class="module-icon" aria-hidden="true">02</span>
          <span class="module-label">PREPARACIÓN EN VIVO</span>
          <strong>Cocina</strong>
          <span class="module-description">Consulta comandas por estación.</span>
          <span class="module-arrow" aria-hidden="true">↗</span>
        </button>

        <button
          v-if="isAdministrator"
          class="module-card module-card-accounting"
          type="button"
          @click="$emit('openAccounting')"
        >
          <span class="module-icon" aria-hidden="true">03</span>
          <span class="module-label">ADMINISTRACIÓN</span>
          <strong>Contabilidad</strong>
          <span class="module-description">Consulta ventas y registra movimientos.</span>
          <span class="module-arrow" aria-hidden="true">↗</span>
        </button>
      </div>
    </section>

    <footer class="workspace-footer">
      <span>ADRI POS</span>
      <span>OPERACIÓN CLARA. SERVICIO ÁGIL.</span>
    </footer>
  </main>
</template>
