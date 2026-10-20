<script setup lang="ts">
import { useFinanceStore } from '@/stores/finance'
import { useAppStore } from '@/stores/app'
import type { Commission, CommissionSplit, Payable } from '@/types/finance'

const finance = useFinanceStore()
const app = useAppStore()

useHead({ title: 'Portal do corretor' })

// 👉 Corretor atual: pelo userId logado (só colaboradores comissionados são
// corretores); se não houver, permite escolher um.
const ownBroker = computed(() =>
  finance.companyEmployees.find(e => e.userId === app.currentUserId && e.employmentType === 'commission_only'),
)

const commissionBrokers = computed(() =>
  finance.companyEmployees
    .filter(e => e.employmentType === 'commission_only')
    .map(e => ({ title: e.fullName, value: e.id })),
)

const brokerId = ref<string>('')

// quando não há corretor vinculado, pré-seleciona o primeiro comissionado
watch(
  [ownBroker, commissionBrokers],
  () => {
    if (ownBroker.value)
      brokerId.value = ownBroker.value.id
    else if (!app.isBroker && !brokerId.value && commissionBrokers.value.length)
      brokerId.value = commissionBrokers.value[0].value
  },
  { immediate: true },
)

const broker = computed(() =>
  finance.companyEmployees.find(e => e.id === brokerId.value),
)

const monthStart = computed(() => {
  const d = new Date()

  return new Date(d.getFullYear(), d.getMonth(), 1)
})

const inCurrentMonth = (iso?: string) => {
  if (!iso)
    return false

  // data pura como meia-noite local (evita off-by-one no dia 1º em UTC-3)
  const dd = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso)

  return dd >= monthStart.value && dd <= new Date()
}

// 👉 Vendas do corretor
const mySales = computed(() =>
  finance.companySales.filter(s => s.brokerId === brokerId.value),
)

// vendas distratadas não entram nos indicadores (C-11)
const myActiveSales = computed(() => mySales.value.filter(s => s.status !== 'cancelled'))

const mySalesMonth = computed(() =>
  myActiveSales.value.filter(s => inCurrentMonth(s.saleDate)),
)

const myVgv = computed(() => mySalesMonth.value.reduce((sum, s) => sum + s.saleValue, 0))

// 👉 Comissões das minhas vendas
const myCommissions = computed(() =>
  finance.companyCommissions.filter(c => {
    const sale = finance.saleById(c.saleId)

    return sale?.brokerId === brokerId.value
  }),
)

// 👉 Comissão acumulada / pendente — splits do tipo broker do corretor
const splitsOfBroker = (commissionId: string) =>
  finance.splitsOf(commissionId).filter(s => s.beneficiaryType === 'broker' && s.beneficiaryId === brokerId.value)

const isCancelledSale = (com: Commission) => finance.saleById(com.saleId)?.status === 'cancelled'

// KPIs: só splits de vendas não distratadas (C-11)
const mySplits = computed(() =>
  myCommissions.value
    .filter(c => !isCancelledSale(c))
    .flatMap(c => splitsOfBroker(c.id)),
)

const accumulatedCommission = computed(() =>
  mySplits.value.reduce((sum, s) => sum + s.amount, 0),
)

const pendingCommission = computed(() =>
  mySplits.value.filter(s => s.status === 'pending').reduce((sum, s) => sum + s.amount, 0),
)

// 👉 Repasse do corretor (C-09 / C-10): o status vem da conta a pagar vinculada
// ao split dele — nunca do total da comissão da imobiliária.
type PayoutState = 'paid' | 'partial' | 'pending' | 'overdue' | 'cancelled' | 'awaiting' | 'not_applicable'

const payoutMeta: Record<PayoutState, { label: string; color: string }> = {
  paid: { label: 'Repasse pago', color: 'success' },
  partial: { label: 'Repasse parcial', color: 'info' },
  pending: { label: 'Repasse pendente', color: 'warning' },
  overdue: { label: 'Repasse em atraso', color: 'error' },
  cancelled: { label: 'Repasse cancelado', color: 'secondary' },
  awaiting: { label: 'Aguardando lançamento', color: 'secondary' },
  not_applicable: { label: 'Não se aplica', color: 'secondary' },
}

const payableById = computed(() => {
  const map = new Map<string, Payable>()
  for (const p of finance.companyPayables)
    map.set(p.id, p)

  return map
})

