<script setup lang="ts">
import { useFinanceStore } from '@/stores/finance'
import { useAppStore } from '@/stores/app'
import { isWithin, type DateWindow } from '@/utils/dateFilter'
import type { Sale } from '@/types/finance'

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
const commission = ref({ installments: 1, managerPct: 0, captadorPct: 0 })

function openNew() {
  editing.value = {
    paymentMethod: 'cash',
    status: 'in_progress',
    saleDate: todayISO(),
    saleValue: 0,
  }
  commission.value = { installments: 1, managerPct: 0, captadorPct: 0 }
  dialog.value = true
}
async function save() {
  const { valid } = await formRef.value.validate()
  if (!valid)
    return
  finance.saveSale(editing.value, true, {
    installments: Number(commission.value.installments) || 1,
    managerPct: Number(commission.value.managerPct) || 0,
    captadorPct: Number(commission.value.captadorPct) || 0,
  })
  dialog.value = false
}

// 👉 Detalhes da venda
const detailsDialog = ref(false)
const selected = ref<Sale | null>(null)

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
            <div class="d-flex justify-end">
              <IconBtn
                aria-label="Ver detalhes da venda"
                @click="openDetails(item)"
              >
                <VIcon icon="ri-eye-line" />
                <VTooltip activator="parent">
                  Ver detalhes
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
          <VCardTitle>Nova venda</VCardTitle>
        </VCardItem>
        <VCardText>
          <VForm
            ref="formRef"
            @submit.prevent="save"
          >
            <VRow>
              <VCol
                cols="12"
                md="8"
              >
                <VSelect
                  v-model="editing.developmentId"
                  label="Empreendimento"
                  :items="developmentOptions"
                  :rules="[requiredRule]"
                />
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
                  Ao salvar, a comissão é gerada automaticamente conforme as regras do empreendimento
                  (parcelas + splits informados).
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
          <VBtn @click="save">
            Salvar
          </VBtn>
        </VCardText>
      </VCard>
    </VDialog>

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
            variant="tonal"
            color="secondary"
            @click="detailsDialog = false"
          >
            Fechar
          </VBtn>
        </VCardText>
      </VCard>
    </VDialog>
  </div>
</template>
