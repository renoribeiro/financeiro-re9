<script setup lang="ts">
import { useFinanceStore } from '@/stores/finance'
import type { Development } from '@/types/finance'
import { createDevelopmentDraft } from '@/utils/developmentDefaults'

const props = defineProps<{
  development?: Development | null
}>()

const emit = defineEmits<{
  saved: [development: Development]
}>()

const open = defineModel<boolean>({ default: false })

const finance = useFinanceStore()
const formRef = ref()
const editing = ref<Partial<Development>>(createDevelopmentDraft())
const saving = ref(false)
const formError = ref('')

const typeOptions = Object.entries(developmentTypeLabels).map(([value, title]) => ({ title, value }))

const commissionHint = computed(() => {
  if (editing.value.type === 'launch') {
    return 'Lançamento: a construtora paga a comissão integral à imobiliária, '
      + 'que repassa a fatia definida abaixo ao corretor (gera conta a receber da construtora + conta a pagar de repasse).'
  }

  return 'Avulso: a imobiliária recebe a comissão (do comprador ou consolidada) '
    + 'e repassa a fatia definida ao corretor conforme a regra de recebimento.'
})

function resetForm() {
  editing.value = createDevelopmentDraft(props.development)
  formError.value = ''
  nextTick(() => formRef.value?.resetValidation())
}

watch(open, value => {
  if (value)
    resetForm()
})

watch(() => props.development, () => {
  if (open.value)
    resetForm()
})

function close() {
  if (!saving.value)
    open.value = false
}

async function save() {
  const { valid } = await formRef.value.validate()
  if (!valid)
    return

  saving.value = true
  formError.value = ''
  try {
    const saved = await finance.saveDevelopment(editing.value)
    if (!saved)
      throw new Error('Seu perfil não permite cadastrar empreendimentos.')

    emit('saved', saved)
    open.value = false
  }
  catch (error) {
    formError.value = (error as Error).message
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <VDialog
    v-model="open"
    max-width="640"
    persistent
  >
    <VCard>
      <VCardItem>
        <VCardTitle>{{ editing.id ? 'Editar empreendimento' : 'Novo empreendimento' }}</VCardTitle>
      </VCardItem>

      <VCardText>
        <VForm
          ref="formRef"
          @submit.prevent="save"
        >
          <VAlert
            v-if="formError"
            type="error"
            variant="tonal"
            density="compact"
            class="mb-4"
            :text="formError"
          />

          <VRow>
            <VCol
              cols="12"
              md="6"
            >
              <VTextField
                v-model="editing.name"
                label="Nome do empreendimento"
                :rules="[requiredRule]"
              />
            </VCol>
            <VCol
              cols="12"
              md="6"
            >
              <VTextField
                v-model="editing.developer"
                label="Construtora / Incorporadora"
                :rules="[requiredRule]"
              />
            </VCol>
            <VCol cols="12">
              <VTextField
                v-model="editing.address"
                label="Endereço"
              />
            </VCol>
            <VCol
              cols="12"
              md="6"
            >
              <VSelect
                v-model="editing.type"
                label="Tipo"
                :items="typeOptions"
                :rules="[requiredRule]"
              />
            </VCol>
            <VCol
              cols="12"
              md="3"
            >
              <VTextField
                v-model.number="editing.commissionPercentage"
                label="% construtora paga"
                type="number"
                min="0"
                max="100"
                suffix="%"
                :rules="[requiredRule, percentRule]"
              />
            </VCol>
            <VCol
              cols="12"
              md="3"
            >
              <VTextField
                v-model.number="editing.brokerSplitPercentage"
                label="% repasse ao corretor"
                type="number"
                min="0"
                max="100"
                suffix="%"
                :rules="[requiredRule, percentRule]"
              />
            </VCol>
            <VCol cols="12">
              <VAlert
                type="info"
                variant="tonal"
                density="compact"
              >
                {{ commissionHint }}
              </VAlert>
            </VCol>
            <VCol cols="12">
              <VTextarea
                v-model="editing.notes"
                label="Observações"
                rows="2"
              />
            </VCol>
          </VRow>
        </VForm>
      </VCardText>

      <VCardText class="d-flex justify-end gap-3 pt-0">
        <VBtn
          variant="tonal"
          color="secondary"
          :disabled="saving"
          @click="close"
        >
          Cancelar
        </VBtn>
        <VBtn
          :loading="saving"
          @click="save"
        >
          Salvar
        </VBtn>
      </VCardText>
    </VCard>
  </VDialog>
</template>
