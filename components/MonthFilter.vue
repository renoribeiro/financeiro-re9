<script setup lang="ts">
import { buildMonthOptions, currentMonthKey } from '@/utils/dateFilter'

const props = defineProps<{

  /** Datas candidatas (ex.: vencimentos) para montar as opções de mês. */
  dates: Array<string | null | undefined>
}>()

// 'all' | 'YYYY-MM'
const model = defineModel<string>({ default: currentMonthKey() })
const currentMonth = currentMonthKey()

const items = computed(() => buildMonthOptions(props.dates, currentMonth))

// Se uma seleção antiga sumir ao trocar de empresa, volta ao mês atual.
watch(items, list => {
  if (!list.some(i => i.value === model.value))
    model.value = currentMonth
})
</script>

<template>
  <VSelect
    v-model="model"
    :items="items"
    density="compact"
    label="Mês (vencimento)"
    style="max-inline-size: 200px;"
  />
</template>
