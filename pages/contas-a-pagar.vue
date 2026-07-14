<script setup lang="ts">
import { useFinanceStore } from '@/stores/finance'
import { useAppStore } from '@/stores/app'
import { inMonth } from '@/utils/dateFilter'
import type { Payable } from '@/types/finance'

const finance = useFinanceStore()
const app = useAppStore()

useHead({ title: 'Contas a Pagar' })

const search = ref('')
const statusFilter = ref<string>('all')
const costCenterFilter = ref<string | null>(null)
const monthFilter = ref('all')

const dueDates = computed(() => finance.companyPayables.map(p => p.dueDate))

const filtered = computed(() => finance.companyPayables.filter(p => {
  const text = `${p.description} ${finance.supplierName(p.supplierId)} ${finance.employeeName(p.employeeId)}`.toLowerCase()
  const okSearch = !search.value || text.includes(search.value.toLowerCase())
  const okStatus = statusFilter.value === 'all' || p.status === statusFilter.value
  const okCC = !costCenterFilter.value || p.costCenterId === costCenterFilter.value
  const okMonth = inMonth(p.dueDate, monthFilter.value)

  return okSearch && okStatus && okCC && okMonth
}).sort((a, b) => a.dueDate.localeCompare(b.dueDate)))

const open = computed(() => finance.companyPayables.filter(p => p.status === 'open'))
const overdue = computed(() => finance.companyPayables.filter(p => p.status === 'overdue'))

// "Total cadastrado" desconsidera cancelados (não representam obrigação real)
const registered = computed(() => finance.companyPayables.filter(p => p.status !== 'cancelled'))
const sum = (arr: Payable[]) => arr.reduce((s, p) => s + p.amount, 0)

const paidThisMonth = computed(() => {
  const ms = new Date()

  ms.setDate(1)
  ms.setHours(0, 0, 0, 0)

  return finance.companyPayables.filter(p => p.status === 'paid' && p.paidAt && new Date(p.paidAt) >= ms)
})

const headers = [
  { title: 'Descrição', key: 'description' },
  { title: 'Categoria', key: 'categoryId' },
  { title: 'Centro de custo', key: 'costCenterId' },
  { title: 'Vencimento', key: 'dueDate' },
  { title: 'Valor', key: 'amount', align: 'end' as const },
  { title: 'Status', key: 'status' },
  { title: '', key: 'actions', sortable: false, align: 'end' as const },
]

const statusItems = [
  { title: 'Todos', value: 'all' },
  { title: 'Em aberto', value: 'open' },
  { title: 'Vencido', value: 'overdue' },
  { title: 'Pago', value: 'paid' },
  { title: 'Cancelado', value: 'cancelled' },
]

const categoryOptions = computed(() => finance.companyChartAccounts.filter(a => a.type === 'expense' && a.parentId).map(a => ({ title: `${a.code} · ${a.name}`, value: a.id })))
const costCenterOptions = computed(() => finance.companyCostCenters.map(c => ({ title: c.name, value: c.id })))
const supplierOptions = computed(() => finance.companySuppliers.filter(s => s.isActive).map(s => ({ title: s.tradeName || s.legalName, value: s.id })))
const employeeOptions = computed(() => finance.companyEmployees.map(e => ({ title: e.fullName, value: e.id })))
const recurrenceOptions = Object.entries(recurrenceLabels).map(([value, title]) => ({ title, value }))

// 👉 Dialog form
const dialog = ref(false)
const formRef = ref()
const editing = ref<Partial<Payable>>({})
const beneficiaryKind = ref<'supplier' | 'employee'>('supplier')
const installmentMode = ref(false)
const installmentCount = ref(3)

