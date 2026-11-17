<script setup lang="ts">
import { useFinanceStore } from '@/stores/finance'
import { useAppStore } from '@/stores/app'
import { type DateWindow, isWithin } from '@/utils/dateFilter'
import type { Commission, CommissionInstallment, ReceiptMethod } from '@/types/finance'

const finance = useFinanceStore()
const app = useAppStore()

useHead({ title: 'Comissões' })

const reversedReceipts = computed(() => new Set(finance.companySettlements.map(s => s.reversalOf).filter(Boolean)))

const rows = computed(() => finance.companyCommissions.map(c => {
  const sale = finance.saleById(c.saleId)
  const insts = finance.installmentsOf(c.id)

  const receivedAmount = insts.reduce((sum, installment) => {
    const receivable = finance.receivables.find(r => r.id === installment.receivableId)

    return sum + (receivable?.receivedAmount ?? (installment.status === 'received' ? installment.amount : 0))
  }, 0)

  const receivedDates = [...new Set(insts.flatMap(installment => {
    const settlementDates = installment.receivableId
      ? finance.receiptsOf(installment.receivableId)
        .filter(receipt => receipt.type === 'receipt' && !reversedReceipts.value.has(receipt.id))
        .map(receipt => receipt.settledAt.slice(0, 10))
      : []

    return [...settlementDates, ...(installment.receivedDate ? [installment.receivedDate] : [])]
  }))].sort((a, b) => b.localeCompare(a))

  return {
    ...c,
    buyer: sale?.buyerName ?? '—',
    development: finance.developmentName(sale?.developmentId),
    broker: finance.employeeName(sale?.brokerId),
    installments: insts.length,
    receivedAmount,
    receivedDates,
    receivedDate: receivedDates[0],
    saleDate: sale?.saleDate ?? c.createdAt,
  }
}))

// 👉 Filtro de período (pela data da venda; afeta KPIs + tabela)
const periodWindow = ref<DateWindow>({ start: null, end: null })

const filteredRows = computed(() =>
  rows.value.filter(r => isWithin(r.saleDate, periodWindow.value)),
)

const totalGenerated = computed(() => filteredRows.value.reduce((s, c) => s + c.totalAmount, 0))
const totalReceived = computed(() => filteredRows.value.reduce((s, c) => s + c.receivedAmount, 0))
const totalPending = computed(() => totalGenerated.value - totalReceived.value)

const totalBrokerPayouts = computed(() =>
  finance.commissionSplits
    .filter(sp => filteredRows.value.some(c => c.id === sp.commissionId) && sp.beneficiaryType === 'broker' && sp.status === 'pending')
    .reduce((s, sp) => s + sp.amount, 0),
)

const headers = [
  { title: 'Venda', key: 'buyer' },
  { title: 'Modelo', key: 'receiptType' },
  { title: 'Comissão total', key: 'totalAmount', align: 'end' as const },
  { title: 'Recebido', key: 'receivedAmount', align: 'end' as const },
  { title: 'Data de recebimento', key: 'receivedDate' },
  { title: 'Parcelas', key: 'installments', align: 'center' as const },
  { title: 'Status', key: 'status' },
  { title: '', key: 'actions', sortable: false, align: 'end' as const },
]

// 👉 Detalhe
const dialog = ref(false)
const current = ref<Commission | null>(null)

const detail = computed(() => {
  if (!current.value)
    return null
  const sale = finance.saleById(current.value.saleId)

  return {
    commission: current.value,
    sale,
    installments: finance.installmentsOf(current.value.id),
    splits: finance.splitsOf(current.value.id),
  }
})

function openDetail(c: Commission) {
  current.value = c
  dialog.value = true
}

const busyId = ref<string | null>(null)
const confirmDateLabel = ref('')

