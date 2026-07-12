<script setup lang="ts">
interface Props {
  title: string
  subtitle?: string
  icon?: string
}
defineProps<Props>()
</script>

<template>
  <div class="d-flex flex-wrap justify-space-between align-center gap-4 mb-6">
    <div class="d-flex align-center gap-x-3">
      <VAvatar
        v-if="icon"
        rounded
        variant="tonal"
        color="primary"
        size="42"
      >
        <VIcon
          :icon="icon"
          size="24"
        />
      </VAvatar>
      <div>
        <h4 class="text-h4 mb-0">
          {{ title }}
        </h4>
        <span
          v-if="subtitle"
          class="text-body-1 text-medium-emphasis"
        >{{ subtitle }}</span>
      </div>
    </div>

    <div class="d-flex align-center gap-x-2">
      <slot name="actions" />
    </div>
  </div>
</template>
