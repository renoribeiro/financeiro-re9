<script setup lang="ts">
import { useFinanceStore } from '@/stores/finance'
import { useAppStore } from '@/stores/app'
import { currentMonthKey, inMonth } from '@/utils/dateFilter'
import type { ExternalInvoiceInput, ReceiptInput, ReceiptMethod, Receivable, Settlement } from '@/types/finance'

const finance = useFinanceStore()
const app = useAppStore()

useHead({ title: 'Contas a Receber' })

const search = ref('')
const statusFilter = ref('all')
const ruleFilter = ref<string | null>(null)
const monthFilter = ref(currentMonthKey())

const dueDates = computed(() => finance.companyReceivables.map(r => r.dueDate))

const filtered = computed(() => finance.companyReceivables.filter(r => {
  const text = `${r.description} ${r.clientName ?? ''}`.toLowerCase()
  const okSearch = !search.value || text.includes(search.value.toLowerCase())

  const okStatus = statusFilter.value === 'all'
    || r.status === statusFilter.value
    || (statusFilter.value === 'overdue' && isReceivablePending(r) && daysUntil(r.dueDate) < 0)

  const okRule = !ruleFilter.value || r.invoiceRule === ruleFilter.value
  const okMonth = inMonth(r.dueDate, monthFilter.value)

  return okSearch && okStatus && okRule && okMonth
}).sort((a, b) => a.dueDate.localeCompare(b.dueDate)))

const open = computed(() => finance.companyReceivables.filter(r => isReceivablePending(r)))
const overdue = computed(() => finance.companyReceivables.filter(r => isReceivablePending(r) && daysUntil(r.dueDate) < 0))

// "Total cadastrado" desconsidera cancelados
const registered = computed(() => finance.companyReceivables.filter(r => r.status !== 'cancelled'))
const sumNominal = (arr: Receivable[]) => arr.reduce((s, r) => s + r.amount, 0)
const sumOutstanding = (arr: Receivable[]) => arr.reduce((s, r) => s + receivableOutstanding(r), 0)

const receivedThisMonth = computed(() => {
  const ms = new Date()

  ms.setDate(1)
  ms.setHours(0, 0, 0, 0)

  return finance.companyTransactions
    .filter(t => t.receivableId && t.type === 'income' && new Date(`${t.date}T00:00:00`) >= ms)
    .reduce((total, transaction) => total + transactionIncome(transaction), 0)
})

const headers = [
  { title: 'Descrição', key: 'description' },
  { title: 'Cliente', key: 'clientName' },
  { title: 'Vencimento', key: 'dueDate' },
  { title: 'Valor', key: 'amount', align: 'end' as const },
  { title: 'NFS-e', key: 'invoiceRule' },
  { title: 'Status', key: 'status' },
  { title: '', key: 'actions', sortable: false, align: 'end' as const },
]

const statusItems = [
  { title: 'Todos', value: 'all' },
  { title: 'Em aberto', value: 'open' },
  { title: 'Parcial', value: 'partial' },
  { title: 'Vencido', value: 'overdue' },
  { title: 'Recebido', value: 'received' },
  { title: 'Cancelado', value: 'cancelled' },
]

const ruleItems = Object.entries(invoiceRuleLabels).map(([value, title]) => ({ title, value }))
const categoryOptions = computed(() => finance.companyChartAccounts.filter(a => a.type === 'revenue' && a.parentId).map(a => ({ title: `${a.code} · ${a.name}`, value: a.id })))
const costCenterOptions = computed(() => finance.companyCostCenters.map(c => ({ title: c.name, value: c.id })))

const dialog = ref(false)
const formRef = ref()
const editing = ref<Partial<Receivable>>({})
const originalReceivedAmount = ref(0)
const receiptSituation = ref<'received' | 'unreceived'>('unreceived')
const reopenReason = ref('')
const initialSituation = ref<'pending' | 'received'>('pending')
const initialReceipt = ref<ReceiptInput>(newReceipt())
const externalInvoice = ref<ExternalInvoiceInput>(newExternalInvoice())
const saving = ref(false)
const actionLoading = ref(false)
const snackbar = ref(false)
const snackbarText = ref('')
const snackbarColor = ref<'success' | 'error'>('success')

const receiptMethodItems = Object.entries(receiptMethodLabels).map(([value, title]) => ({ title, value }))

