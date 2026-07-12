<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue?: string
  label?: string
  accept?: string
}>(), {
  label: 'Anexo (comprovante)',
  accept: 'image/*,.pdf',
})

const emit = defineEmits<{ 'update:modelValue': [string | undefined] }>()

const file = ref<File | File[] | null>(null)

watch(file, f => {
  const single = Array.isArray(f) ? f[0] : f
  if (single && import.meta.client)
    emit('update:modelValue', URL.createObjectURL(single))
  else if (!single)
    emit('update:modelValue', undefined)
})
</script>

<template>
  <div>
    <VFileInput
      v-model="file"
      :label="label"
      :accept="accept"
      prepend-icon="ri-attachment-2"
      density="compact"
      show-size
      clearable
    />
    <a
      v-if="props.modelValue"
      :href="props.modelValue"
      target="_blank"
      rel="noopener noreferrer"
      class="text-caption text-primary"
    >
      Ver anexo atual
    </a>
  </div>
</template>