function openNew() {
  editing.value = { recurrence: 'once', dueDate: todayISO(), status: 'open', amount: undefined }
  beneficiaryKind.value = 'supplier'
  installmentMode.value = false
  installmentCount.value = 3
  dialog.value = true
}
function openEdit(p: Payable) {
  editing.value = structuredClone(toRaw(p))

  // "overdue" é um status DERIVADO (nunca persistido) — não gravar de volta
  if (editing.value.status === 'overdue')
    editing.value.status = 'open'
  beneficiaryKind.value = p.employeeId ? 'employee' : 'supplier'
  installmentMode.value = false
  dialog.value = true
}
async function save() {
  const { valid } = await formRef.value.validate()
  if (!valid)
    return
  const data = { ...editing.value }
  if (beneficiaryKind.value === 'supplier')
    data.employeeId = undefined
  else
    data.supplierId = undefined

  if (!data.id && installmentMode.value && installmentCount.value > 1)
    finance.createInstallmentPayable(data, installmentCount.value)
  else
    finance.savePayable(data)
  dialog.value = false
}

// 👉 Pagar
const payDialog = ref(false)
const payTarget = ref<Payable | null>(null)
const payAmount = ref<number>(0)
const payProof = ref('')
function openPay(p: Payable) {
  payTarget.value = p
  payAmount.value = p.amount
  payProof.value = ''
  payDialog.value = true
}
function doPay() {
  if (payTarget.value)
    finance.payPayable(payTarget.value.id, { amount: payAmount.value, proofUrl: payProof.value || undefined })
  payDialog.value = false
}

// 👉 Cancelar
const cancelDialog = ref(false)
const cancelTarget = ref<Payable | null>(null)
function askCancel(p: Payable) {
  cancelTarget.value = p
  cancelDialog.value = true
}

// 👉 Recorrências
const snackbar = ref(false)
const snackbarText = ref('')
function runRecurrences() {
  const n = finance.generateRecurrences()

  snackbarText.value = n > 0
    ? `${n} lançamento(s) recorrente(s) gerado(s).`
    : 'Nenhuma recorrência pendente.'
  snackbar.value = true
}
</script>

