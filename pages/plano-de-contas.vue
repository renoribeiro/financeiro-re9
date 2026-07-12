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
  finance.saveChartAccount(editing.value)
  dialog.value = false
}

// 👉 Ativar/desativar
const confirm = ref(false)
const target = ref<ChartAccount | null>(null)
function askToggle(a: ChartAccount) {
  target.value = a
  confirm.value = true
}
function doToggle() {
  if (target.value)
    finance.toggleActive('chartAccounts', target.value.id)
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
              :style="{ paddingInlineStart: `${16 + levelOf(account.code) * 20}px` }"
            >
              <template #default>
                <div class="d-flex align-center gap-2">
                  <span
                    class="text-disabled font-weight-medium"
                    style="min-inline-size: 56px;"
                  >
                    {{ account.code }}
                  </span>
                  <span :class="{ 'text-disabled': !account.isActive }">
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
