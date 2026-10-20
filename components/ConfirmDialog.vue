<script setup lang="ts">
interface Props {
  modelValue: boolean
  title?: string
  message?: string
  confirmText?: string
  confirmColor?: string
  cancelText?: string

  /**
   * Ação assíncrona executada ao confirmar. Quando informada, o diálogo fica
   * aberto com "carregando" até ela terminar, bloqueia o duplo clique, mostra o
   * erro dentro dele e só fecha em caso de sucesso. Sem ela, mantém o
   * comportamento antigo (emite `confirm` e fecha na hora).
   */
  action?: () => unknown | Promise<unknown>

  /** Exige que o usuário digite este texto para liberar a confirmação. */
  requireText?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Confirmar ação',
  message: 'Tem certeza?',
  confirmText: 'Confirmar',
  confirmColor: 'primary',
  cancelText: 'Voltar',
  action: undefined,
  requireText: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [boolean]
  'confirm': []
}>()

const loading = ref(false)
const error = ref('')
const typed = ref('')

watch(() => props.modelValue, open => {
  if (open) {
    error.value = ''
    typed.value = ''
  }
})

const canConfirm = computed(() => !props.requireText || typed.value.trim().toUpperCase() === props.requireText.toUpperCase())

const close = () => {
  if (!loading.value)
    emit('update:modelValue', false)
}

async function onConfirm() {
  if (loading.value || !canConfirm.value)
    return
  if (!props.action) {
    emit('confirm')
    emit('update:modelValue', false)

    return
  }
  loading.value = true
  error.value = ''
  try {
    await props.action()
    emit('update:modelValue', false)
  }
  catch (caught) {
    error.value = caught instanceof Error && caught.message ? caught.message : 'Não foi possível concluir a ação.'
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <VDialog
    :model-value="props.modelValue"
    max-width="460"
    :persistent="loading"
    @update:model-value="value => { if (!value) close() }"
  >
    <VCard>
      <VCardItem>
        <VCardTitle class="text-wrap">
          {{ title }}
        </VCardTitle>
      </VCardItem>
      <VCardText class="confirm-dialog__message">
        <slot>{{ message }}</slot>
      </VCardText>
      <VCardText
        v-if="requireText"
        class="pt-0"
      >
        <VTextField
          v-model="typed"
          :label="`Digite ${requireText} para confirmar`"
          autocomplete="off"
          :disabled="loading"
          @keydown.enter.prevent="onConfirm"
        />
      </VCardText>
      <VCardText
        v-if="error"
        class="pt-0"
      >
        <VAlert
          type="error"
          variant="tonal"
          density="compact"
          role="alert"
        >
          {{ error }}
        </VAlert>
      </VCardText>
      <VCardText class="d-flex justify-end flex-wrap gap-3 pt-0">
        <VBtn
          variant="tonal"
          color="secondary"
          :disabled="loading"
          :autofocus="confirmColor === 'error'"
          @click="close"
        >
          {{ cancelText }}
        </VBtn>
        <VBtn
          :color="confirmColor"
          :loading="loading"
          :disabled="!canConfirm"
          @click="onConfirm"
        >
          {{ confirmText }}
        </VBtn>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style scoped>
.confirm-dialog__message {
  white-space: pre-line;
}
</style>