// O servidor grava a data do caixa pelo dia em UTC: depois das 21h (Brasília)
// isso já é o dia seguinte. A confirmação mostra a data que de fato será gravada.
const confirmDateShifted = ref(false)
function prepareConfirmDate() {
  const cashDate = new Date().toISOString().slice(0, 10)

  confirmDateLabel.value = formatDate(cashDate)
  confirmDateShifted.value = cashDate !== todayISO()
}

const receiveConfirm = ref(false)
const receiveTarget = ref<CommissionInstallment | null>(null)
const receiptMethods = Object.entries(receiptMethodLabels).map(([value, title]) => ({ value, title }))

const receiveForm = ref({
  source: 'new',
  existingId: '',
  outcome: 'final',
  amount: 0,
  remaining: '' as string | number,
  date: '',
  method: 'pix' as ReceiptMethod,
  account: '',
  paidByBuilder: false,
  reason: '',
  requestId: '',
  expectedUpdatedAt: undefined as string | undefined,
})

const receiveAccount = computed(() => finance.companyReceivables.find(r => r.id === receiveTarget.value?.receivableId))
const receiveBroker = computed(() => finance.splitsOf(receiveTarget.value?.commissionId ?? '').find(s => s.beneficiaryType === 'broker'))
const currentBalance = computed(() => receiveAccount.value ? receivableOutstanding(receiveAccount.value) : 0)

const existingReceipts = computed(() => {
  const account = receiveAccount.value
  if (!account)
    return []
  const accounts = new Map(finance.companyReceivables.map(r => [r.id, r]))
  const transactions = new Map(finance.companyTransactions.filter(t => t.settlementId).map(t => [t.settlementId, t]))
  const linked = new Set(finance.commissionInstallments.map(i => i.receivableId))

  return finance.companySettlements.flatMap(s => {
    const source = s.receivableId ? accounts.get(s.receivableId) : undefined
    const transaction = transactions.get(s.id)
    if (s.type !== 'receipt' || !source || reversedReceipts.value.has(s.id) || !transaction || transaction.isReversal)
      return []
    const sameAccount = source.id === account.id
    if (!sameAccount && (account.status === 'received' || source.status !== 'received' || source.saleId
      || source.commissionInstallmentId || linked.has(source.id) || source.amount !== s.amount
      || source.receivedAmount !== s.amount || finance.companyInvoices.some(i => i.receivableId === source.id && i.status !== 'cancelled')))
      return []

    return [{
      value: s.id,
      title: [formatDate(transaction.date), formatBRL(s.amount), source.description, s.account].filter(Boolean).join(' · '),
      amount: s.amount,
      sameAccount,
    }]
  })
})

const selectedReceipt = computed(() => existingReceipts.value.find(s => s.value === receiveForm.value.existingId))
const actualAmount = computed(() => receiveForm.value.source === 'existing' ? selectedReceipt.value?.amount ?? 0 : Number(receiveForm.value.amount))

const suggestedRemaining = computed(() => Math.max(0, Math.round((currentBalance.value
  - (receiveForm.value.source === 'existing' && selectedReceipt.value?.sameAccount ? 0 : actualAmount.value)) * 100) / 100))

const needsReceiptReason = computed(() => receiveForm.value.source === 'existing'
  || receiveForm.value.outcome === 'partial' || Math.round(actualAmount.value * 100) !== Math.round(currentBalance.value * 100))

function canRecordReceipt(installment: CommissionInstallment) {
  const receivable = finance.companyReceivables.find(r => r.id === installment.receivableId)

  return receivable && installment.status !== 'cancelled'
    && (isReceivablePending(receivable) || (receivable.status === 'received' && finance.receiptsOf(receivable.id).length > 0))
}

function canSettlePayable(payableId: string) {
  const payable = finance.payables.find(p => p.id === payableId)

  return !payable || isPayablePending(payable)
}

