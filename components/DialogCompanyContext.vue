<script setup lang="ts">
import { useAppStore } from '@/stores/app'

// Mostra, no topo de diálogos que gravam dados, em qual empresa o registro
// será salvo — evita lançar na empresa errada em ambiente multiempresa.
const app = useAppStore()
</script>

<template>
  <div
    class="dialog-company-context d-flex align-center gap-2 text-body-2 text-medium-emphasis"
    data-testid="dialog-company-context"
  >
    <VAvatar
      size="22"
      rounded
      variant="tonal"
      :color="app.currentCompany.logoColor"
    >
      <VIcon
        size="14"
        :icon="app.isRealEstate ? 'ri-building-line' : 'ri-megaphone-line'"
      />
    </VAvatar>
    <span>Empresa: <strong class="text-high-emphasis">{{ app.currentCompany.tradeName }}</strong></span>
  </div>
</template>
