<script setup lang="ts">
import { useAppStore } from '@/stores/app'

const props = withDefaults(defineProps<{
  modelValue?: string
  label?: string
  accept?: string
  entityType: 'payable' | 'receivable' | 'invoice' | 'supplier' | 'employee'
  entityId?: string
  autoUpload?: boolean
  hint?: string
  persistentHint?: boolean
}>(), {
  label: 'Anexo (comprovante)',
  accept: 'image/png,image/jpeg,application/pdf',
  entityId: '',
  autoUpload: true,
  hint: '',
  persistentHint: false,
})

const emit = defineEmits<{ 'update:modelValue': [string | undefined] }>()
const app = useAppStore()
const file = ref<File | File[] | null>(null)
const loading = ref(false)
const error = ref('')
const allowedTypes = new Set(['image/png', 'image/jpeg', 'application/pdf'])

function requestErrorMessage(caught: unknown) {
  if (caught && typeof caught === 'object') {
    const value = caught as { data?: { message?: unknown; statusMessage?: unknown }; message?: unknown }
    const serverMessage = value.data?.message || value.data?.statusMessage

    if (typeof serverMessage === 'string' && serverMessage.trim())
      return serverMessage
    if (typeof value.message === 'string' && value.message.trim())
      return value.message
  }

  return 'Não foi possível enviar o anexo.'
}

const currentHref = computed(() => {
  if (!props.modelValue)
    return ''
  if (props.modelValue.startsWith('http') || props.modelValue.startsWith('/'))
    return props.modelValue

  return `/api/storage/legacy/download?companyId=${encodeURIComponent(app.currentCompanyId)}&path=${encodeURIComponent(props.modelValue)}`
})

function selectedFile() {
  return Array.isArray(file.value) ? file.value[0] : file.value
}

function validate(single?: File) {
  error.value = ''
  if (!single)
    return false
  if (!allowedTypes.has(single.type)) {
    error.value = 'Tipo de arquivo não permitido. Envie PDF, PNG ou JPEG.'

    return false
  }
  if (single.size > 10 * 1024 * 1024) {
    error.value = 'O arquivo deve ter no máximo 10 MB.'

    return false
  }

  return true
}

async function upload(entityId = props.entityId) {
  const single = selectedFile()
  if (!single)
    return props.modelValue
  if (!validate(single))
    throw new Error(error.value)
  if (!entityId)
    throw new Error('Salve o registro antes de enviar o anexo.')

  loading.value = true
  try {
    const body = new FormData()

    body.append('companyId', app.currentCompanyId)
    body.append('entityType', props.entityType)
    body.append('entityId', entityId)
    body.append('file', single)

    const result = await $fetch<{ reference: string }>('/api/storage/upload', { method: 'POST', body })

    emit('update:modelValue', result.reference)
    file.value = null

    return result.reference
  }
  catch (caught) {
    error.value = requestErrorMessage(caught)
    throw new Error(error.value)
  }
  finally {
    loading.value = false
  }
}

watch(file, async value => {
  const single = Array.isArray(value) ? value[0] : value
  if (!single) {
    error.value = ''

    return
  }
  if (!validate(single)) {
    file.value = null

    return
  }
  if (props.autoUpload) {
    try {
      await upload()
    }
    catch {
      // upload() already exposes the actionable error in the component.
    }
  }
})

defineExpose({ upload, hasPendingFile: () => Boolean(selectedFile()) })
</script>

<template>
  <div>
    <VFileInput
      v-model="file"
      :label="label"
      :accept="accept"
      :loading="loading"
      :hint="hint"
      :persistent-hint="persistentHint"
      prepend-icon="ri-attachment-2"
      density="compact"
      show-size
      clearable
    />
    <VAlert
      v-if="error"
      type="error"
      variant="tonal"
      density="compact"
      class="mb-2"
      :text="error"
    />
    <a
      v-if="currentHref"
      :href="currentHref"
      target="_blank"
      rel="noopener noreferrer"
      class="text-caption text-primary"
    >
      Ver anexo atual
    </a>
  </div>
</template>