function newReceipt(amount = 0): ReceiptInput {
  return {
    amount,
    receivedAt: new Date().toISOString().slice(0, 16),
    method: 'pix',
    account: '',
    proofUrl: '',
    notes: '',
    requestId: crypto.randomUUID(),
  }
}

function newExternalInvoice(): ExternalInvoiceInput {
  return {
    number: '',
    issuedAt: new Date().toISOString().slice(0, 10),
    documentUrl: '',
    environment: 'producao',
  }
}

function showMessage(text: string, color: 'success' | 'error' = 'success') {
  snackbarText.value = text
  snackbarColor.value = color
  snackbar.value = true
}

function openNew() {
  editing.value = { invoiceRule: 'on_receive', recurrence: 'once', dueDate: todayISO(), status: 'open' }
  originalReceivedAmount.value = 0
  receiptSituation.value = 'unreceived'
  reopenReason.value = ''
  initialSituation.value = 'pending'
  initialReceipt.value = newReceipt()
  externalInvoice.value = newExternalInvoice()
  dialog.value = true
}
function openEdit(r: Receivable) {
  editing.value = structuredClone(toRaw(r))
  originalReceivedAmount.value = r.receivedAmount ?? 0
  receiptSituation.value = originalReceivedAmount.value > 0 ? 'received' : 'unreceived'
  reopenReason.value = ''

  // "overdue" é status DERIVADO — não gravar de volta ao editar
  if (editing.value.status === 'overdue')
    editing.value.status = 'open'
  initialSituation.value = 'pending'
  initialReceipt.value = newReceipt(receivableOutstanding(r))

  const invoice = invoiceOf(r.id)

  externalInvoice.value = {
    number: invoice?.invoiceNumber ?? '',
    issuedAt: invoice?.issuedAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    documentUrl: invoice?.pdfUrl,
    environment: invoice?.environment ?? 'producao',
  }
  dialog.value = true
}
async function save() {
  const wasEditing = Boolean(editing.value.id)

  const shouldReopen = wasEditing
    && originalReceivedAmount.value > 0
    && receiptSituation.value === 'unreceived'

  if (shouldReopen && !reopenReason.value.trim()) {
    showMessage('Informe o motivo para marcar a conta como não recebida.', 'error')

    return
  }
  const { valid } = await formRef.value.validate()
  if (!valid)
    return
  if (editing.value.invoiceRule === 'manual' && !externalInvoice.value.number.trim()) {
    showMessage('Informe o número da NFS-e já emitida.', 'error')

    return
  }
  saving.value = true
  let accountWasSaved = false
  try {
    if (initialSituation.value === 'received') {
      initialReceipt.value.amount = Number(editing.value.amount ?? 0)
      initialReceipt.value.receivedAt = new Date(initialReceipt.value.receivedAt).toISOString()
    }

    const saved = await finance.saveReceivable(editing.value, {
      initialReceipt: !editing.value.id && initialSituation.value === 'received' ? initialReceipt.value : undefined,
      externalInvoice: editing.value.invoiceRule === 'manual' ? externalInvoice.value : undefined,
    })

    if (!saved)
      throw new Error('Não foi possível salvar a conta.')
    accountWasSaved = true
    editing.value = structuredClone(toRaw(saved))
    if (shouldReopen) {
      const reopened = await finance.reopenReceivable(saved.id, reopenReason.value.trim())
      if (!reopened)
        throw new Error('Não foi possível reabrir o recebimento.')
      editing.value = structuredClone(toRaw(reopened))
      originalReceivedAmount.value = 0
    }
    dialog.value = false
    showMessage(shouldReopen
      ? 'Conta atualizada, recebimento estornado e saldo do caixa recalculado.'
      : wasEditing ? 'Conta atualizada com sucesso.' : 'Conta cadastrada com sucesso.')
  }
  catch (error) {
    const detail = error instanceof Error ? error.message : 'Não foi possível salvar a conta.'

    const message = accountWasSaved && shouldReopen
      ? `Os dados da conta foram salvos, mas não foi possível estornar o recebimento: ${detail}`
      : detail

    showMessage(message, 'error')
  }
  finally {
    saving.value = false
  }
}

const recvDialog = ref(false)
const recvTarget = ref<Receivable | null>(null)
const recvAmount = ref(0)
const recvProof = ref('')
const recvDate = ref('')
const recvMethod = ref<ReceiptMethod>('pix')
const recvAccount = ref('')
const recvNotes = ref('')
const recvRequestId = ref('')

