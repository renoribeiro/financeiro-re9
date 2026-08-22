<script setup lang="ts">
import { useFinanceStore } from '@/stores/finance'
import { useAppStore } from '@/stores/app'
import { currentMonthKey, inMonth } from '@/utils/dateFilter'
import type { Payable } from '@/types/finance'

const finance = useFinanceStore()
const app = useAppStore()

useHead({ title: 'Contas a Pagar' })

const search = ref('')
const statusFilter = ref<string>('all')
const costCenterFilter = ref<string | null>(null)
const monthFilter = ref(currentMonthKey())

const dueDates = computed(() => finance.companyPayables.map(p => p.dueDate))

const filtered = computed(() => finance.companyPayables.filter(p => {
  const text = `${p.description} ${finance.supplierName(p.supplierId)} ${finance.employeeName(p.employeeId)}`.toLowerCase()
  const okSearch = !search.value || text.includes(search.value.toLowerCase())

  const okStatus = statusFilter.value === 'all'
    || (statusFilter.value === 'overdue' ? isPayablePending(p) && daysUntil(p.dueDate) < 0 : p.status === statusFilter.value)

  const okCC = !costCenterFilter.value || p.costCenterId === costCenterFilter.value
  const okMonth = inMonth(p.dueDate, monthFilter.value)

  return okSearch && okStatus && okCC && okMonth
}).sort((a, b) => a.dueDate.localeCompare(b.dueDate)))

const open = computed(() => finance.companyPayables.filter(p => isPayablePending(p) && daysUntil(p.dueDate) >= 0))
const overdue = computed(() => finance.companyPayables.filter(p => isPayablePending(p) && daysUntil(p.dueDate) < 0))

// "Total cadastrado" desconsidera cancelados (não representam obrigação real)
const registered = computed(() => finance.companyPayables.filter(p => p.status !== 'cancelled'))
const sum = (arr: Payable[]) => arr.reduce((s, p) => s + p.amount, 0)
const sumOutstanding = (arr: Payable[]) => arr.reduce((s, p) => s + payableOutstanding(p), 0)

const paidThisMonth = computed(() => {
  const ms = new Date()

  ms.setDate(1)
  ms.setHours(0, 0, 0, 0)

  return finance.companyTransactions.filter(t => t.type === 'expense' && new Date(t.date) >= ms)
})

const paidThisMonthTotal = computed(() => paidThisMonth.value.reduce((sumValue, transaction) => sumValue + transactionExpense(transaction), 0))

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
  { title: 'Parcial', value: 'partial' },
  { title: 'Vencido', value: 'overdue' },
  { title: 'Pago', value: 'paid' },
  { title: 'Cancelado', value: 'cancelled' },
]

const categoryOptions = computed(() => finance.companyChartAccounts.filter(a => a.type === 'expense' && a.parentId).map(a => ({ title: `${a.code} · ${a.name}`, value: a.id })))
const costCenterOptions = computed(() => finance.companyCostCenters.map(c => ({ title: c.name, value: c.id })))
const supplierOptions = computed(() => finance.companySuppliers.filter(s => s.isActive).map(s => ({ title: s.tradeName || s.legalName, value: s.id })))
const employeeOptions = computed(() => finance.companyEmployees.map(e => ({ title: e.fullName, value: e.id })))
const recurrenceOptions = Object.entries(recurrenceLabels).map(([value, title]) => ({ title, value }))

const attachmentHref = (value?: string) => {
  if (!value || value.startsWith('http') || value.startsWith('/'))
    return value

  return `/api/storage/legacy/download?companyId=${encodeURIComponent(app.currentCompanyId)}&path=${encodeURIComponent(value)}`
}

// 👉 Dialog form
const dialog = ref(false)
const formRef = ref()
const payableAttachment = ref<{ upload: (entityId: string) => Promise<string | undefined>; hasPendingFile: () => boolean }>()
const editing = ref<Partial<Payable>>({})
const proofLink = ref('')
const attachmentReference = ref('')
const originalPaidAmount = ref(0)
const paymentSituation = ref<'paid' | 'unpaid'>('unpaid')
const reopenReason = ref('')
const beneficiaryKind = ref<'supplier' | 'employee'>('supplier')
const installmentMode = ref(false)
const installmentCount = ref(3)
const saving = ref(false)
const actionLoading = ref(false)
const snackbar = ref(false)
const snackbarText = ref('')
const snackbarColor = ref<'success' | 'error' | 'primary'>('success')