function askReceive(installment: CommissionInstallment) {
  if (!canRecordReceipt(installment) || busyId.value)
    return
  receiveTarget.value = installment
  receiveForm.value = {
    source: receiveAccount.value?.status === 'received' ? 'existing' : 'new',
    existingId: '',
    outcome: 'final',
    amount: currentBalance.value,
    remaining: '',
    date: todayISO(),
    method: 'pix',
    account: '',
    paidByBuilder: receiveBroker.value?.paidByBuilder ?? false,
    reason: '',
    requestId: crypto.randomUUID(),
    expectedUpdatedAt: receiveAccount.value?.updatedAt,
  }
  receiveConfirm.value = true
}

async function confirmReceive() {
  const target = receiveTarget.value
  const form = receiveForm.value
  const usingExisting = form.source === 'existing'

  const remaining = form.outcome === 'partial'
    ? Number(form.remaining === '' ? suggestedRemaining.value : form.remaining)
    : 0

  if (!target?.receivableId || !receiveAccount.value)
    throw new Error('Selecione uma parcela com conta vinculada.')
  if (usingExisting && !selectedReceipt.value)
    throw new Error('Selecione o recebimento já lançado.')
  if (!Number.isFinite(actualAmount.value) || actualAmount.value <= 0)
    throw new Error('Informe o valor efetivamente recebido.')
  if (form.outcome === 'partial' && (!Number.isFinite(remaining) || remaining <= 0))
    throw new Error('Informe quanto ainda falta a RE9 receber.')
  if (!usingExisting && (!form.date || form.date > todayISO()))
    throw new Error('Informe a data do depósito, até hoje.')
  if (needsReceiptReason.value && !form.reason.trim())
    throw new Error('Informe o motivo da diferença ou do vínculo.')

  busyId.value = target.receivableId
  try {
    await finance.recordCommissionReceipt({
      installmentId: target.id,
      amount: usingExisting ? undefined : actualAmount.value,
      remaining,
      date: usingExisting ? undefined : form.date,
      method: usingExisting ? undefined : form.method,
      account: usingExisting ? undefined : form.account,
      existingReceiptId: usingExisting ? form.existingId : undefined,
      paidByBuilder: form.paidByBuilder,
      reason: form.reason.trim(),
      requestId: form.requestId,
      expectedUpdatedAt: form.expectedUpdatedAt,
    })
  }
  finally {
    busyId.value = null
  }
}

const payConfirm = ref(false)
const payTarget = ref<{ payableId: string; beneficiary: string } | null>(null)

const payInfo = computed(() => {
  const id = payTarget.value?.payableId
  const payable = id ? finance.payables.find(item => item.id === id) : undefined
  if (!payable)
    return null

  return {
    amount: Math.max(0, payable.amount - (payable.paidAmount ?? 0)),
  }
})

function askPay(payableId: string | undefined, beneficiaryType: string, beneficiaryId?: string) {
  if (!payableId || busyId.value)
    return
  const label = beneficiaryTypeLabels[beneficiaryType] ?? beneficiaryType

  payTarget.value = {
    payableId,
    beneficiary: beneficiaryId ? `${label} — ${finance.employeeName(beneficiaryId)}` : label,
  }
  prepareConfirmDate()
  payConfirm.value = true
}

async function confirmPay() {
  const payableId = payTarget.value?.payableId
  if (!payableId)
    return
  busyId.value = payableId
  try {
    await finance.payPayable(payableId)
  }
  finally {
    busyId.value = null
  }
}

const editDialog = ref(false)
const editFormRef = ref()
const saving = ref(false)
const formError = ref('')

const editForm = ref({
  id: '',
  totalAmount: 0,
  receiptType: 'launch_passthrough',
  installments: 1,
  firstDueDate: todayISO(),
  managerPct: 0,
  captadorPct: 0,
  notes: '',
})

const editGuard = useDiscardGuard(() => editForm.value)

const receiptTypeOptions = Object.entries(receiptTypeLabels).map(([value, title]) => ({ value, title }))