<template>
  <div>
    <AppPageHeader
      title="Contas a Pagar"
      subtitle="Gestão de pagamentos, recorrências e parcelas"
      icon="ri-arrow-up-circle-line"
    >
      <template #actions>
        <VBtn
          v-if="!app.isReadOnly"
          variant="tonal"
          prepend-icon="ri-refresh-line"
          @click="runRecurrences"
        >
          Gerar recorrências
        </VBtn>
        <VBtn
          v-if="!app.isReadOnly"
          prepend-icon="ri-add-line"
          @click="openNew"
        >
          Nova conta
        </VBtn>
      </template>
    </AppPageHeader>

    <VSnackbar
      v-model="snackbar"
      :timeout="3000"
      location="top end"
      color="primary"
    >
      {{ snackbarText }}
    </VSnackbar>

    <VRow class="match-height mb-1">
      <VCol
        cols="12"
        sm="6"
        lg="3"
      >
        <KpiCard
          title="Em aberto"
          :value="formatBRL(sum(open))"
          icon="ri-time-line"
          color="info"
          :subtitle="`${open.length} conta(s)`"
        />
      </VCol>
      <VCol
        cols="12"
        sm="6"
        lg="3"
      >
        <KpiCard
          title="Vencidas"
          :value="formatBRL(sum(overdue))"
          icon="ri-alarm-warning-line"
          color="error"
          :subtitle="`${overdue.length} conta(s)`"
        />
      </VCol>
      <VCol
        cols="12"
        sm="6"
        lg="3"
      >
        <KpiCard
          title="Pago no mês"
          :value="formatBRL(sum(paidThisMonth))"
          icon="ri-checkbox-circle-line"
          color="success"
          :subtitle="`${paidThisMonth.length} pagamento(s)`"
        />
      </VCol>
      <VCol
        cols="12"
        sm="6"
        lg="3"
      >
        <KpiCard
          title="Total cadastrado"
          :value="formatBRL(sum(registered))"
          icon="ri-stack-line"
          color="primary"
          :subtitle="`${registered.length} lançamento(s)`"
        />
      </VCol>
    </VRow>

    <VCard>
      <VCardText class="d-flex flex-wrap gap-4 align-center">
        <VTextField
          v-model="search"
          aria-label="Buscar descrição ou fornecedor"
          placeholder="Buscar descrição/fornecedor"
          prepend-inner-icon="ri-search-line"
          density="compact"
          style="max-inline-size: 280px;"
          clearable
        />
        <VSelect
          v-model="statusFilter"
          :items="statusItems"
          density="compact"
          label="Status"
          style="max-inline-size: 180px;"
        />
        <VSelect
          v-model="costCenterFilter"
          :items="costCenterOptions"
          density="compact"
          label="Centro de custo"
          style="max-inline-size: 240px;"
          clearable
        />
        <MonthFilter
          v-model="monthFilter"
          :dates="dueDates"
        />
      </VCardText>
      <VDivider />

      <VDataTable
        :headers="headers"
        :items="filtered"
        :items-per-page="10"
        item-value="id"
        class="text-no-wrap"
      >
        <template #item.description="{ item }">
          <div class="py-2">
            <div class="font-weight-medium">
              {{ item.description }}
            </div>
            <div class="text-caption text-disabled">
              {{ item.supplierId ? finance.supplierName(item.supplierId) : finance.employeeName(item.employeeId) }}
              <template v-if="item.totalInstallments">
                · parcela {{ item.installmentNumber }}/{{ item.totalInstallments }}
              </template>
              <template v-else-if="item.recurrence !== 'once'">
                · {{ recurrenceLabels[item.recurrence] }}
              </template>
            </div>
          </div>
        </template>
        <template #item.categoryId="{ item }">
          {{ finance.accountName(item.categoryId) }}
        </template>
        <template #item.costCenterId="{ item }">
          {{ finance.costCenterName(item.costCenterId) }}
        </template>
        <template #item.dueDate="{ item }">
          <div>
            {{ formatDate(item.dueDate) }}
            <div
              v-if="item.status === 'overdue'"
              class="text-caption text-error"
            >
              {{ Math.abs(daysUntil(item.dueDate)) }} dia(s) em atraso
            </div>
            <div
              v-else-if="item.status === 'open' && daysUntil(item.dueDate) <= 7"
              class="text-caption text-warning"
            >
              vence em {{ daysUntil(item.dueDate) }} dia(s)
            </div>
          </div>
        </template>
        <template #item.amount="{ item }">
          <span class="font-weight-medium">{{ formatBRL(item.amount) }}</span>
        </template>
        <template #item.status="{ item }">
          <StatusChip
            :value="item.status"
            :map="payableStatusMeta"
          />
        </template>
        <template #item.actions="{ item }">
          <div class="d-flex justify-end">
            <IconBtn
              v-if="!app.isReadOnly && ['open', 'overdue'].includes(item.status)"
              color="success"
              @click="openPay(item)"
            >
              <VIcon icon="ri-check-double-line" />
              <VTooltip activator="parent">
                Dar baixa
              </VTooltip>
            </IconBtn>
            <IconBtn
              v-if="!app.isReadOnly && item.status !== 'paid'"
              aria-label="Editar lançamento"
              @click="openEdit(item)"
            >
              <VIcon icon="ri-pencil-line" />
              <VTooltip activator="parent">
                Editar
              </VTooltip>
            </IconBtn>
            <IconBtn
              v-if="!app.isReadOnly && ['open', 'overdue'].includes(item.status)"
              aria-label="Cancelar lançamento"
              @click="askCancel(item)"
            >
              <VIcon icon="ri-close-circle-line" />
              <VTooltip activator="parent">
                Cancelar
              </VTooltip>
            </IconBtn>
            <IconBtn
              v-if="item.proofUrl"
              :href="item.proofUrl"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Ver comprovante"
            >
              <VIcon icon="ri-attachment-2" />
              <VTooltip activator="parent">
                Ver comprovante
              </VTooltip>
            </IconBtn>
          </div>
        </template>
        <template #no-data>
          <div class="text-center py-8 text-disabled">
            Nenhuma conta encontrada
          </div>
        </template>
      </VDataTable>
    </VCard>

    <!-- Dialog cadastro -->
    <VDialog
      v-model="dialog"
      max-width="680"
      persistent
    >
      <VCard>
        <VCardItem>
          <VCardTitle>{{ editing.id ? 'Editar conta a pagar' : 'Nova conta a pagar' }}</VCardTitle>
        </VCardItem>
        <VCardText>
          <VForm
            ref="formRef"
            @submit.prevent="save"
          >
            <VRow>
              <VCol cols="12">
                <VBtnToggle
                  v-model="beneficiaryKind"
                  density="compact"
                  color="primary"
                  mandatory
                  variant="outlined"
                >
                  <VBtn value="supplier">
                    Fornecedor
                  </VBtn>
                  <VBtn value="employee">
                    Colaborador
                  </VBtn>
                </VBtnToggle>
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VSelect
                  v-if="beneficiaryKind === 'supplier'"
                  v-model="editing.supplierId"
                  label="Fornecedor"
                  :items="supplierOptions"
                  clearable
                />
                <VSelect
                  v-else
                  v-model="editing.employeeId"
                  label="Colaborador"
                  :items="employeeOptions"
                  clearable
                />
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VTextField
                  v-model="editing.description"
                  label="Descrição"
                  :rules="[requiredRule]"
                />
              </VCol>
              <VCol
                cols="12"
                md="4"
              >
                <VTextField
                  v-model.number="editing.amount"
                  label="Valor (R$)"
                  type="number"
                  prefix="R$"
                  :rules="[requiredRule, positiveRule]"
                />
              </VCol>
              <VCol
                cols="12"
                md="4"
              >
                <VTextField
                  v-model="editing.dueDate"
                  label="Vencimento"
                  type="date"
                  :rules="[requiredRule]"
                />
              </VCol>
              <VCol
                cols="12"
                md="4"
              >
                <VTextField
                  v-model="editing.competenceDate"
                  label="Competência"
                  type="date"
                />
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VSelect
                  v-model="editing.categoryId"
                  label="Categoria"
                  :items="categoryOptions"
                  clearable
                />
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VSelect
                  v-model="editing.costCenterId"
                  label="Centro de custo"
                  :items="costCenterOptions"
                  clearable
                />
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VSelect
                  v-model="editing.recurrence"
                  label="Recorrência"
                  :items="recurrenceOptions"
                />
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VTextField
                  v-model="editing.proofUrl"
                  label="Anexo (URL boleto/nota)"
                  placeholder="https://..."
                />
              </VCol>
              <VCol
                v-if="!editing.id"
                cols="12"
              >
                <VCheckbox
                  v-model="installmentMode"
                  label="Parcelar esta conta"
                />
                <VTextField
                  v-if="installmentMode"
                  v-model.number="installmentCount"
                  label="Número de parcelas (mensais)"
                  type="number"
                  style="max-inline-size: 260px;"
                />
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

    <!-- Dialog baixa -->
    <VDialog
      v-model="payDialog"
      max-width="440"
    >
      <VCard>
        <VCardItem>
          <VCardTitle>Dar baixa no pagamento</VCardTitle>
        </VCardItem>
        <VCardText>
          <p class="mb-4">
            {{ payTarget?.description }}
          </p>
          <VTextField
            v-model.number="payAmount"
            label="Valor pago"
            type="number"
            prefix="R$"
            class="mb-3"
          />
          <FileUpload
            v-model="payProof"
            label="Comprovante do pagamento"
          />
        </VCardText>
        <VCardText class="d-flex justify-end gap-3 pt-0">
          <VBtn
            variant="tonal"
            color="secondary"
            @click="payDialog = false"
          >
            Cancelar
          </VBtn>
          <VBtn
            color="success"
            @click="doPay"
          >
            Confirmar pagamento
          </VBtn>
        </VCardText>
      </VCard>
    </VDialog>

    <ConfirmDialog
      v-model="cancelDialog"
      title="Cancelar conta"
      :message="`Deseja cancelar '${cancelTarget?.description}'?`"
      confirm-text="Cancelar conta"
      confirm-color="error"
      @confirm="cancelTarget && finance.cancelPayable(cancelTarget.id)"
    />
  </div>
</template>
