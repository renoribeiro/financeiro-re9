<script setup lang="ts">
import type { DateWindow, PeriodPreset } from '@/utils/dateFilter'
import { presetWindow } from '@/utils/dateFilter'

// Janela de datas normalizada (inclusiva) exposta via v-model.
const model = defineModel<DateWindow>({ default: () => ({ start: null, end: null }) })

const preset = ref<PeriodPreset>('all')
const customStart = ref<string>('')
const customEnd = ref<string>('')

const presetItems = [
  { label: 'Tudo', value: 'all' as const },
  { label: '7 dias', value: '7d' as const },
  { label: '15 dias', value: '15d' as const },
  { label: '30 dias', value: '30d' as const },
]

function applyPreset(p: PeriodPreset) {
  preset.value = p
  customStart.value = ''
  customEnd.value = ''
  model.value = presetWindow(p)
}

function applyCustom() {
  preset.value = 'custom'
  model.value = {
    start: customStart.value || null,
    end: customEnd.value || null,
  }
}
</script>

<template>
  <div class="d-flex flex-wrap align-center gap-3">
    <VBtnToggle
      :model-value="preset"
      density="compact"
      color="primary"
      variant="outlined"
      mandatory
      @update:model-value="p => applyPreset(p as PeriodPreset)"
    >
      <VBtn
        v-for="it in presetItems"
        :key="it.value"
        :value="it.value"
      >
        {{ it.label }}
      </VBtn>
    </VBtnToggle>

    <VTextField
      v-model="customStart"
      type="date"
      label="Início"
      density="compact"
      hide-details
      clearable
      style="max-inline-size: 170px;"
      @update:model-value="applyCustom"
    />
    <VTextField
      v-model="customEnd"
      type="date"
      label="Fim"
      density="compact"
      hide-details
      clearable
      style="max-inline-size: 170px;"
      @update:model-value="applyCustom"
    />
  </div>
</template>