function openEdit(c: Commission) {
  const installments = finance.installmentsOf(c.id)
  const splits = finance.splitsOf(c.id)

  editForm.value = {
    id: c.id,
    totalAmount: c.totalAmount,
    receiptType: c.receiptType,
    installments: Math.max(1, installments.length),
    firstDueDate: installments[0]?.expectedDate ?? todayISO(),
    managerPct: splits.find(sp => sp.beneficiaryType === 'manager')?.percentage ?? 0,
    captadorPct: splits.find(sp => sp.beneficiaryType === 'captador')?.percentage ?? 0,
    notes: c.notes ?? '',
  }
  editGuard.arm()
  formError.value = ''
  dialog.value = false
  editDialog.value = true
}

function cancelEdit() {
  if (saving.value)
    return
  editGuard.requestClose(() => {
    editDialog.value = false
  })
}

async function saveCommission() {
  if (saving.value)
    return
  const { valid } = await editFormRef.value.validate()
  if (!valid)
    return
  saving.value = true
  formError.value = ''
  try {
    await finance.updateCommission({
      ...editForm.value,
      totalAmount: Number(editForm.value.totalAmount),
      installments: Number(editForm.value.installments),
      managerPct: Number(editForm.value.managerPct),
      captadorPct: Number(editForm.value.captadorPct),
    })
    editDialog.value = false
  }
  catch (error) {
    formError.value = (error as Error).message
  }
  finally {
    saving.value = false
  }
}

const deleteDialog = ref(false)
const deleteTarget = ref<Commission | null>(null)

function askDelete(c: Commission) {
  deleteTarget.value = c
  deleteDialog.value = true
}

// Erros sobem para o ConfirmDialog, que os mostra dentro dele.
async function confirmDelete() {
  if (!deleteTarget.value)
    return
  await finance.deleteCommission(deleteTarget.value.id)
  deleteTarget.value = null
}
</script>