function openReceive(r: Receivable) {
  recvTarget.value = r
  recvAmount.value = receivableOutstanding(r)
  recvDate.value = new Date().toISOString().slice(0, 16)
  recvMethod.value = 'pix'
  recvAccount.value = ''
  recvNotes.value = ''
  recvRequestId.value = crypto.randomUUID()
  recvProof.value = ''
  recvDialog.value = true
}
const recvRemaining = computed(() => recvTarget.value ? receivableOutstanding(recvTarget.value) : 0)
async function doReceive() {
  if (!recvTarget.value)
    return
  actionLoading.value = true
  try {
    await finance.receiveReceivable(recvTarget.value.id, {
      amount: recvAmount.value,
      receivedAt: new Date(recvDate.value).toISOString(),
      method: recvMethod.value,
      account: recvAccount.value || undefined,
      proofUrl: recvProof.value || undefined,
      notes: recvNotes.value || undefined,
      requestId: recvRequestId.value,
    })
    recvDialog.value = false
    showMessage('Recebimento registrado. O saldo realizado foi atualizado.')
  }
  catch (error) {
    showMessage(error instanceof Error ? error.message : 'Não foi possível registrar o recebimento.', 'error')
  }
  finally {
    actionLoading.value = false
  }
}

const cancelDialog = ref(false)
const cancelTarget = ref<Receivable | null>(null)
function askCancel(r: Receivable) {
  cancelTarget.value = r
  cancelDialog.value = true
}
async function doCancel() {
  if (!cancelTarget.value)
    return
  actionLoading.value = true
  try {
    await finance.cancelReceivable(cancelTarget.value.id)
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
const deleteTarget = ref<Receivable | null>(null)
function askDelete(r: Receivable) {
  deleteTarget.value = r
  deleteDialog.value = true
}
async function doDelete() {
  if (!deleteTarget.value)
    return
  actionLoading.value = true
  try {
    await finance.deleteReceivable(deleteTarget.value.id)
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

function invoiceOf(receivableId: string) {
  return finance.companyInvoices.find(i => i.receivableId === receivableId)
}

const activeReceipts = (receivableId: string) => {
  const rows = finance.receiptsOf(receivableId)
  const reversed = new Set(rows.filter(s => s.type === 'reversal' && s.reversalOf).map(s => s.reversalOf))

  return rows.filter(s => s.type === 'receipt' && !reversed.has(s.id))
}

const reverseDialog = ref(false)
const reverseTarget = ref<Settlement | null>(null)
const reverseReason = ref('')
function openReverse(r: Receivable) {
  reverseTarget.value = activeReceipts(r.id)[0] ?? null
  reverseReason.value = ''
  if (!reverseTarget.value) {
    showMessage('Nenhum recebimento ativo foi encontrado para estorno.', 'error')

    return
  }
  reverseDialog.value = true
}
async function doReverse() {
  if (!reverseTarget.value || !reverseReason.value.trim())
    return
  actionLoading.value = true
  try {
    await finance.reverseReceivableSettlement(reverseTarget.value.id, reverseReason.value.trim())
    reverseDialog.value = false
    showMessage('Recebimento estornado e saldo recalculado.')
  }
  catch (error) {
    showMessage(error instanceof Error ? error.message : 'Não foi possível estornar o recebimento.', 'error')
  }
  finally {
    actionLoading.value = false
  }
}
</script>

<template>
  <div>
    <AppPageHeader
      title="Contas a Receber"
      subtitle="Recebíveis, regras de NFS-e e baixas"
      icon="ri-arrow-down-circle-line"
    >
      <template #actions>
        <VBtn
          v-if="app.canManageFinance"
          prepend-icon="ri-add-line"
          @click="openNew"
        >
          Nova conta
        </VBtn>
      </template>
    </AppPageHeader>

    <VRow class="match-height mb-1">
      <VCol
        cols="12"
        sm="6"
        lg="3"
      >
        <KpiCard
          title="A receber (aberto)"
          :value="formatBRL(sumOutstanding(open))"
          icon="ri-time-line"
          color="info"
          :subtitle="`${open.length} título(s)`"
        />
      </VCol>
      <VCol
        cols="12"
        sm="6"
        lg="3"
      >
        <KpiCard
          title="Inadimplência"
          :value="formatBRL(sumOutstanding(overdue))"
          icon="ri-error-warning-line"
          color="error"
          :subtitle="`${overdue.length} vencido(s)`"
        />
      </VCol>
      <VCol
        cols="12"
        sm="6"
        lg="3"
      >
        <KpiCard
          title="Recebido no mês"
          :value="formatBRL(receivedThisMonth)"
          icon="ri-checkbox-circle-line"
          color="success"
          subtitle="Regime de caixa realizado"
        />
      </VCol>
      <VCol
        cols="12"
        sm="6"
        lg="3"
      >
        <KpiCard
          title="Valor nominal cadastrado"
          :value="formatBRL(sumNominal(registered))"
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
          aria-label="Buscar descrição ou cliente"
          placeholder="Buscar descrição/cliente"
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
          v-model="ruleFilter"
          :items="ruleItems"
          density="compact"
          label="Regra NFS-e"
          style="max-inline-size: 200px;"
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
              {{ finance.costCenterName(item.costCenterId) }}
              <template v-if="item.recurrence === 'monthly'">
                · recorrente
              </template>
            </div>
          </div>
        </template>
        <template #item.clientName="{ item }">
          <div>
            {{ item.clientName || '—' }}
            <div
              v-if="item.clientDocument"
              class="text-caption text-disabled"
            >
              {{ formatDocument(item.clientDocument) }}
            </div>
          </div>
        </template>
        <template #item.dueDate="{ item }">
          <div>
            {{ formatDate(item.dueDate) }}
            <div
              v-if="isReceivablePending(item) && daysUntil(item.dueDate) < 0"
              class="text-caption text-error"
            >
              {{ Math.abs(daysUntil(item.dueDate)) }} dia(s) em atraso
            </div>
          </div>
        </template>
        <template #item.amount="{ item }">
          <div class="text-end">
            <span class="font-weight-medium">{{ formatBRL(item.amount) }}</span>
            <div
              v-if="item.receivedAmount"
              class="text-caption text-disabled"
            >
              Restante {{ formatBRL(receivableOutstanding(item)) }}
            </div>
          </div>
        </template>
        <template #item.invoiceRule="{ item }">
          <VChip
            size="small"
            label
            color="secondary"
          >
            {{ invoiceRuleLabels[item.invoiceRule] }}
          </VChip>
          <VIcon
            v-if="invoiceOf(item.id)"
            icon="ri-file-text-line"
            size="18"
            class="ms-1"
            color="success"
          >
            <VTooltip activator="parent">
              NFS-e vinculada
            </VTooltip>
          </VIcon>
        </template>
        <template #item.status="{ item }">
          <StatusChip
            :value="item.status"
            :map="receivableStatusMeta"
          />
        </template>
        <template #item.actions="{ item }">
          <div class="d-flex justify-end">
            <VBtn
              v-if="app.canManageFinance && isReceivablePending(item)"
              color="success"
              variant="tonal"
              size="small"
              class="me-1"
              @click="openReceive(item)"
            >
              <VIcon
                start
                icon="ri-check-double-line"
              />
              Receber
            </VBtn>
            <IconBtn
              v-if="app.canManageFinance && activeReceipts(item.id).length"
              color="warning"
              aria-label="Estornar recebimento"
              @click="openReverse(item)"
            >
              <VIcon icon="ri-arrow-go-back-line" />
              <VTooltip activator="parent">
                Estornar último recebimento
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
              v-if="app.canManageFinance && isReceivablePending(item)"
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
          <VCardTitle>{{ editing.id ? 'Editar conta a receber' : 'Nova conta a receber' }}</VCardTitle>
        </VCardItem>
        <VCardText class="account-dialog__body">
          <VForm
            ref="formRef"
            @submit.prevent="save"
          >
            <VRow>
              <VCol
                v-if="editing.id && originalReceivedAmount > 0"
                cols="12"
                class="account-dialog__choice"
              >
                <VLabel>Situação do recebimento</VLabel>
                <VBtnToggle
                  v-model="receiptSituation"
                  class="account-dialog__choice-toggle"
                  color="primary"
                  mandatory
                  variant="outlined"
                >
                  <VBtn value="received">
                    {{ editing.status === 'partial' ? 'Recebido parcialmente' : 'Recebido' }}
                  </VBtn>
                  <VBtn value="unreceived">
                    Não recebido
                  </VBtn>
                </VBtnToggle>
                <VAlert
                  v-if="receiptSituation === 'unreceived'"
                  type="warning"
                  variant="tonal"
                  density="compact"
                >
                  O recebimento de {{ formatBRL(originalReceivedAmount) }} será estornado e voltará ao saldo a receber.
                  A NFS-e e o histórico contábil serão preservados.
                </VAlert>
                <VTextarea
                  v-if="receiptSituation === 'unreceived'"
                  v-model="reopenReason"
                  label="Motivo da reabertura"
                  placeholder="Ex.: recebimento marcado por engano"
                  rows="2"
                  :rules="[requiredRule]"
                />
              </VCol>
              <VCol
                v-if="!editing.id"
                cols="12"
                class="account-dialog__choice"
              >
                <VLabel>
                  Situação inicial
                </VLabel>
                <VBtnToggle
                  v-model="initialSituation"
                  class="account-dialog__choice-toggle"
                  mandatory
                  color="primary"
                  variant="outlined"
                >
                  <VBtn value="pending">
                    A receber
                  </VBtn>
                  <VBtn value="received">
                    Já recebido
                  </VBtn>
                </VBtnToggle>
                <div class="text-caption text-disabled">
                  Contas “A receber” entram apenas na projeção. O caixa só muda quando um recebimento é confirmado.
                </div>
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VTextField
                  v-model="editing.clientName"
                  label="Cliente"
                  :rules="[requiredRule]"
                />
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VTextField
                  v-model="editing.clientDocument"
                  label="CPF/CNPJ do cliente"
                />
              </VCol>
              <VCol cols="12">
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
                  label="Data prevista de recebimento"
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
                  v-model="editing.invoiceRule"
                  label="Regra de emissão NFS-e"
                  :items="ruleItems"
                />
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VSelect
                  v-model="editing.recurrence"
                  label="Recorrência"
                  :items="[{ title: 'Única', value: 'once' }, { title: 'Mensal', value: 'monthly' }]"
                />
              </VCol>
              <VCol
                v-if="editing.invoiceRule === 'scheduled'"
                cols="12"
                md="6"
              >
                <VTextField
                  v-model="editing.invoiceScheduledDate"
                  label="Data de emissão agendada"
                  type="date"
                  :rules="[requiredRule]"
                />
              </VCol>
              <VCol
                v-if="editing.invoiceRule === 'recurring'"
                cols="12"
                md="6"
              >
                <VTextField
                  v-model.number="editing.invoiceRecurrenceDay"
                  label="Dia do mês p/ emitir (1-28)"
                  type="number"
                  min="1"
                  max="28"
                  :rules="[requiredRule]"
                />
              </VCol>
              <template v-if="editing.invoiceRule === 'manual'">
                <VCol
                  cols="12"
                  md="6"
                >
                  <VTextField
                    v-model="externalInvoice.number"
                    label="Número da NFS-e já emitida"
                    :rules="[requiredRule]"
                  />
                </VCol>
                <VCol
                  cols="12"
                  md="6"
                >
                  <VTextField
                    v-model="externalInvoice.issuedAt"
                    label="Data de emissão"
                    type="date"
                    :rules="[requiredRule]"
                  />
                </VCol>
                <VCol cols="12">
                  <VTextField
                    v-model="externalInvoice.documentUrl"
                    label="URL do documento fiscal (opcional)"
                  />
                </VCol>
              </template>
              <template v-if="!editing.id && initialSituation === 'received'">
                <VCol
                  cols="12"
                  md="6"
                >
                  <VTextField
                    v-model="initialReceipt.receivedAt"
                    label="Data e hora do recebimento"
                    type="datetime-local"
                    :rules="[requiredRule]"
                  />
                </VCol>
                <VCol
                  cols="12"
                  md="6"
                >
                  <VSelect
                    v-model="initialReceipt.method"
                    label="Forma de recebimento"
                    :items="receiptMethodItems"
                    :rules="[requiredRule]"
                  />
                </VCol>
                <VCol
                  cols="12"
                  md="6"
                >
                  <VTextField
                    v-model="initialReceipt.account"
                    label="Conta ou caixa de destino"
                    placeholder="Ex.: Caixa, Banco Inter"
                  />
                </VCol>
                <VCol
                  cols="12"
                  md="6"
                >
                  <VTextField
                    v-model="initialReceipt.proofUrl"
                    label="URL do comprovante (opcional)"
                  />
                </VCol>
              </template>
              <VCol cols="12">
                <VAlert
                  v-if="editing.invoiceRule === 'immediate'"
                  type="info"
                  variant="tonal"
                  density="compact"
                >
                  A NFS-e será criada no ato do cadastro e ficará pronta para emissão.
                </VAlert>
                <VAlert
                  v-else-if="editing.invoiceRule === 'on_receive'"
                  type="info"
                  variant="tonal"
                  density="compact"
                >
                  A NFS-e será criada quando a baixa for registrada e ficará pronta para emissão.
                </VAlert>
                <VAlert
                  v-else-if="editing.invoiceRule === 'manual'"
                  type="success"
                  variant="tonal"
                  density="compact"
                >
                  A nota será registrada como já emitida fora do sistema e não será emitida novamente.
                </VAlert>
                <VAlert
                  v-else-if="editing.invoiceRule === 'none'"
                  type="warning"
                  variant="tonal"
                  density="compact"
                >
                  O recebimento será contabilizado normalmente, mas nenhuma NFS-e será criada.
                </VAlert>
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

    <!-- Dialog recebimento -->
    <VDialog
      v-model="recvDialog"
      max-width="460"
    >
      <VCard>
        <VCardItem>
          <VCardTitle>Registrar recebimento</VCardTitle>
        </VCardItem>
        <VCardText>
          <p class="mb-4">
            {{ recvTarget?.description }}
          </p>
          <VTextField
            v-model.number="recvAmount"
            label="Valor recebido"
            type="number"
            prefix="R$"
            class="mb-3"
            :rules="[requiredRule, positiveRule]"
          />
          <VTextField
            v-model="recvDate"
            label="Data e hora do recebimento"
            type="datetime-local"
            class="mb-3"
          />
          <VSelect
            v-model="recvMethod"
            label="Forma de recebimento"
            :items="receiptMethodItems"
            class="mb-3"
          />
          <VTextField
            v-model="recvAccount"
            label="Conta ou caixa de destino"
            placeholder="Ex.: Caixa, Banco Inter"
            class="mb-3"
          />
          <VTextarea
            v-model="recvNotes"
            label="Observação"
            rows="2"
            class="mb-3"
          />
          <FileUpload
            v-model="recvProof"
            entity-type="receivable"
            :entity-id="recvTarget?.id ?? ''"
            label="Comprovante do recebimento"
          />
          <VAlert
            v-if="recvTarget?.invoiceRule === 'on_receive'"
            type="info"
            variant="tonal"
            density="compact"
            class="mt-3"
          >
            Uma NFS-e será criada para emissão.
          </VAlert>
        </VCardText>
        <VCardText class="d-flex justify-end gap-3 pt-0">
          <VBtn
            variant="tonal"
            color="secondary"
            @click="recvDialog = false"
          >
            Cancelar
          </VBtn>
          <VBtn
            color="success"
            :loading="actionLoading"
            :disabled="actionLoading || recvAmount <= 0 || recvAmount > recvRemaining || !recvDate"
            @click="doReceive"
          >
            Confirmar
          </VBtn>
        </VCardText>
      </VCard>
    </VDialog>

    <VDialog
      v-model="reverseDialog"
      max-width="480"
    >
      <VCard>
        <VCardItem>
          <VCardTitle>Estornar recebimento</VCardTitle>
        </VCardItem>
        <VCardText>
          <VAlert
            type="warning"
            variant="tonal"
            class="mb-4"
          >
            O lançamento original será preservado e uma contrapartida será criada no caixa.
          </VAlert>
          <p class="mb-4">
            Valor: <strong>{{ formatBRL(reverseTarget?.amount) }}</strong>
          </p>
          <VTextarea
            v-model="reverseReason"
            label="Motivo do estorno"
            :rules="[requiredRule]"
            rows="3"
          />
        </VCardText>
        <VCardText class="d-flex justify-end gap-3 pt-0">
          <VBtn
            variant="tonal"
            color="secondary"
            @click="reverseDialog = false"
          >
            Voltar
          </VBtn>
          <VBtn
            color="warning"
            :loading="actionLoading"
            :disabled="actionLoading || !reverseReason.trim()"
            @click="doReverse"
          >
            Confirmar estorno
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
      :message="`A conta '${deleteTarget?.description}' será removida definitivamente. Esta ação só é permitida quando não há recebimento, transação, NFS-e, venda, comissão ou outro vínculo. Deseja continuar?`"
      confirm-text="Excluir permanentemente"
      confirm-color="error"
      @confirm="doDelete"
    />

    <VSnackbar
      v-model="snackbar"
      :color="snackbarColor"
      timeout="5000"
    >
      {{ snackbarText }}
    </VSnackbar>
  </div>
</template>
