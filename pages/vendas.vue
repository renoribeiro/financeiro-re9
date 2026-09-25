<script setup lang="ts">
import { useFinanceStore } from '@/stores/finance'
import { useAppStore } from '@/stores/app'
import { type DateWindow, isWithin } from '@/utils/dateFilter'
import type { CommissionCalculationMode, Development, Sale } from '@/types/finance'
import {
  calculateCommissionTotal,
  equivalentCommissionPercentage,
} from '@/utils/commissionCalculation'

const finance = useFinanceStore()
const app = useAppStore()

useHead({ title: 'Vendas' })

// corretor logado — o perfil corretor vê SOMENTE as próprias vendas (spec §3.13)
const ownBrokerId = computed(() =>
  finance.companyEmployees.find(e => e.userId === app.currentUserId && e.employmentType === 'commission_only')?.id,
)

const visibleSales = computed(() =>
  app.isBroker
    ? finance.companySales.filter(s => s.brokerId === ownBrokerId.value)
    : finance.companySales,
)

// 👉 Filtro de período (afeta KPIs + tabela)
const periodWindow = ref<DateWindow>({ start: null, end: null })

const filteredSales = computed(() =>
  visibleSales.value.filter(s => isWithin(s.saleDate, periodWindow.value)),
)

// 👉 KPIs
const totalSales = computed(() => filteredSales.value.length)
const totalVgv = computed(() => filteredSales.value.reduce((acc, s) => acc + s.saleValue, 0))

const totalCommission = computed(() =>
  filteredSales.value.reduce((acc, s) => {
    const c = finance.commissionOfSale(s.id)

    return acc + (c?.totalAmount ?? 0)
  }, 0),
)

const headers = [
  { title: 'Empreendimento', key: 'developmentId' },
  { title: 'Comprador', key: 'buyerName' },
  { title: 'VGV', key: 'saleValue', align: 'end' as const },
  { title: 'Corretor', key: 'brokerId' },
  { title: 'Forma pgto', key: 'paymentMethod' },
  { title: 'Data', key: 'saleDate' },
  { title: 'Status', key: 'status' },
  { title: 'Comissão', key: 'commission', sortable: false, align: 'end' as const },
  { title: '', key: 'actions', sortable: false, align: 'end' as const },
]

// 👉 Selects do dialog
const developmentOptions = computed(() =>
  finance.companyDevelopments.map(dv => ({ title: dv.name, value: dv.id })),
)

const brokerOptions = computed(() =>
  finance.companyEmployees
    .filter(e => e.employmentType === 'commission_only' && e.status === 'active')
    .map(e => ({ title: e.fullName, value: e.id })),
)

const paymentMethodOptions = Object.entries(paymentMethodLabels).map(([value, title]) => ({ title, value }))
const statusOptions = Object.entries(saleStatusMeta).map(([value, m]) => ({ title: m.label, value }))

// 👉 Dialog nova venda
const dialog = ref(false)
const formRef = ref()
const editing = ref<Partial<Sale>>({})

const commission = ref<{
  installments: number
  managerPct: number
  captadorPct: number
  calculationMode: CommissionCalculationMode
  percentage: number
  totalAmount: number
}>({
  installments: 1,
  managerPct: 0,
  captadorPct: 0,
  calculationMode: 'percentage',
  percentage: 0,
  totalAmount: 0,
})

const commissionTouched = ref(false)
const saving = ref(false)
const formError = ref('')
const detailsDialog = ref(false)
const selected = ref<Sale | null>(null)
const quickDevelopmentDialog = ref(false)

const selectedDevelopment = computed(() =>
  finance.companyDevelopments.find(item => item.id === editing.value.developmentId),
)

const commissionTotalPreview = computed(() => calculateCommissionTotal({
  mode: commission.value.calculationMode,
  saleValue: Number(editing.value.saleValue ?? 0),
  percentage: Number(commission.value.percentage ?? 0),
  manualAmount: Number(commission.value.totalAmount ?? 0),
}))