function payoutOf(split: CommissionSplit): { state: PayoutState; text: string } {
  const payable = split.payableId ? payableById.value.get(split.payableId) : undefined

  if (payable) {
    if (payable.status === 'paid')
      return { state: 'paid', text: payable.paidAt ? `Pago em ${formatDate(payable.paidAt)}` : 'Pago' }
    if (payable.status === 'partial')
      return { state: 'partial', text: `Parcial — ${formatBRL(payable.paidAmount ?? 0)} de ${formatBRL(payable.amount)} pagos` }
    if (payable.status === 'cancelled')
      return { state: 'cancelled', text: 'Repasse cancelado' }

    return {
      state: payable.status === 'overdue' ? 'overdue' : 'pending',
      text: `Pendente — previsto para ${formatDate(payable.dueDate)}`,
    }
  }

  // conta vinculada não carregada (ou ainda não lançada): usa o status do split
  if (split.status === 'paid')
    return { state: 'paid', text: 'Pago' }
  if (split.status === 'not_applicable')
    return { state: 'not_applicable', text: 'Não se aplica' }
  if (split.payableId)
    return { state: 'pending', text: 'Pendente' }

  return { state: 'awaiting', text: 'Aguardando lançamento do repasse' }
}

function headerStateOf(states: PayoutState[]): PayoutState {
  if (!states.length)
    return 'awaiting'
  if (states.length === 1 || states.every(st => st === states[0]))
    return states[0]
  if (states.some(st => st === 'paid' || st === 'partial'))
    return 'partial'

  return states[0]
}

const commissionRows = computed(() =>
  myCommissions.value.map(com => {
    const splits = splitsOfBroker(com.id).map(split => ({ split, payout: payoutOf(split) }))
    const installments = finance.installmentsOf(com.id).filter(i => i.status !== 'cancelled')
    const received = installments.filter(i => i.status === 'received').length

    return {
      com,
      sale: finance.saleById(com.saleId),
      splits,
      myAmount: splits.length ? splits.reduce((sum, s) => sum + s.split.amount, 0) : null,
      headerState: headerStateOf(splits.map(s => s.payout.state)),
      installmentsTotal: installments.length,
      installmentsReceived: received,
      nextExpectedDate: installments.find(i => i.status !== 'received')?.expectedDate,
    }
  }),
)

const kpis = computed(() => [
  { title: 'Minhas vendas (mês)', value: String(mySalesMonth.value.length), icon: 'ri-home-4-line', color: 'primary', subtitle: `${myActiveSales.value.length} no total` },
  { title: 'VGV do mês', value: formatBRLCompact(myVgv.value), icon: 'ri-funds-line', color: 'info', subtitle: 'Valor geral de vendas' },
  { title: 'Comissão acumulada', value: formatBRL(accumulatedCommission.value), icon: 'ri-hand-coin-line', color: 'success', subtitle: 'Sua parte (sem distratos)' },
  { title: 'Comissão pendente', value: formatBRL(pendingCommission.value), icon: 'ri-time-line', color: 'warning', subtitle: 'A receber' },
])

const salesHeaders = [
  { title: 'Empreendimento', key: 'development' },
  { title: 'Comprador', key: 'buyerName' },
  { title: 'VGV', key: 'saleValue', align: 'end' as const },
  { title: 'Data', key: 'saleDate' },
  { title: 'Status', key: 'status' },
]

// 👉 Funil do corretor agrupado por estágio
const myFunnelByStage = computed(() =>
  funnelStages.map(st => ({
    ...st,
    count: finance.companyFunnel.filter(
      c => c.brokerId === brokerId.value && c.currentStage === st.value,
    ).length,
  })),
)
</script>

