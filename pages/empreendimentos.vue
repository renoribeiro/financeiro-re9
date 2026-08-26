<script setup lang="ts">
import { useFinanceStore } from '@/stores/finance'
import { useAppStore } from '@/stores/app'
import type { Development } from '@/types/finance'
import { developmentMatchesSearch } from '@/utils/developmentSearch'

const finance = useFinanceStore()
const app = useAppStore()

useHead({ title: 'Empreendimentos' })

const search = ref('')
const statusFilter = ref<'all' | 'active' | 'inactive'>('all')

const filtered = computed(() => {
  return finance.companyDevelopments.filter(dv => {
    const matchesSearch = developmentMatchesSearch(dv, search.value)

    const matchesStatus = statusFilter.value === 'all'
      || (statusFilter.value === 'active' && dv.isActive)
      || (statusFilter.value === 'inactive' && !dv.isActive)

    return matchesSearch && matchesStatus
  })
})

// 👉 Dialog
const dialog = ref(false)
const editing = ref<Development | null>(null)
const actionError = ref('')

function openNew() {
  editing.value = null
  dialog.value = true
}
function openEdit(dv: Development) {
  editing.value = dv
  dialog.value = true
}

// 👉 Ativar/desativar
const confirm = ref(false)
const target = ref<Development | null>(null)
function askToggle(dv: Development) {
  target.value = dv
  confirm.value = true
}
async function doToggle() {
  if (target.value) {
    try {
      await finance.toggleActive('developments', target.value.id)
    }
    catch (error) {
      actionError.value = error instanceof Error ? error.message : 'Não foi possível alterar o empreendimento.'
    }
  }
}
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

    <VAlert
      v-if="actionError"
      type="error"
      variant="tonal"
      class="mb-4"
      :text="actionError"
    />

    <VCard>
      <VCardText class="d-flex flex-wrap gap-4 align-center">
        <VTextField
          v-model="search"
          class="development-search"
          aria-label="Buscar por nome, construtora ou endereço"
          placeholder="Buscar por nome, construtora ou endereço"
          prepend-inner-icon="ri-search-line"
          density="compact"
          style="max-inline-size: 320px;"
          clearable
          hide-details
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
                      % da venda ao corretor
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

    <CommercialDevelopmentFormDialog
      v-model="dialog"
      :development="editing"
    />

    <ConfirmDialog
      v-model="confirm"
      :title="target?.isActive ? 'Desativar empreendimento' : 'Ativar empreendimento'"
      :message="`Deseja ${target?.isActive ? 'desativar' : 'ativar'} ${target?.name}?`"
      @confirm="doToggle"
    />
  </div>
</template>

<style scoped>
:deep(.development-search .v-field__input) {
  align-items: center;
  min-block-size: var(--v-input-control-height);
  padding-block: 0;
}

:deep(.development-search .v-field__input > input) {
  align-self: center;
}
</style>