const equivalentPercentage = computed(() => equivalentCommissionPercentage(
  commissionTotalPreview.value,
  Number(editing.value.saleValue ?? 0),
))

const calculationModeOptions = [
  { title: 'Calcular por alíquota', value: 'percentage' },
  { title: 'Definir valor manual', value: 'manual_amount' },
]

function applyDevelopmentCommission(force = false) {
  if (!selectedDevelopment.value || (!force && commissionTouched.value))
    return

  commission.value.calculationMode = 'percentage'
  commission.value.percentage = Number(selectedDevelopment.value.commissionPercentage ?? 0)
  commission.value.totalAmount = 0
}

function changeCalculationMode(mode: CommissionCalculationMode) {
  const currentTotal = commissionTotalPreview.value

  commission.value.calculationMode = mode
  if (mode === 'manual_amount')
    commission.value.totalAmount = currentTotal
  commissionTouched.value = true
}

watch(() => editing.value.developmentId, () => {
  if (dialog.value)
    applyDevelopmentCommission()
})

function openNew() {
  editing.value = {
    paymentMethod: 'cash',
    status: 'in_progress',
    saleDate: todayISO(),
    saleValue: 0,
  }
  commission.value = {
    installments: 1,
    managerPct: 0,
    captadorPct: 0,
    calculationMode: 'percentage',
    percentage: 0,
    totalAmount: 0,
  }
  commissionTouched.value = false
  formError.value = ''
  dialog.value = true
}

function openEdit(s: Sale) {
  const existingCommission = finance.commissionOfSale(s.id)
  const splits = existingCommission ? finance.splitsOf(existingCommission.id) : []

  editing.value = { ...s }
  commission.value = {
    installments: existingCommission ? finance.installmentsOf(existingCommission.id).length : 1,
    managerPct: splits.find(sp => sp.beneficiaryType === 'manager')?.percentage ?? 0,
    captadorPct: splits.find(sp => sp.beneficiaryType === 'captador')?.percentage ?? 0,
    calculationMode: s.commissionCalculationMode ?? 'percentage',
    percentage: Number(s.commissionPercentage ?? 0),
    totalAmount: Number(s.commissionAmountOverride ?? existingCommission?.totalAmount ?? 0),
  }
  commissionTouched.value = true
  formError.value = ''
  detailsDialog.value = false
  dialog.value = true
}

function openQuickDevelopment() {
  quickDevelopmentDialog.value = true
}

function selectCreatedDevelopment(development: Development) {
  editing.value.developmentId = development.id
  commissionTouched.value = false
  nextTick(() => applyDevelopmentCommission(true))
  quickDevelopmentDialog.value = false
}

async function save() {
  const { valid } = await formRef.value.validate()
  if (!valid)
    return
  if (commission.value.calculationMode === 'percentage' && Number(commission.value.percentage) <= 0) {
    formError.value = 'Informe uma alíquota de comissão maior que zero.'

    return
  }
  if (commission.value.calculationMode === 'manual_amount' && commissionTotalPreview.value <= 0) {
    formError.value = 'Informe um valor manual de comissão maior que zero.'

    return
  }
  saving.value = true
  formError.value = ''
  try {
    await finance.saveSale(editing.value, true, {
      installments: Number(commission.value.installments) || 1,
      managerPct: Number(commission.value.managerPct) || 0,
      captadorPct: Number(commission.value.captadorPct) || 0,
      calculationMode: commission.value.calculationMode,
      commissionPercentage: Number(commission.value.percentage) || 0,
      commissionAmountOverride: commission.value.calculationMode === 'manual_amount'
        ? commissionTotalPreview.value
        : undefined,
    })
    dialog.value = false
  }
  catch (error) {
    formError.value = (error as Error).message
  }
  finally {
    saving.value = false
  }
}

// 👉 Detalhes da venda
const selectedCommission = computed(() =>
  selected.value ? finance.commissionOfSale(selected.value.id) : undefined,
)

