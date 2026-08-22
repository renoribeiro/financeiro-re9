<script setup lang="ts">
import { useFinanceStore } from '@/stores/finance'
import { useAppStore } from '@/stores/app'
import type { AccountType, ChartAccount } from '@/types/finance'

const finance = useFinanceStore()
const app = useAppStore()

useHead({ title: 'Plano de contas' })

const typeOrder: AccountType[] = ['revenue', 'expense', 'asset', 'liability']

interface Group {
  type: AccountType
  accounts: ChartAccount[]
}

const groups = computed<Group[]>(() => {
  return typeOrder
    .map(type => ({
      type,
      accounts: finance.companyChartAccounts
        .filter(a => a.type === type)
        .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
    }))
    .filter(g => g.accounts.length > 0)
})

/** Nível pela quantidade de pontos no code: "2.1.01" => 2. */
function levelOf(code: string): number {
  return (code.match(/\./g) ?? []).length
}

const typeOptions = typeOrder.map(value => ({ title: accountTypeLabels[value], value }))

// 👉 Dialog
const dialog = ref(false)
const formRef = ref()
const editing = ref<Partial<ChartAccount>>({})
const actionError = ref('')

const parentOptions = computed(() =>
  finance.companyChartAccounts
    .filter(a => a.id !== editing.value.id)
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
    .map(a => ({ title: `${a.code} · ${a.name}`, value: a.id })),
)

function openNew() {
  editing.value = { type: 'expense', parentId: null, isActive: true }
  dialog.value = true
}
function openEdit(a: ChartAccount) {
  editing.value = structuredClone(toRaw(a))
  dialog.value = true
}
async function save() {
  const { valid } = await formRef.value.validate()
  if (!valid)
    return
  actionError.value = ''
  try {
    await finance.saveChartAccount(editing.value)
    dialog.value = false
  }
  catch (error) {
    actionError.value = error instanceof Error ? error.message : 'Não foi possível salvar a conta contábil.'
  }
}

// 👉 Ativar/desativar
const confirm = ref(false)
const target = ref<ChartAccount | null>(null)
function askToggle(a: ChartAccount) {
  target.value = a
  confirm.value = true
}
async function doToggle() {
  if (target.value) {
    try {
      await finance.toggleActive('chartAccounts', target.value.id)
    }
    catch (error) {
      actionError.value = error instanceof Error ? error.message : 'Não foi possível alterar a conta contábil.'
    }
  }
}
</script>

<template>
  <div>
    <AppPageHeader
      title="Plano de contas"
      subtitle="Estrutura hierárquica de receitas e despesas"
      icon="ri-node-tree"
    >
      <template #actions>
        <VBtn
          v-if="!app.isReadOnly"
          prepend-icon="ri-add-line"
          @click="openNew"
        >
          Nova conta
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

    <VRow>
      <VCol
        v-for="group in groups"
        :key="group.type"
        cols="12"
        md="6"
      >
        <VCard>
          <VCardItem>
            <template #prepend>
              <VChip
                :color="accountTypeMeta[group.type].color"
                size="small"
                label
              >
                {{ accountTypeMeta[group.type].label }}
              </VChip>
            </template>
            <VCardTitle>{{ accountTypeLabels[group.type] }}</VCardTitle>
          </VCardItem>

          <VDivider />

          <VList density="compact">
            <VListItem
              v-for="account in group.accounts"
              :key="account.id"
              class="chart-account-item"
              :style="{ '--account-level': levelOf(account.code) }"
            >
              <template #default>
                <div class="chart-account-item__content d-flex align-center gap-2">
                  <span class="chart-account-item__code text-disabled font-weight-medium">
                    {{ account.code }}
                  </span>
                  <span
                    class="chart-account-item__name"
                    :class="{ 'text-disabled': !account.isActive }"
                  >
                    {{ account.name }}
                  </span>
                  <VChip
                    :color="account.isActive ? 'success' : 'secondary'"
                    size="x-small"
                    label
                  >
                    {{ account.isActive ? 'Ativo' : 'Inativo' }}
                  </VChip>
                </div>
              </template>

              <template #append>
                <div class="d-flex">
                  <IconBtn
                    v-if="!app.isReadOnly"
                    size="small"
                    aria-label="Editar conta"
                    @click="openEdit(account)"
                  >
                    <VIcon
                      icon="ri-pencil-line"
                      size="18"
                    />
                    <VTooltip activator="parent">
                      Editar
                    </VTooltip>
                  </IconBtn>
                  <IconBtn
                    v-if="!app.isReadOnly"
                    size="small"
                    :aria-label="account.isActive ? 'Desativar conta' : 'Ativar conta'"
                    @click="askToggle(account)"
                  >
                    <VIcon
                      :icon="account.isActive ? 'ri-forbid-line' : 'ri-check-line'"
                      size="18"
                    />
                    <VTooltip activator="parent">
                      {{ account.isActive ? 'Desativar' : 'Ativar' }}
                    </VTooltip>
                  </IconBtn>
                </div>
              </template>
            </VListItem>
          </VList>
        </VCard>
      </VCol>
    </VRow>

    <!-- Dialog de cadastro/edição -->
    <VDialog
      v-model="dialog"
      max-width="560"
      persistent
    >
      <VCard>
        <VCardItem>
          <VCardTitle>{{ editing.id ? 'Editar conta' : 'Nova conta' }}</VCardTitle>
        </VCardItem>
        <VCardText>
          <VForm
            ref="formRef"
            @submit.prevent="save"
          >
            <VRow>
              <VCol
                cols="12"
                md="4"
              >
                <VTextField
                  v-model="editing.code"
                  label="Código"
                  placeholder="2.1.01"
                  :rules="[requiredRule]"
                />
              </VCol>
              <VCol
                cols="12"
                md="8"
              >
                <VTextField
                  v-model="editing.name"
                  label="Nome"
                  :rules="[requiredRule]"
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
                md="6"
              >
                <VSelect
                  v-model="editing.parentId"
                  label="Conta-pai"
                  :items="parentOptions"
                  clearable
                />
              </VCol>
              <VCol cols="12">
                <VSwitch
                  v-model="editing.isActive"
                  label="Conta ativa"
                  color="success"
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
      :title="target?.isActive ? 'Desativar conta' : 'Ativar conta'"
      :message="`Deseja ${target?.isActive ? 'desativar' : 'ativar'} a conta ${target?.code} · ${target?.name}?`"
      @confirm="doToggle"
    />
  </div>
</template>

<style lang="scss" scoped>
.chart-account-item {
  padding-inline-start: calc(1rem + var(--account-level) * 1.25rem) !important;
}

.chart-account-item__content {
  min-inline-size: 0;
}

.chart-account-item__code {
  min-inline-size: 3.5rem;
}

.chart-account-item__name {
  min-inline-size: 0;
  overflow-wrap: anywhere;
}

@media (max-width: 599.98px) {
  .chart-account-item {
    align-items: flex-start;
    padding-block: 0.5rem !important;
    padding-inline-start: calc(0.5rem + var(--account-level) * 0.75rem) !important;
    padding-inline-end: 0.25rem !important;
  }

  .chart-account-item__content {
    align-items: flex-start !important;
    flex-wrap: wrap;
    gap: 0.375rem 0.5rem !important;
  }

  .chart-account-item__code {
    min-inline-size: 3rem;
  }

  .chart-account-item__name {
    flex: 1 1 calc(100% - 3.5rem);
  }

  .chart-account-item :deep(.v-list-item__append) {
    align-self: flex-start;
    margin-inline-start: 0.25rem;
  }
}
</style>