function showMessage(text: string, color: 'success' | 'error' | 'primary' = 'success') {
  snackbarText.value = text
  snackbarColor.value = color
  snackbar.value = true
}

function openNew() {
  editing.value = { recurrence: 'once', dueDate: todayISO(), status: 'open', amount: undefined }
  proofLink.value = ''
  attachmentReference.value = ''
  originalPaidAmount.value = 0
  paymentSituation.value = 'unpaid'
  reopenReason.value = ''
  beneficiaryKind.value = 'supplier'
  installmentMode.value = false
  installmentCount.value = 3
  dialog.value = true
}
function openEdit(p: Payable) {
  editing.value = structuredClone(toRaw(p))
  proofLink.value = p.proofUrl?.startsWith('http') ? p.proofUrl : ''
  attachmentReference.value = p.proofUrl?.startsWith('http') ? '' : (p.proofUrl || '')
  originalPaidAmount.value = p.paidAmount ?? 0
  paymentSituation.value = originalPaidAmount.value > 0 ? 'paid' : 'unpaid'
  reopenReason.value = ''

  // "overdue" é um status DERIVADO (nunca persistido) — não gravar de volta
  if (editing.value.status === 'overdue')
    editing.value.status = 'open'
  beneficiaryKind.value = p.employeeId ? 'employee' : 'supplier'
  installmentMode.value = false
  dialog.value = true
}
async function save() {
  const shouldReopen = Boolean(editing.value.id)
    && originalPaidAmount.value > 0
    && paymentSituation.value === 'unpaid'

  if (shouldReopen && !reopenReason.value.trim()) {
    showMessage('Informe o motivo para marcar a conta como não paga.', 'error')

    return
  }
  const { valid } = await formRef.value.validate()
  if (!valid)
    return
  const data = { ...editing.value }

  data.proofUrl = proofLink.value || attachmentReference.value || undefined
  if (beneficiaryKind.value === 'supplier')
    data.employeeId = undefined
  else
    data.supplierId = undefined

  saving.value = true
  let accountWasSaved = false
  try {
    if (!data.id && installmentMode.value && installmentCount.value > 1) {
      if (payableAttachment.value?.hasPendingFile())
        throw new Error('Para anexar um arquivo diretamente, cadastre a conta sem parcelamento e depois edite cada parcela.')
      await finance.createInstallmentPayable(data, installmentCount.value)
    }
    else {
      const saved = await finance.savePayable(data)
      if (!saved)
        throw new Error('Não foi possível salvar a conta.')
      accountWasSaved = true

      // Persist the ID before uploading so a retry updates instead of duplicating.
      editing.value = structuredClone(toRaw(saved))
      if (payableAttachment.value?.hasPendingFile()) {
        const reference = await payableAttachment.value.upload(saved.id)
        if (reference) {
          attachmentReference.value = reference
          await finance.savePayable({ ...saved, proofUrl: reference })
        }
      }
      if (shouldReopen) {
        const reopened = await finance.reopenPayable(saved.id, reopenReason.value.trim())
        if (!reopened)
          throw new Error('Não foi possível reabrir o pagamento.')
        editing.value = structuredClone(toRaw(reopened))
        originalPaidAmount.value = 0
      }
    }
    dialog.value = false
    showMessage(shouldReopen
      ? 'Conta atualizada, pagamento estornado e saldo do caixa recalculado.'
      : data.id ? 'Conta atualizada com sucesso.' : 'Conta cadastrada com sucesso.')
  }
  catch (error) {
    const detail = error instanceof Error ? error.message : 'Não foi possível concluir a operação.'
    const attachmentFailed = accountWasSaved && payableAttachment.value?.hasPendingFile()

    const message = accountWasSaved && shouldReopen
      ? `Os dados da conta foram salvos, mas não foi possível estornar o pagamento: ${detail}`
      : attachmentFailed ? `A conta foi salva, mas o anexo falhou: ${detail}` : detail

    showMessage(message, 'error')
  }
  finally {
    saving.value = false
  }
}