const selectedInstallments = computed(() =>
  selectedCommission.value ? finance.installmentsOf(selectedCommission.value.id) : [],
)

const selectedSplits = computed(() =>
  selectedCommission.value ? finance.splitsOf(selectedCommission.value.id) : [],
)

function openDetails(s: Sale) {
  selected.value = s
  detailsDialog.value = true
}

const deleteDialog = ref(false)
const deleteTarget = ref<Sale | null>(null)
const deleteError = ref('')

function askDelete(s: Sale) {
  deleteTarget.value = s
  deleteError.value = ''
  deleteDialog.value = true
}

async function confirmDelete() {
  if (!deleteTarget.value)
    return
  try {
    await finance.deleteSale(deleteTarget.value.id)
    deleteTarget.value = null
  }
  catch (error) {
    deleteError.value = (error as Error).message
  }
}
</script>

<template>
  <div>
    <AppPageHeader
      title="Vendas"
      subtitle="Vendas registradas e comissões geradas"
      icon="ri-hand-coin-line"
    >
      <template #actions>
        <VBtn
          v-if="!app.isReadOnly && !app.isAgency"
          prepend-icon="ri-add-line"
          @click="openNew"
        >
          Nova venda
        </VBtn>
      </template>
    </AppPageHeader>

    <VAlert
      v-if="app.isAgency"
      type="info"
      variant="tonal"
      title="Módulo exclusivo da imobiliária"
      text="O registro de vendas e comissões só está disponível para empresas do tipo imobiliária."
    />

    <template v-else>
      <VRow class="mb-2">
        <VCol
          cols="12"
          sm="4"
        >
          <KpiCard
            title="Vendas"
            :value="String(totalSales)"
            icon="ri-file-list-3-line"
          />
        </VCol>
        <VCol
          cols="12"
          sm="4"
        >
          <KpiCard
            title="VGV total"
            :value="formatBRLCompact(totalVgv)"
            icon="ri-line-chart-line"
          />
        </VCol>
        <VCol
          cols="12"
          sm="4"
        >
          <KpiCard
            title="Comissão gerada"
            :value="formatBRL(totalCommission)"
            icon="ri-coins-line"
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
          :items="filteredSales"
          :items-per-page="10"
          item-value="id"
          class="text-no-wrap"
        >
          <template #item.developmentId="{ item }">
            <div class="py-2">
              <div class="font-weight-medium">
                {{ finance.developmentName(item.developmentId) }}
              </div>
              <div
                v-if="item.unit"
                class="text-caption text-disabled"
              >
                {{ item.unit }}
              </div>
            </div>
          </template>

          <template #item.buyerName="{ item }">
            <div>
              <div>{{ item.buyerName }}</div>
              <div
                v-if="item.buyerDocument"
                class="text-caption text-disabled"
              >
                {{ formatDocument(item.buyerDocument) }}
              </div>
            </div>
          </template>

          <template #item.saleValue="{ item }">
            {{ formatBRL(item.saleValue) }}
          </template>

          <template #item.brokerId="{ item }">
            {{ finance.employeeName(item.brokerId) }}
          </template>

          <template #item.paymentMethod="{ item }">
            {{ paymentMethodLabels[item.paymentMethod] }}
          </template>

          <template #item.saleDate="{ item }">
            {{ formatDate(item.saleDate) }}
          </template>

          <template #item.status="{ item }">
            <StatusChip
              :value="item.status"
              :map="saleStatusMeta"
            />
          </template>

          <template #item.commission="{ item }">
            <template v-if="finance.commissionOfSale(item.id)">
              {{ formatBRL(finance.commissionOfSale(item.id)?.totalAmount) }}
            </template>
            <span
              v-else
              class="text-disabled"
            >Não gerada</span>
          </template>

          <template #item.actions="{ item }">
            <div class="d-flex justify-end ga-1">
              <IconBtn
                aria-label="Ver detalhes da venda"
                @click="openDetails(item)"
              >
                <VIcon icon="ri-eye-line" />
                <VTooltip activator="parent">
                  Ver detalhes
                </VTooltip>
              </IconBtn>
              <IconBtn
                v-if="!app.isReadOnly"
                aria-label="Editar venda"
                @click="openEdit(item)"
              >
                <VIcon icon="ri-pencil-line" />
                <VTooltip activator="parent">
                  Editar
                </VTooltip>
              </IconBtn>
              <IconBtn
                v-if="app.isAdmin"
                aria-label="Excluir venda"
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

          <template #no-data>
            <div class="text-center py-8 text-disabled">
              Nenhuma venda registrada
            </div>
          </template>
        </VDataTable>
      </VCard>
    </template>

    <!-- Dialog nova venda -->
    <VDialog
      v-model="dialog"
      max-width="720"
      persistent
    >
      <VCard>
        <VCardItem>
          <VCardTitle>{{ editing.id ? 'Editar venda' : 'Nova venda' }}</VCardTitle>
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
                md="8"
              >
                <div class="d-flex align-start ga-2">
                  <VSelect
                    v-model="editing.developmentId"
                    class="flex-grow-1"
                    label="Empreendimento"
                    :items="developmentOptions"
                    :rules="[requiredRule]"
                  />
                  <VBtn
                    v-if="app.canManageFinance"
                    type="button"
                    icon
                    variant="tonal"
                    color="primary"
                    height="56"
                    min-width="48"
                    aria-label="Cadastrar novo empreendimento"
                    @click="openQuickDevelopment"
                  >
                    <VIcon icon="ri-add-line" />
                    <VTooltip activator="parent">
                      Cadastrar empreendimento
                    </VTooltip>
                  </VBtn>
                </div>
              </VCol>
              <VCol
                cols="12"
                md="4"
              >
                <VTextField
                  v-model="editing.unit"
                  label="Unidade"
                />
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VTextField
                  v-model.number="editing.saleValue"
                  label="VGV (valor da venda)"
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
                  v-model="editing.brokerId"
                  label="Corretor"
                  :items="brokerOptions"
                  :rules="[requiredRule]"
                />
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VTextField
                  v-model="editing.buyerName"
                  label="Comprador"
                  :rules="[requiredRule]"
                />
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VTextField
                  v-model="editing.buyerDocument"
                  label="CPF / CNPJ do comprador"
                />
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VTextField
                  v-model="editing.buyerContact"
                  label="Contato do comprador"
                />
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VSelect
                  v-model="editing.paymentMethod"
                  label="Forma de pagamento"
                  :items="paymentMethodOptions"
                />
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VTextField
                  v-model="editing.saleDate"
                  label="Data da venda"
                  type="date"
                />
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VSelect
                  v-model="editing.status"
                  label="Status"
                  :items="statusOptions"
                />
              </VCol>
              <VCol cols="12">
                <VDivider class="mb-2" />
                <div class="text-overline mb-1">
                  Comissão
                </div>
              </VCol>
              <VCol
                cols="12"
                md="4"
              >
                <VSelect
                  :model-value="commission.calculationMode"
                  label="Forma de cálculo"
                  :items="calculationModeOptions"
                  :readonly="!app.canManageFinance"
                  @update:model-value="changeCalculationMode"
                />
              </VCol>
              <VCol
                cols="12"
                md="4"
              >
                <VTextField
                  v-if="commission.calculationMode === 'percentage'"
                  v-model.number="commission.percentage"
                  label="Alíquota da comissão"
                  type="number"
                  min="0.000001"
                  max="100"
                  step="0.000001"
                  suffix="%"
                  :readonly="!app.canManageFinance"
                  :rules="[requiredRule, positiveRule]"
                  @update:model-value="commissionTouched = true"
                />
                <VTextField
                  v-else
                  :model-value="equivalentPercentage"
                  label="Alíquota equivalente"
                  suffix="%"
                  readonly
                  hint="Informativa; o valor manual prevalece"
                  persistent-hint
                />
              </VCol>
              <VCol
                cols="12"
                md="4"
              >
                <VTextField
                  v-if="commission.calculationMode === 'manual_amount'"
                  v-model.number="commission.totalAmount"
                  label="Valor total da comissão"
                  type="number"
                  min="0.01"
                  step="0.01"
                  prefix="R$"
                  :readonly="!app.canManageFinance"
                  :rules="[requiredRule, positiveRule]"
                  @update:model-value="commissionTouched = true"
                />
                <VTextField
                  v-else
                  :model-value="commissionTotalPreview"
                  label="Valor total da comissão"
                  prefix="R$"
                  readonly
                />
              </VCol>
              <VCol
                v-if="selectedDevelopment && app.canManageFinance"
                cols="12"
                class="d-flex align-center justify-space-between pt-0"
              >
                <span class="text-caption text-medium-emphasis">
                  Padrão de {{ selectedDevelopment.name }}: {{ selectedDevelopment.commissionPercentage }}%
                </span>
                <VBtn
                  type="button"
                  size="small"
                  variant="text"
                  @click="commissionTouched = false; applyDevelopmentCommission(true)"
                >
                  Restaurar padrão
                </VBtn>
              </VCol>
              <VCol
                cols="12"
                md="4"
              >
                <VTextField
                  v-model.number="commission.installments"
                  label="Parcelas da comissão"
                  type="number"
                  min="1"
                  max="12"
                />
              </VCol>
              <VCol
                cols="12"
                md="4"
              >
                <VTextField
                  v-model.number="commission.managerPct"
                  label="% gerente (opcional)"
                  type="number"
                  suffix="%"
                />
              </VCol>
              <VCol
                cols="12"
                md="4"
              >
                <VTextField
                  v-model.number="commission.captadorPct"
                  label="% captador (opcional)"
                  type="number"
                  suffix="%"
                />
              </VCol>
              <VCol cols="12">
                <VAlert
                  type="info"
                  variant="tonal"
                  density="compact"
                >
                  Comissão prevista: <strong>{{ formatBRL(commissionTotalPreview) }}</strong>.
                  A alíquota do empreendimento é apenas o padrão inicial; a condição salva nesta venda
                  será preservada mesmo que o empreendimento seja alterado depois.
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
            @click="save"
          >
            Salvar
          </VBtn>
        </VCardText>
      </VCard>
    </VDialog>

    <CommercialDevelopmentFormDialog
      v-model="quickDevelopmentDialog"
      @saved="selectCreatedDevelopment"
    />

    <!-- Dialog detalhes -->
    <VDialog
      v-model="detailsDialog"
      max-width="720"
    >
      <VCard v-if="selected">
        <VCardItem>
          <VCardTitle>Detalhes da venda</VCardTitle>
          <VCardSubtitle>{{ finance.developmentName(selected.developmentId) }}{{ selected.unit ? ` — ${selected.unit}` : '' }}</VCardSubtitle>
        </VCardItem>

        <VCardText>
          <VRow dense>
            <VCol
              cols="12"
              md="6"
            >
              <div class="text-caption text-disabled">
                Comprador
              </div>
              <div>
                {{ selected.buyerName }} <span
                  v-if="selected.buyerDocument"
                  class="text-disabled"
                >({{ formatDocument(selected.buyerDocument) }})</span>
              </div>
            </VCol>
            <VCol
              cols="12"
              md="6"
            >
              <div class="text-caption text-disabled">
                Corretor
              </div>
              <div>{{ finance.employeeName(selected.brokerId) }}</div>
            </VCol>
            <VCol
              cols="12"
              md="4"
            >
              <div class="text-caption text-disabled">
                VGV
              </div>
              <div>{{ formatBRL(selected.saleValue) }}</div>
            </VCol>
            <VCol
              cols="12"
              md="4"
            >
              <div class="text-caption text-disabled">
                Forma de pagamento
              </div>
              <div>{{ paymentMethodLabels[selected.paymentMethod] }}</div>
            </VCol>
            <VCol
              cols="12"
              md="4"
            >
              <div class="text-caption text-disabled">
                Data
              </div>
              <div>{{ formatDate(selected.saleDate) }}</div>
            </VCol>
            <VCol cols="12">
              <div class="text-caption text-disabled">
                Status
              </div>
              <StatusChip
                :value="selected.status"
                :map="saleStatusMeta"
              />
            </VCol>
          </VRow>

          <VDivider class="my-4" />

          <div class="text-subtitle-1 mb-2">
            Comissão
          </div>

          <template v-if="selectedCommission">
            <VRow
              dense
              class="mb-2"
            >
              <VCol
                cols="12"
                md="6"
              >
                <div class="text-caption text-disabled">
                  Total da comissão
                </div>
                <div class="font-weight-medium">
                  {{ formatBRL(selectedCommission.totalAmount) }}
                </div>
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <div class="text-caption text-disabled">
                  Tipo de recebimento
                </div>
                <div>{{ receiptTypeLabels[selectedCommission.receiptType] }}</div>
              </VCol>
            </VRow>

            <div class="text-caption text-disabled mt-2 mb-1">
              Parcelas
            </div>
            <VTable density="compact">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Valor</th>
                  <th>Previsto</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="inst in selectedInstallments"
                  :key="inst.id"
                >
                  <td>{{ inst.installmentNumber }}</td>
                  <td>{{ formatBRL(inst.amount) }}</td>
                  <td>{{ formatDate(inst.expectedDate) }}</td>
                  <td>
                    <StatusChip
                      :value="inst.status"
                      :map="installmentStatusMeta"
                    />
                  </td>
                </tr>
              </tbody>
            </VTable>

            <div class="text-caption text-disabled mt-4 mb-1">
              Divisão (splits)
            </div>
            <VTable density="compact">
              <thead>
                <tr>
                  <th>Beneficiário</th>
                  <th>%</th>
                  <th>Valor</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="split in selectedSplits"
                  :key="split.id"
                >
                  <td>
                    {{ beneficiaryTypeLabels[split.beneficiaryType] }}
                    <span
                      v-if="split.beneficiaryId"
                      class="text-disabled"
                    >— {{ finance.employeeName(split.beneficiaryId) }}</span>
                  </td>
                  <td>{{ formatPercent(split.percentage) }}</td>
                  <td>{{ formatBRL(split.amount) }}</td>
                  <td>
                    <StatusChip
                      :value="split.status"
                      :map="splitStatusMeta"
                    />
                  </td>
                </tr>
              </tbody>
            </VTable>
          </template>

          <VAlert
            v-else
            type="warning"
            variant="tonal"
            density="compact"
          >
            Nenhuma comissão gerada para esta venda.
          </VAlert>
        </VCardText>

        <VCardText class="d-flex justify-end pt-0">
          <VBtn
            v-if="!app.isReadOnly"
            variant="tonal"
            class="me-3"
            prepend-icon="ri-pencil-line"
            @click="selected && openEdit(selected)"
          >
            Editar
          </VBtn>
          <VBtn
            variant="tonal"
            color="secondary"
            @click="detailsDialog = false"
          >
            Fechar
          </VBtn>
        </VCardText>
      </VCard>
    </VDialog>

    <VAlert
      v-if="deleteError"
      type="error"
      variant="tonal"
      closable
      class="mt-4"
      :text="deleteError"
      @click:close="deleteError = ''"
    />
    <ConfirmDialog
      v-model="deleteDialog"
      title="Excluir venda"
      confirm-text="Excluir"
      confirm-color="error"
      :message="`A venda de '${deleteTarget?.buyerName}' e sua comissão/contas ainda não liquidadas serão removidas. Registros com recebimentos ou pagamentos exigem estorno prévio. Deseja continuar?`"
      @confirm="confirmDelete"
    />
  </div>
</template>