<template>
  <div>
    <AppPageHeader
      title="Portal do corretor"
      subtitle="Acompanhe suas vendas, comissões e funil"
      icon="ri-user-star-line"
    />

    <!-- Exclusivo da imobiliária -->
    <VAlert
      v-if="app.isAgency"
      type="warning"
      variant="tonal"
      icon="ri-lock-line"
      text="Disponível apenas para a imobiliária."
    />

    <template v-else>
      <!-- Seletor de corretor (quando o usuário logado não é corretor) -->
      <VCard
        v-if="!app.isBroker && !ownBroker"
        class="mb-6"
      >
        <VCardText>
          <VSelect
            v-model="brokerId"
            label="Visualizar como corretor"
            :items="commissionBrokers"
            prepend-inner-icon="ri-user-line"
            density="compact"
            hide-details
            style="max-inline-size: 360px;"
          />
        </VCardText>
      </VCard>

      <VAlert
        v-if="app.isBroker && !ownBroker"
        type="error"
        variant="tonal"
        class="mb-6"
        text="Seu usuário ainda não está vinculado a um cadastro de corretor. Solicite o vínculo a um administrador."
      />

      <template v-if="broker">
        <div class="text-h6 mb-3">
          {{ broker.fullName }}
        </div>

        <!-- KPIs -->
        <VRow class="match-height">
          <VCol
            v-for="kpi in kpis"
            :key="kpi.title"
            cols="12"
            sm="6"
            lg="3"
          >
            <KpiCard v-bind="kpi" />
          </VCol>
        </VRow>

        <!-- Funil -->
        <VRow class="mt-1">
          <VCol cols="12">
            <VCard title="Meu funil">
              <VCardText>
                <div class="d-flex flex-wrap justify-space-between gap-4">
                  <div
                    v-for="st in myFunnelByStage"
                    :key="st.value"
                    class="text-center flex-grow-1"
                  >
                    <VAvatar
                      :color="st.color"
                      variant="tonal"
                      size="48"
                      class="mb-2"
                    >
                      <span class="text-h6">{{ st.count }}</span>
                    </VAvatar>
                    <div class="text-body-2">
                      {{ funnelStageLabels[st.value] }}
                    </div>
                  </div>
                </div>
              </VCardText>
            </VCard>
          </VCol>
        </VRow>

        <!-- Minhas vendas -->
        <VRow class="mt-1">
          <VCol cols="12">
            <VCard title="Minhas vendas">
              <VDataTable
                :headers="salesHeaders"
                :items="mySales"
                item-value="id"
                :items-per-page="10"
                class="text-no-wrap"
              >
                <template #item.development="{ item }">
                  {{ finance.developmentName(item.developmentId) }}
                </template>
                <template #item.saleValue="{ item }">
                  {{ formatBRL(item.saleValue) }}
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
                <template #no-data>
                  <div class="text-center py-8 text-disabled">
                    Nenhuma venda registrada
                  </div>
                </template>
              </VDataTable>
            </VCard>
          </VCol>
        </VRow>

        <!-- Minhas comissões -->
        <VRow class="mt-1">
          <VCol cols="12">
            <VCard title="Minhas comissões">
              <VCardText>
                <div
                  v-if="!myCommissions.length"
                  class="text-center py-8 text-disabled"
                >
                  Nenhuma comissão gerada
                </div>
                <VExpansionPanels
                  v-else
                  variant="accordion"
                >
                  <VExpansionPanel
                    v-for="row in commissionRows"
                    :key="row.com.id"
                  >
                    <VExpansionPanelTitle>
                      <div class="d-flex align-center justify-space-between flex-wrap gap-2 flex-grow-1 me-3">
                        <div>
                          <div class="font-weight-medium">
                            {{ row.sale?.buyerName ?? '—' }}
                            <VChip
                              v-if="row.sale?.status === 'cancelled'"
                              size="x-small"
                              label
                              color="error"
                              class="ms-2"
                            >
                              Distratada
                            </VChip>
                          </div>
                          <div class="text-caption text-disabled">
                            {{ finance.developmentName(row.sale?.developmentId) }}
                          </div>
                        </div>
                        <div class="d-flex align-center gap-x-3">
                          <div class="text-end">
                            <div class="text-caption text-disabled">
                              Sua parte
                            </div>
                            <span class="font-weight-medium">{{ row.myAmount === null ? '—' : formatBRL(row.myAmount) }}</span>
                          </div>
                          <VChip
                            size="small"
                            label
                            :color="payoutMeta[row.headerState].color"
                          >
                            {{ payoutMeta[row.headerState].label }}
                          </VChip>
                        </div>
                      </div>
                    </VExpansionPanelTitle>
                    <VExpansionPanelText>
                      <VTimeline
                        side="end"
                        density="compact"
                        truncate-line="both"
                      >
                        <!-- Etapa 1: construtora → imobiliária -->
                        <VTimelineItem
                          :dot-color="row.installmentsTotal && row.installmentsReceived === row.installmentsTotal ? 'success' : 'warning'"
                          size="x-small"
                        >
                          <div class="font-weight-medium">
                            Imobiliária recebeu da construtora: {{ row.installmentsReceived }} de {{ row.installmentsTotal }} {{ row.installmentsTotal === 1 ? 'parcela' : 'parcelas' }}
                          </div>
                          <div
                            v-if="row.nextExpectedDate"
                            class="text-caption text-disabled"
                          >
                            Próxima prevista para {{ formatDate(row.nextExpectedDate) }}
                          </div>
                        </VTimelineItem>

                        <!-- Etapa 2: imobiliária → corretor -->
                        <VTimelineItem
                          :dot-color="payoutMeta[row.headerState].color"
                          size="x-small"
                        >
                          <template v-if="row.splits.length">
                            <div
                              v-for="s in row.splits"
                              :key="s.split.id"
                            >
                              <span class="font-weight-medium">Seu repasse: {{ s.payout.text }}</span>
                              <div
                                v-if="row.splits.length > 1"
                                class="text-caption text-disabled"
                              >
                                {{ formatBRL(s.split.amount) }}
                              </div>
                            </div>
                          </template>
                          <span
                            v-else
                            class="font-weight-medium"
                          >
                            Seu repasse: Aguardando lançamento do repasse
                          </span>
                        </VTimelineItem>
                      </VTimeline>
                    </VExpansionPanelText>
                  </VExpansionPanel>
                </VExpansionPanels>
              </VCardText>
            </VCard>
          </VCol>
        </VRow>
      </template>

      <VAlert
        v-else
        type="info"
        variant="tonal"
        text="Nenhum corretor disponível para exibição."
      />
    </template>
  </div>
</template>
