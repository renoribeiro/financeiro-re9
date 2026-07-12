<script setup lang="ts">
import type { Meta } from '@/utils/labels'

interface Props {
  value: string
  map: Record<string, Meta>
  size?: string
}
const props = withDefaults(defineProps<Props>(), { size: 'small' })

const meta = computed<Meta>(() => props.map[props.value] ?? { label: props.value, color: 'secondary' })
</script>

<template>
  <VChip
    :color="meta.color"
    :size="size"
    label
  >
    {{ meta.label }}
  </VChip>
</template>
