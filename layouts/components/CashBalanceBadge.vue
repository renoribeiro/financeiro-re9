<script setup lang="ts">
import { useFinanceMetrics } from '@/composables/useFinanceMetrics'

// Saldo em caixa (realizado acumulado) da empresa atual — sempre visível na
// barra superior por ser a informação financeira mais crucial.
const m = useFinanceMetrics()
const positive = computed(() => m.cashBalance.value >= 0)
</script>

<template>
  <VCard
    color="primary"
    variant="tonal"
    flat
    class="cash-balance-badge d-flex align-center px-3 py-1"
  >
    <VIcon
      icon="ri-wallet-3-line"
      size="20"
      color="primary"
      class="me-2"
    />
    <div
      class="d-flex flex-column"
      style="line-height: 1.15;"
    >
      <span class="text-caption text-medium-emphasis text-no-wrap">Saldo em caixa</span>
      <span
        class="text-body-2 font-weight-bold text-no-wrap"
        :class="positive ? 'text-primary' : 'text-error'"
      >{{ formatBRL(m.cashBalance.value) }}</span>
    </div>
  </VCard>
</template>

<style lang="scss" scoped>
.cash-balance-badge {
  border-radius: 8px;
}
</style>
