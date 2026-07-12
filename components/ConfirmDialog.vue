<script setup lang="ts">
interface Props {
  modelValue: boolean
  title?: string
  message?: string
  confirmText?: string
  confirmColor?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Confirmar ação',
  message: 'Tem certeza?',
  confirmText: 'Confirmar',
  confirmColor: 'primary',
})

const emit = defineEmits<{
  'update:modelValue': [boolean]
  'confirm': []
}>()

const close = () => emit('update:modelValue', false)
</script>

<template>
  <VDialog
    :model-value="props.modelValue"
    max-width="440"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <VCard>
      <VCardItem>
        <VCardTitle>{{ title }}</VCardTitle>
      </VCardItem>
      <VCardText>{{ message }}</VCardText>
      <VCardText class="d-flex justify-end gap-3 pt-0">
        <VBtn
          variant="tonal"
          color="secondary"
          @click="close"
        >
          Cancelar
        </VBtn>
        <VBtn
          :color="confirmColor"
          @click="emit('confirm'); close()"
        >
          {{ confirmText }}
        </VBtn>
      </VCardText>
    </VCard>
  </VDialog>
</template>
