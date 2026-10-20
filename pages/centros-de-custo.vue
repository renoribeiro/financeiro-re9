<script setup lang="ts">
import { useFinanceStore } from '@/stores/finance'
import { useAppStore } from '@/stores/app'
import type { CostCenter } from '@/types/finance'

const finance = useFinanceStore()
const app = useAppStore()

useHead({ title: 'Centros de custo' })

interface CostCenterRow extends CostCenter {
  revenue: number
  expense: number
  result: number
}

const rows = computed<CostCenterRow[]>(() => {
  return finance.companyCostCenters.map(cc => {
    const transactions = finance.companyTransactions.filter(t => finance.transactionCostCenterId(t) === cc.id)
    const revenue = transactions.reduce((sum, transaction) => sum + transactionIncome(transaction), 0)
    const expense = transactions.reduce((sum, transaction) => sum + transactionExpense(transaction), 0)

    return { ...cc, revenue, expense, result: revenue - expense }
  })
})

const headers = [
  { title: 'Centro de custo', key: 'name' },
  { title: 'Descrição', key: 'description', sortable: false },
  { title: 'Receitas', key: 'revenue', align: 'end' as const },
  { title: 'Despesas', key: 'expense', align: 'end' as const },
  { title: 'Resultado', key: 'result', align: 'end' as const },
  { title: 'Status', key: 'isActive' },
  { title: '', key: 'actions', sortable: false, align: 'end' as const },
]

// 👉 Dialog
const dialog = ref(false)
const formRef = ref()
const editing = ref<Partial<CostCenter>>({})
const formError = ref('')
const saving = ref(false)
const guard = useDiscardGuard(() => editing.value)

function openNew() {
  editing.value = { isActive: true }
  formError.value = ''
  guard.arm()
  dialog.value = true
}
function openEdit(c: CostCenter) {
  editing.value = structuredClone(toRaw(c))
  formError.value = ''
  guard.arm()
  dialog.value = true
}
function closeDialog() {
  guard.requestClose(() => {
    dialog.value = false
  })
}
async function save() {
  if (saving.value)
    return
  const { valid } = await formRef.value.validate()
  if (!valid)
    return
  formError.value = ''
  saving.value = true
  try {
    await finance.saveCostCenter(editing.value)
    dialog.value = false
  }
  catch (error) {
    formError.value = error instanceof Error ? error.message : 'Não foi possível salvar o centro de custo.'
  }
  finally {
    saving.value = false
  }
}

// 👉 Ativar/desativar
const confirm = ref(false)
const target = ref<CostCenter | null>(null)
function askToggle(c: CostCenter) {
  target.value = c
  confirm.value = true
}

// Erros aparecem dentro do diálogo de confirmação (ele só fecha no sucesso).
async function doToggle() {
  if (target.value)
    await finance.toggleActive('costCenters', target.value.id)
}
</script>

<template>
  <div>
    <AppPageHeader
      title="Centros de custo"
      subtitle="Resultado por centro de custo"
      icon="ri-pie-chart-line"
    >
      <template #actions>
        <VBtn
          v-if="!app.isReadOnly"
          prepend-icon="ri-add-line"
          @click="openNew"
        >
          Novo centro de custo
        </VBtn>
      </template>
    </AppPageHeader>

    <VCard>
      <VDataTable
        :headers="headers"
        :items="rows"
        :items-per-page="10"
        item-value="id"
        class="text-no-wrap"
      >
        <template #item.name="{ item }">
          <span class="font-weight-medium">{{ item.name }}</span>
        </template>

        <template #item.description="{ item }">
          <span :class="{ 'text-disabled': !item.description }">
            {{ item.description || '—' }}
          </span>
        </template>

        <template #item.revenue="{ item }">
          <span class="text-success">{{ formatBRL(item.revenue) }}</span>
        </template>

        <template #item.expense="{ item }">
          <span class="text-error">{{ formatBRL(item.expense) }}</span>
        </template>

        <template #item.result="{ item }">
          <span
            :class="item.result >= 0 ? 'text-success' : 'text-error'"
            class="font-weight-medium"
          >
            {{ formatBRL(item.result) }}
          </span>
        </template>

        <template #item.isActive="{ item }">
          <VChip
            :color="item.isActive ? 'success' : 'secondary'"
            size="small"
            label
          >
            {{ item.isActive ? 'Ativo' : 'Inativo' }}
          </VChip>
        </template>

        <template #item.actions="{ item }">
          <div class="d-flex justify-end">
            <IconBtn
              v-if="!app.isReadOnly"
              aria-label="Editar centro de custo"
              @click="openEdit(item)"
            >
              <VIcon icon="ri-pencil-line" />
              <VTooltip activator="parent">
                Editar
              </VTooltip>
            </IconBtn>
            <IconBtn
              v-if="!app.isReadOnly"
              :aria-label="item.isActive ? 'Desativar centro de custo' : 'Ativar centro de custo'"
              @click="askToggle(item)"
            >
              <VIcon :icon="item.isActive ? 'ri-forbid-line' : 'ri-check-line'" />
              <VTooltip activator="parent">
                {{ item.isActive ? 'Desativar' : 'Ativar' }}
              </VTooltip>
            </IconBtn>
          </div>
        </template>

        <template #no-data>
          <div class="text-center py-8 text-disabled">
            Nenhum centro de custo encontrado
          </div>
        </template>
      </VDataTable>
    </VCard>

    <!-- Dialog de cadastro/edição -->
    <VDialog
      v-model="dialog"
      max-width="520"
      persistent
    >
      <VCard>
        <VCardItem>
          <VCardTitle>{{ editing.id ? 'Editar centro de custo' : 'Novo centro de custo' }}</VCardTitle>
        </VCardItem>
        <VCardText>
          <DialogCompanyContext class="mb-4" />
          <VAlert
            v-if="formError"
            type="error"
            variant="tonal"
            density="compact"
            class="mb-4"
            role="alert"
            :text="formError"
          />
          <VForm
            ref="formRef"
            @submit.prevent="save"
          >
            <VRow>
              <VCol cols="12">
                <VTextField
                  v-model="editing.name"
                  label="Nome"
                  :rules="[requiredRule]"
                />
              </VCol>
              <VCol cols="12">
                <VTextarea
                  v-model="editing.description"
                  label="Descrição"
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
            @click="closeDialog"
          >
            Cancelar
          </VBtn>
          <VBtn
            :loading="saving"
            :disabled="saving"
            @click="save"
          >
            Salvar
          </VBtn>
        </VCardText>
      </VCard>
    </VDialog>

    <ConfirmDialog
      v-model="confirm"
      :title="target?.isActive ? 'Desativar centro de custo' : 'Ativar centro de custo'"
      :message="`Deseja ${target?.isActive ? 'desativar' : 'ativar'} ${target?.name}?`"
      :confirm-text="target?.isActive ? 'Desativar' : 'Ativar'"
      :confirm-color="target?.isActive ? 'error' : 'primary'"
      :action="doToggle"
    />
    <ConfirmDialog
      v-model="guard.prompt.value"
      v-bind="guard.dialogProps"
      :action="guard.discard"
    />
  </div>
</template>
