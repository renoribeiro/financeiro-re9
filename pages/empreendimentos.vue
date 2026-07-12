<script setup lang="ts">
import { useFinanceStore } from '@/stores/finance'
import { useAppStore } from '@/stores/app'
import type { Development } from '@/types/finance'

const finance = useFinanceStore()
const app = useAppStore()

useHead({ title: 'Empreendimentos' })

const search = ref('')
const statusFilter = ref<'all' | 'active' | 'inactive'>('all')

const filtered = computed(() => {
  return finance.companyDevelopments.filter(dv => {
    const matchesSearch = !search.value
      || dv.name.toLowerCase().includes(search.value.toLowerCase())
      || dv.developer.toLowerCase().includes(search.value.toLowerCase())
      || (dv.address ?? '').toLowerCase().includes(search.value.toLowerCase())

    const matchesStatus = statusFilter.value === 'all'
      || (statusFilter.value === 'active' && dv.isActive)
      || (statusFilter.value === 'inactive' && !dv.isActive)

    return matchesSearch && matchesStatus
  })
})

const typeOptions = Object.entries(developmentTypeLabels).map(([value, title]) => ({ title, value }))

// 👉 Dialog
const dialog = ref(false)
const formRef = ref()
const editing = ref<Partial<Development>>({})

function openNew() {
  editing.value = { type: 'launch', commissionPercentage: 0, brokerSplitPercentage: 0, isActive: true }
  dialog.value = true
}
function openEdit(dv: Development) {
  editing.value = structuredClone(toRaw(dv))
  dialog.value = true
}
async function save() {
  const { valid } = await formRef.value.validate()
  if (!valid)
    return
  finance.saveDevelopment(editing.value)
  dialog.value = false
}

// 👉 Ativar/desativar
const confirm = ref(false)
const target = ref<Development | null>(null)
function askToggle(dv: Development) {
  target.value = dv
  confirm.value = true
}
function doToggle() {
  if (target.value)
    finance.toggleActive('developments', target.value.id)
}

// nota explicativa conforme o tipo selecionado no dialog
const commissionHint = computed(() => {
  if (editing.value.type === 'launch') {
    return 'Lançamento: a construtora paga a comissão integral à imobiliária, '
      + 'que repassa a fatia definida abaixo ao corretor (gera conta a receber da construtora + conta a pagar de repasse).'
  }

  return 'Avulso: a imobiliária recebe a comissão (do comprador ou consolidada) '
    + 'e repassa a fatia definida ao corretor conforme a regra de recebimento.'
})
</script>

<template>
  <div>
    <AppPageHeader
      title="Empreendimentos"
      subtitle="Cadastro de empreendimentos e regras de comissão"
      icon="ri-building-line"
    >
      <template #actions>
        <VBtn
          v-if="app.canManageFinance"
          prepend-icon="ri-add-line"
          @click="openNew"
        >
          Novo empreendimento
        </VBtn>
      </template>
    </AppPageHeader>

    <VCard>
      <VCardText class="d-flex flex-wrap gap-4">
        <VTextField
          v-model="search"
          aria-label="Buscar por nome, construtora ou endereço"
          placeholder="Buscar por nome, construtora ou endereço"
          prepend-inner-icon="ri-search-line"
          density="compact"
          style="max-inline-size: 320px;"
          clearable
        />
        <VSpacer />
        <VBtnToggle
          v-model="statusFilter"
          density="compact"
          color="primary"
          mandatory
          variant="outlined"
        >
          <VBtn value="all">
            Todos
          </VBtn>
          <VBtn value="active">
            Ativos
          </VBtn>
          <VBtn value="inactive">
            Inativos
          </VBtn>
        </VBtnToggle>
      </VCardText>

      <VDivider />

      <VCardText>
        <VRow v-if="filtered.length">
          <VCol
            v-for="dv in filtered"
            :key="dv.id"
            cols="12"
            md="6"
          >
            <VCard
              variant="outlined"
              :class="{ 'opacity-60': !dv.isActive }"
            >
              <VCardItem>
                <template #prepend>
                  <VAvatar
                    color="primary"
                    variant="tonal"
                    rounded
                  >
                    <VIcon icon="ri-building-2-line" />
                  </VAvatar>
                </template>
                <VCardTitle>{{ dv.name }}</VCardTitle>
                <VCardSubtitle>{{ dv.developer }}</VCardSubtitle>
                <template #append>
                  <VChip
                    :color="dv.type === 'launch' ? 'primary' : 'info'"
                    size="small"
                    label
                  >
                    {{ developmentTypeLabels[dv.type] }}
                  </VChip>
                </template>
              </VCardItem>

              <VCardText>
                <div
                  v-if="dv.address"
                  class="text-body-2 mb-3"
                >
                  <VIcon
                    icon="ri-map-pin-line"
                    size="14"
                  /> {{ dv.address }}
                </div>

                <VRow dense>
                  <VCol cols="6">
                    <div class="text-caption text-disabled">
                      % construtora paga
                    </div>
                    <div class="font-weight-medium">
                      {{ formatPercent(dv.commissionPercentage) }}
                    </div>
                  </VCol>
                  <VCol cols="6">
                    <div class="text-caption text-disabled">
                      % repasse ao corretor
                    </div>
                    <div class="font-weight-medium">
                      {{ formatPercent(dv.brokerSplitPercentage) }}
                    </div>
                  </VCol>
                </VRow>

                <div class="mt-3">
                  <VChip
                    :color="dv.isActive ? 'success' : 'secondary'"
                    size="small"
                    label
                  >
                    {{ dv.isActive ? 'Ativo' : 'Inativo' }}
                  </VChip>
                </div>
              </VCardText>

              <template v-if="app.canManageFinance">
                <VDivider />
                <VCardActions>
                  <VSpacer />
                  <IconBtn
                    aria-label="Editar empreendimento"
                    @click="openEdit(dv)"
                  >
                    <VIcon icon="ri-pencil-line" />
                    <VTooltip activator="parent">
                      Editar
                    </VTooltip>
                  </IconBtn>
                  <IconBtn
                    :aria-label="dv.isActive ? 'Desativar empreendimento' : 'Ativar empreendimento'"
                    @click="askToggle(dv)"
                  >
                    <VIcon :icon="dv.isActive ? 'ri-forbid-line' : 'ri-check-line'" />
                    <VTooltip activator="parent">
                      {{ dv.isActive ? 'Desativar' : 'Ativar' }}
                    </VTooltip>
                  </IconBtn>
                </VCardActions>
              </template>
            </VCard>
          </VCol>
        </VRow>

        <div
          v-else
          class="text-center py-8 text-disabled"
        >
          Nenhum empreendimento encontrado
        </div>
      </VCardText>
    </VCard>

    <!-- Dialog de cadastro/edição -->
    <VDialog
      v-model="dialog"
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
                  suffix="%"
                  :rules="[percentRule]"
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
                  suffix="%"
                  :rules="[percentRule]"
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
            @click="dialog = false"
          >
            Cancelar
          </VBtn>
          <VBtn @click="save">
            Salvar
          </VBtn>
        </VCardText>
      </VCard>
    </VDialog>

    <ConfirmDialog
      v-model="confirm"
      :title="target?.isActive ? 'Desativar empreendimento' : 'Ativar empreendimento'"
      :message="`Deseja ${target?.isActive ? 'desativar' : 'ativar'} ${target?.name}?`"
      @confirm="doToggle"
    />
  </div>
</template>