// 👉 Pagar
const payDialog = ref(false)
const payTarget = ref<Payable | null>(null)
const payAmount = ref<number>(0)
const payProof = ref('')
function openPay(p: Payable) {
  payTarget.value = p
  payAmount.value = payableOutstanding(p)
  payProof.value = ''
  payDialog.value = true
}
async function doPay() {
  if (!payTarget.value)
    return
  actionLoading.value = true
  try {
    await finance.payPayable(payTarget.value.id, { amount: payAmount.value, proofUrl: payProof.value || undefined })
    payDialog.value = false
    showMessage('Pagamento registrado com sucesso.')
  }
  catch (error) {
    showMessage(error instanceof Error ? error.message : 'Não foi possível registrar o pagamento.', 'error')
  }
  finally {
    actionLoading.value = false
  }
}

// 👉 Cancelar
const cancelDialog = ref(false)
const cancelTarget = ref<Payable | null>(null)
function askCancel(p: Payable) {
  cancelTarget.value = p
  cancelDialog.value = true
}
async function doCancel() {
  if (!cancelTarget.value)
    return
  actionLoading.value = true
  try {
    await finance.cancelPayable(cancelTarget.value.id)
    showMessage('Conta cancelada com sucesso.')
  }
  catch (error) {
    showMessage(error instanceof Error ? error.message : 'Não foi possível cancelar a conta.', 'error')
  }
  finally {
    actionLoading.value = false
    cancelTarget.value = null
  }
}

const deleteDialog = ref(false)
const deleteTarget = ref<Payable | null>(null)
function askDelete(p: Payable) {
  deleteTarget.value = p
  deleteDialog.value = true
}
async function doDelete() {
  if (!deleteTarget.value)
    return
  actionLoading.value = true
  try {
    await finance.deletePayable(deleteTarget.value.id)
    showMessage('Conta excluída permanentemente.')
  }
  catch (error) {
    showMessage(error instanceof Error ? error.message : 'Não foi possível excluir a conta.', 'error')
  }
  finally {
    actionLoading.value = false
    deleteTarget.value = null
  }
}

