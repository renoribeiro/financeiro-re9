<script setup lang="ts">
import { buildMonthOptions } from '@/utils/dateFilter'

const props = defineProps<{
  /** Datas candidatas (ex.: vencimentos) para montar as opções de mês. */
  dates: Array<string | null | undefined>
}>()

// 'all' | 'YYYY-MM'
const model = defineModel<string>({ default: 'all' })

const items = computed(() => buildMonthOptions(props.dates))

// Se o mês selecionado sumir dos dados, volta para "Todos os meses".
watch(items, list => {
  if (!list.some(i => i.value === model.value))
    model.value = 'all'
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
