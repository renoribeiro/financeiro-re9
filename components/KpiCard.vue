<script setup lang="ts">
interface Props {
  title: string
  value: string
  icon: string
  color?: string
  subtitle?: string
  change?: number
}
const props = withDefaults(defineProps<Props>(), { color: 'primary' })

const isPositive = computed(() => Number(props.change) >= 0)
</script>

<template>
  <VCard>
    <VCardText>
      <div class="d-flex align-center justify-space-between mb-3">
        <VAvatar
          rounded
          size="42"
          variant="tonal"
          :color="color"
        >
          <VIcon
            :icon="icon"
            size="24"
          />
        </VAvatar>

        <VChip
          v-if="change !== undefined"
          size="small"
          label
          :color="isPositive ? 'success' : 'error'"
        >
          <VIcon
            start
            size="16"
            :icon="isPositive ? 'ri-arrow-up-line' : 'ri-arrow-down-line'"
          />
          {{ Math.abs(Number(change)) }}%
        </VChip>
      </div>

      <h4 class="text-h4 mb-1">
        {{ value }}
      </h4>
      <div class="text-body-1 text-medium-emphasis">
        {{ title }}
      </div>
      <div
        v-if="subtitle"
        class="text-caption text-disabled mt-1"
      >
        {{ subtitle }}
      </div>
    </VCardText>
  </VCard>
</template>