<template>
  <div>
    <AppPageHeader
      title="Comissões"
      subtitle="Motor de comissões — recebimentos, parcelas e repasses"
      icon="ri-hand-coin-line"
    />

    <VAlert
      v-if="app.isAgency"
      type="info"
      variant="tonal"
      class="mb-4"
    >
      O motor de comissões é exclusivo da imobiliária.
    </VAlert>

    <template v-else>
      <VRow class="match-height mb-1">
        <VCol
          cols="12"
          sm="6"
          lg="3"
        >
          <KpiCard
            title="Comissões geradas"
            :value="formatBRL(totalGenerated)"
            icon="ri-money-dollar-circle-line"
            color="primary"
          />
        </VCol>
        <VCol
          cols="12"
          sm="6"
          lg="3"
        >
          <KpiCard
            title="Recebido"
            :value="formatBRL(totalReceived)"
            icon="ri-checkbox-circle-line"
            color="success"
          />
        </VCol>
        <VCol
          cols="12"
          sm="6"
          lg="3"
        >
          <KpiCard
            title="A receber"
            :value="formatBRL(totalPending)"
            icon="ri-time-line"
            color="warning"
          />
        </VCol>
        <VCol
          cols="12"
          sm="6"
          lg="3"
        >
          <KpiCard
            title="Repasses a pagar"
            :value="formatBRL(totalBrokerPayouts)"
            icon="ri-share-forward-line"
            color="info"
          />
        </VCol>
      </VRow>

      <VCard>
        <VCardText class="d-flex flex-wrap align-center gap-3">
          <PeriodRangeFilter v-model="periodWindow" />
        </VCardText>
        <VDivider />
        <VDataTable
          :headers="headers"
          :items="filteredRows"
          :items-per-page="10"
          item-value="id"
          class="text-no-wrap"
        >
          <template #item.buyer="{ item }">
            <div class="py-2">
              <div class="font-weight-medium">
                {{ item.buyer }}
              </div>
              <div class="text-caption text-disabled">
                {{ item.development }} · {{ item.broker }}
              </div>
            </div>
          </template>
          <template #item.receiptType="{ item }">
            <VChip
              size="small"
              label
              color="secondary"
            >
              {{ receiptTypeLabels[item.receiptType] }}
            </VChip>
          </template>
          <template #item.totalAmount="{ item }">
            <span class="font-weight-medium">{{ formatBRL(item.totalAmount) }}</span>
          </template>
          <template #item.receivedAmount="{ item }">
            {{ formatBRL(item.receivedAmount) }}
          </template>
          <template #item.receivedDate="{ item }">
            <span v-if="item.receivedDate">{{ formatDate(item.receivedDate) }}</span>
            <span
              v-else
              class="text-disabled"
            >—</span>
            <div
              v-if="item.receivedDates.length > 1"
              class="text-caption text-disabled"
            >
              +{{ item.receivedDates.length - 1 }} recebimento(s)
            </div>
          </template>
          <template #item.installments="{ item }">
            {{ item.installments }}
          </template>
          <template #item.status="{ item }">
            <StatusChip
              :value="item.status"
              :map="commissionStatusMeta"
            />
          </template>
          <template #item.actions="{ item }">
            <div class="d-flex justify-end ga-1">
              <IconBtn
                aria-label="Ver detalhes da comissão"
                @click="openDetail(item)"
              >
                <VIcon icon="ri-eye-line" />
                <VTooltip activator="parent">
                  Detalhes
                </VTooltip>
              </IconBtn>
              <IconBtn
                v-if="app.canManageFinance"
                aria-label="Editar comissão"
                @click="openEdit(item)"
              >
                <VIcon icon="ri-pencil-line" />
                <VTooltip activator="parent">
                  Editar
                </VTooltip>
              </IconBtn>
              <IconBtn
                v-if="app.isAdmin"
                aria-label="Excluir comissão"
                color="error"
                @click="askDelete(item)"
              >
                <VIcon icon="ri-delete-bin-line" />
                <VTooltip activator="parent">
                  Excluir
                </VTooltip>
              </IconBtn>
            </div>
          </template>
        </VDataTable>
      </VCard>

      <!-- Cenários -->
      <VCard
        title="Como funcionam os cenários de recebimento"
        class="mt-6"
      >
        <VCardText>
          <VRow>
            <VCol
              cols="12"
              md="4"
            >
              <div class="font-weight-medium mb-1">
                <VChip
                  size="small"
                  label
                  color="primary"
                  class="me-1"
                >
                  1
                </VChip> Lançamento c/ repasse
              </div>
              <p class="text-body-2 text-medium-emphasis mb-0">
                A construtora paga a comissão total à RE9 (conta a receber). A RE9 retém sua parte e gera uma conta a pagar ao corretor, executada após o recebimento.
              </p>
            </VCol>
            <VCol
              cols="12"
              md="4"
            >
              <div class="font-weight-medium mb-1">
                <VChip
                  size="small"
                  label
                  color="primary"
                  class="me-1"
                >
                  2
                </VChip> Avulso consolidado
              </div>
              <p class="text-body-2 text-medium-emphasis mb-0">
                A RE9 recebe tudo do comprador (conta a receber) e repassa a parte do corretor (conta a pagar).
              </p>
            </VCol>
            <VCol
              cols="12"
              md="4"
            >
              <div class="font-weight-medium mb-1">
                <VChip
                  size="small"
                  label
                  color="primary"
                  class="me-1"
                >
                  3
                </VChip> Avulso dividido
              </div>
              <p class="text-body-2 text-medium-emphasis mb-0">
                O comprador paga diretamente cada parte. A RE9 só registra sua parte (conta a receber); a parte do corretor fica como registro informativo, sem conta a pagar.
              </p>
            </VCol>
          </VRow>
        </VCardText>
      </VCard>
    </template>

    <!-- Dialog detalhe -->
    <VDialog
      v-model="dialog"
      max-width="720"
      scrollable
    >
      <VCard v-if="detail">
        <VCardItem>
          <VCardTitle>Comissão — {{ detail.sale?.buyerName }}</VCardTitle>
          <VCardSubtitle>{{ finance.developmentName(detail.sale?.developmentId) }} · {{ receiptTypeLabels[detail.commission.receiptType] }}</VCardSubtitle>
          <template #append>
            <StatusChip
              :value="detail.commission.status"
              :map="commissionStatusMeta"
            />
          </template>
        </VCardItem>
        <VDivider />
        <VCardText>
          <div class="text-overline mb-2">
            Parcelas da comissão (recebimento)
          </div>
          <VTable
            density="compact"
            class="mb-6"
          >
            <thead>
              <tr>
                <th>#</th>
                <th>Valor previsto</th>
                <th>Vencimento</th>
                <th>Recebido em</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="inst in detail.installments"
                :key="inst.id"
              >
                <td>{{ inst.installmentNumber }}</td>
                <td>{{ formatBRL(inst.amount) }}</td>
                <td>{{ formatDate(inst.expectedDate) }}</td>
                <td>
                  {{ formatDate(inst.receivedDate) }}
                  <div
                    v-if="inst.receivableId"
                    class="text-caption"
                  >
                    {{ formatBRL(finance.companyReceivables.find(r => r.id === inst.receivableId)?.receivedAmount) }}
                  </div>
                </td>
                <td>
                  <StatusChip
                    :value="inst.status"
                    :map="installmentStatusMeta"
                  />
                </td>
                <td class="text-end">
                  <VBtn
                    v-if="app.canManageFinance && canRecordReceipt(inst)"
                    size="x-small"
                    color="success"
                    variant="tonal"
                    :loading="busyId === inst.receivableId"
                    :disabled="busyId !== null"
                    @click="askReceive(inst)"
                  >
                    {{ inst.status === 'received' ? 'Conciliar' : 'Receber' }}
                  </VBtn>
                </td>
              </tr>
            </tbody>
          </VTable>

          <div class="text-overline mb-2">
            Divisão (splits)
          </div>
          <VTable density="compact">
            <thead>
              <tr>
                <th>Beneficiário</th>
                <th>%</th>
                <th>Valor</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="sp in detail.splits"
                :key="sp.id"
              >
                <td>
                  {{ beneficiaryTypeLabels[sp.beneficiaryType] }}
                  <span
                    v-if="sp.beneficiaryId"
                    class="text-disabled"
                  >· {{ finance.employeeName(sp.beneficiaryId) }}</span>
                </td>
                <td>{{ formatPercent(sp.percentage) }}</td>
                <td>{{ formatBRL(sp.amount) }}</td>
                <td>
                  <StatusChip
                    v-if="!sp.paidByBuilder"
                    :value="sp.status"
                    :map="splitStatusMeta"
                  />
                  <VChip
                    v-else
                    color="success"
                    size="small"
                    variant="tonal"
                  >
                    Pago pela construtora
                  </VChip>
                </td>
                <td class="text-end">
                  <VBtn
                    v-if="app.canManageFinance && sp.status === 'pending' && sp.payableId && canSettlePayable(sp.payableId)"
                    size="x-small"
                    color="primary"
                    variant="tonal"
                    :loading="busyId === sp.payableId"
                    :disabled="busyId !== null"
                    @click="askPay(sp.payableId, sp.beneficiaryType, sp.beneficiaryId)"
                  >
                    Pagar repasse
                  </VBtn>
                </td>
              </tr>
            </tbody>
          </VTable>
        </VCardText>
        <VDivider />
        <VCardText class="d-flex justify-end">
          <VBtn
            v-if="app.canManageFinance"
            variant="tonal"
            class="me-3"
            prepend-icon="ri-pencil-line"
            @click="current && openEdit(current)"
          >
            Editar
          </VBtn>
          <VBtn
            variant="tonal"
            color="secondary"
            @click="dialog = false"
          >
            Fechar
          </VBtn>
        </VCardText>
      </VCard>
    </VDialog>

    <VDialog
      v-model="editDialog"
      max-width="680"
      persistent
    >
      <VCard>
        <VCardItem>
          <VCardTitle>Editar comissão</VCardTitle>
          <VCardSubtitle>As parcelas e contas a receber serão sincronizadas automaticamente.</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <DialogCompanyContext class="mb-4" />
          <VAlert
            type="info"
            variant="tonal"
            density="compact"
            class="mb-4"
            text="Comissões já recebidas ou com repasses pagos exigem estorno/reabertura antes da edição."
          />
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
            ref="editFormRef"
            @submit.prevent="saveCommission"
          >
            <VRow>
              <VCol
                cols="12"
                md="6"
              >
                <VTextField
                  v-model.number="editForm.totalAmount"
                  label="Comissão total"
                  type="number"
                  prefix="R$"
                  :rules="[requiredRule, positiveRule]"
                />
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VSelect
                  v-model="editForm.receiptType"
                  label="Modelo de recebimento"
                  :items="receiptTypeOptions"
                  :rules="[requiredRule]"
                />
              </VCol>
              <VCol
                cols="12"
                md="4"
              >
                <VTextField
                  v-model.number="editForm.installments"
                  label="Parcelas"
                  type="number"
                  min="1"
                  max="120"
                  :rules="[requiredRule, positiveRule]"
                />
              </VCol>
              <VCol
                cols="12"
                md="8"
              >
                <VTextField
                  v-model="editForm.firstDueDate"
                  label="Primeiro vencimento"
                  type="date"
                  :rules="[requiredRule]"
                />
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VTextField
                  v-model.number="editForm.managerPct"
                  label="Gerente (%)"
                  type="number"
                  min="0"
                  max="100"
                />
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VTextField
                  v-model.number="editForm.captadorPct"
                  label="Captador (%)"
                  type="number"
                  min="0"
                  max="100"
                />
              </VCol>
              <VCol cols="12">
                <VTextarea
                  v-model="editForm.notes"
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
            @click="cancelEdit"
          >
            Cancelar
          </VBtn>
          <VBtn
            :loading="saving"
            :disabled="saving"
            @click="saveCommission"
          >
            Salvar alterações
          </VBtn>
        </VCardText>
      </VCard>
    </VDialog>

    <ConfirmDialog
      v-model="editGuard.prompt.value"
      v-bind="editGuard.dialogProps"
      :action="editGuard.discard"
    />

    <!-- Confirmação: receber parcela da comissão -->
    <ConfirmDialog
      v-model="receiveConfirm"
      title="Registrar recebimento da comissão"
      confirm-text="Salvar recebimento"
      confirm-color="success"
      :action="confirmReceive"
    >
      <DialogCompanyContext class="mb-4" />
      <template v-if="receiveAccount">
        <p class="mb-4">
          Parcela {{ receiveTarget?.installmentNumber }} · saldo previsto atual de <strong>{{ formatBRL(currentBalance) }}</strong>
        </p>
        <VSelect
          v-model="receiveForm.source"
          label="Origem do recebimento"
          :disabled="receiveAccount.status === 'received'"
          :items="[{ title: 'Registrar novo depósito', value: 'new' }, { title: 'Vincular depósito já lançado', value: 'existing' }]"
        />
        <VAutocomplete
          v-if="receiveForm.source === 'existing'"
          v-model="receiveForm.existingId"
          label="Recebimento já lançado"
          :items="existingReceipts"
          no-data-text="Nenhum recebimento elegível"
          hint="Confira valor, data e descrição. A entrada existente será vinculada à parcela."
          persistent-hint
        />
        <template v-else>
          <VTextField
            v-model.number="receiveForm.amount"
            label="Valor que entrou na conta da RE9 (R$)"
            type="number"
            min="0.01"
            step="0.01"
          />
          <VTextField
            v-model="receiveForm.date"
            label="Data do depósito"
            type="date"
            :max="todayISO()"
          />
          <VSelect
            v-model="receiveForm.method"
            label="Forma de recebimento"
            :items="receiptMethods"
          />
          <VTextField
            v-model="receiveForm.account"
            label="Conta bancária da RE9 (opcional)"
          />
        </template>
        <p
          v-if="receiveForm.source === 'existing' && selectedReceipt && !selectedReceipt.sameAccount"
          class="text-caption mb-4"
        >
          O título avulso será encerrado e a entrada que já está no caixa passará a identificar esta parcela.
        </p>
        <VSelect
          v-model="receiveForm.outcome"
          label="Situação da parcela"
          :disabled="receiveAccount.status === 'received'"
          :items="[{ title: 'Recebimento final · quitar parcela', value: 'final' }, { title: 'Recebimento parcial · deixar saldo em aberto', value: 'partial' }]"
        />
        <VTextField
          v-if="receiveForm.outcome === 'partial'"
          v-model.number="receiveForm.remaining"
          label="Valor que a RE9 ainda espera receber (R$)"
          type="number"
          min="0.01"
          step="0.01"
          :placeholder="suggestedRemaining > 0 ? String(suggestedRemaining) : undefined"
        />
        <VCheckbox
          v-if="receiveBroker"
          v-model="receiveForm.paidByBuilder"
          :disabled="receiveBroker.paidByBuilder"
          label="A construtora já pagou o corretor diretamente"
          hide-details
          class="mb-2"
        />
        <p
          v-if="receiveForm.paidByBuilder && !receiveBroker?.paidByBuilder"
          class="text-caption mb-3"
        >
          O repasse em aberto da RE9 será cancelado. Se houver histórico de pagamento pela RE9, o caso precisa de revisão manual.
        </p>
        <VTextarea
          v-if="needsReceiptReason"
          v-model="receiveForm.reason"
          label="Motivo do ajuste ou vínculo"
          rows="2"
          required
        />
        <VAlert
          v-if="receiveForm.source === 'new' && receiveForm.outcome === 'final' && receiveAccount.invoiceRule === 'on_receive'"
          type="info"
          variant="tonal"
          density="compact"
          class="mt-4"
        >
          Esta conta está configurada para gerar uma NFS-e pendente na baixa final.
        </VAlert>
      </template>
    </ConfirmDialog>

    <!-- Confirmação: pagar repasse -->
    <ConfirmDialog
      v-model="payConfirm"
      title="Confirmar pagamento do repasse"
      confirm-text="Confirmar pagamento"
      confirm-color="primary"
      :action="confirmPay"
    >
      <DialogCompanyContext class="mb-4" />
      <template v-if="payInfo">
        <div class="mb-2">
          Será registrado o pagamento deste repasse:
        </div>
        <div>Valor: <strong>{{ formatBRL(payInfo.amount) }}</strong> (todo o saldo em aberto do repasse)</div>
        <div>Data no caixa: <strong>{{ confirmDateLabel }}</strong></div>
        <VAlert
          v-if="confirmDateShifted"
          type="warning"
          variant="tonal"
          density="compact"
          class="my-2"
        >
          Depois das 21h o sistema registra no caixa a data do dia seguinte (correção prevista). Se preferir, faça esta baixa amanhã.
        </VAlert>
        <div>Forma de pagamento: <strong>não informada nesta baixa</strong></div>
        <div>Quem paga: <strong>{{ app.currentCompany.tradeName }}</strong></div>
        <div>Quem recebe: <strong>{{ payTarget?.beneficiary }}</strong></div>
      </template>
      <div v-else>
        Confirma o pagamento deste repasse?
      </div>
    </ConfirmDialog>

    <ConfirmDialog
      v-model="deleteDialog"
      title="Excluir comissão"
      confirm-text="Excluir"
      confirm-color="error"
      message="A comissão, suas parcelas e contas vinculadas ainda não liquidadas serão removidas. Registros com recebimentos ou pagamentos exigem estorno prévio. Deseja continuar?"
      :action="confirmDelete"
    />
  </div>
</template>