// 👉 Recorrências
async function runRecurrences() {
  try {
    const n = await finance.generateRecurrences()

    showMessage(n > 0
      ? `${n} lançamento(s) recorrente(s) gerado(s).`
      : 'Nenhuma recorrência pendente.', 'primary')
  }
  catch (error) {
    showMessage(error instanceof Error ? error.message : 'Não foi possível gerar as recorrências.', 'error')
  }
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
          v-if="app.canManageFinance"
          variant="tonal"
          prepend-icon="ri-refresh-line"
          @click="runRecurrences"
        >
          Gerar recorrências
        </VBtn>
        <VBtn
          v-if="app.canManageFinance"
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
      :color="snackbarColor"
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
          :value="formatBRL(sumOutstanding(open))"
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
          :value="formatBRL(sumOutstanding(overdue))"
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
          :value="formatBRL(paidThisMonthTotal)"
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
              v-if="isPayablePending(item) && daysUntil(item.dueDate) < 0"
              class="text-caption text-error"
            >
              {{ Math.abs(daysUntil(item.dueDate)) }} dia(s) em atraso
            </div>
            <div
              v-else-if="isPayablePending(item) && daysUntil(item.dueDate) <= 7"
              class="text-caption text-warning"
            >
              vence em {{ daysUntil(item.dueDate) }} dia(s)
            </div>
          </div>
        </template>
        <template #item.amount="{ item }">
          <div class="text-end">
            <span class="font-weight-medium">{{ formatBRL(item.amount) }}</span>
            <div
              v-if="item.status === 'partial'"
              class="text-caption text-warning"
            >
              saldo {{ formatBRL(payableOutstanding(item)) }}
            </div>
          </div>
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
              v-if="app.canManageFinance && isPayablePending(item)"
              color="success"
              @click="openPay(item)"
            >
              <VIcon icon="ri-check-double-line" />
              <VTooltip activator="parent">
                Dar baixa
              </VTooltip>
            </IconBtn>
            <IconBtn
              v-if="item.proofUrl"
              :href="attachmentHref(item.proofUrl)"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Ver comprovante"
            >
              <VIcon icon="ri-attachment-2" />
              <VTooltip activator="parent">
                Ver comprovante
              </VTooltip>
            </IconBtn>
            <IconBtn
              v-if="app.canManageFinance"
              color="primary"
              aria-label="Editar conta"
              @click="openEdit(item)"
            >
              <VIcon icon="ri-pencil-line" />
              <VTooltip activator="parent">
                Editar conta
              </VTooltip>
            </IconBtn>
            <IconBtn
              v-if="app.canManageFinance && ['open', 'overdue'].includes(item.status)"
              color="warning"
              aria-label="Cancelar conta"
              @click="askCancel(item)"
            >
              <VIcon icon="ri-close-circle-line" />
              <VTooltip activator="parent">
                Cancelar conta
              </VTooltip>
            </IconBtn>
            <IconBtn
              v-if="app.canManageFinance"
              color="error"
              aria-label="Excluir conta permanentemente"
              @click="askDelete(item)"
            >
              <VIcon icon="ri-delete-bin-line" />
              <VTooltip activator="parent">
                Excluir permanentemente
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
        <VCardItem class="account-dialog__header">
          <VCardTitle>{{ editing.id ? 'Editar conta a pagar' : 'Nova conta a pagar' }}</VCardTitle>
        </VCardItem>
        <VCardText class="account-dialog__body">
          <VForm
            ref="formRef"
            @submit.prevent="save"
          >
            <VRow>
              <VCol
                v-if="editing.id && originalPaidAmount > 0"
                cols="12"
                class="account-dialog__choice"
              >
                <VLabel>Situação do pagamento</VLabel>
                <VBtnToggle
                  v-model="paymentSituation"
                  class="account-dialog__choice-toggle"
                  color="primary"
                  mandatory
                  variant="outlined"
                >
                  <VBtn value="paid">
                    {{ editing.status === 'partial' ? 'Pago parcialmente' : 'Pago' }}
                  </VBtn>
                  <VBtn value="unpaid">
                    Não pago
                  </VBtn>
                </VBtnToggle>
                <VAlert
                  v-if="paymentSituation === 'unpaid'"
                  type="warning"
                  variant="tonal"
                  density="compact"
                >
                  A baixa de {{ formatBRL(originalPaidAmount) }} será estornada e o valor retornará ao saldo em aberto.
                  O histórico contábil será preservado.
                </VAlert>
                <VTextarea
                  v-if="paymentSituation === 'unpaid'"
                  v-model="reopenReason"
                  label="Motivo da reabertura"
                  placeholder="Ex.: pagamento marcado por engano"
                  rows="2"
                  :rules="[requiredRule]"
                />
              </VCol>
              <VCol
                cols="12"
                class="account-dialog__choice"
              >
                <VLabel>Tipo de beneficiário</VLabel>
                <VBtnToggle
                  v-model="beneficiaryKind"
                  class="account-dialog__choice-toggle"
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
                  v-model="proofLink"
                  label="Link externo (opcional)"
                  placeholder="https://..."
                />
              </VCol>
              <VCol cols="12">
                <FileUpload
                  ref="payableAttachment"
                  v-model="attachmentReference"
                  entity-type="payable"
                  :entity-id="editing.id"
                  :auto-upload="false"
                  label="Anexar boleto, nota ou comprovante"
                  hint="PDF, PNG ou JPEG, até 10 MB. O provedor ativo em Configurações será utilizado."
                  persistent-hint
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
            min="0.01"
            :max="payTarget ? payableOutstanding(payTarget) : undefined"
            step="0.01"
            class="mb-3"
          />
          <FileUpload
            v-model="payProof"
            entity-type="payable"
            :entity-id="payTarget?.id ?? ''"
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
            :loading="actionLoading"
            :disabled="actionLoading"
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
      @confirm="doCancel"
    />

    <ConfirmDialog
      v-model="deleteDialog"
      title="Excluir conta permanentemente"
      :message="`A conta '${deleteTarget?.description}' será removida definitivamente. Esta ação só é permitida quando não há baixa, transação, comissão ou outro vínculo. Deseja continuar?`"
      confirm-text="Excluir permanentemente"
      confirm-color="error"
      @confirm="doDelete"
    />
  </div>
</template>
