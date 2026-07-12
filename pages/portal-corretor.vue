<script setup lang="ts">
import { useFinanceStore } from '@/stores/finance'
import { useAppStore } from '@/stores/app'

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
    else if (!brokerId.value && commissionBrokers.value.length)
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

const mySalesMonth = computed(() =>
  mySales.value.filter(s => inCurrentMonth(s.saleDate) && s.status !== 'cancelled'),
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
const mySplits = computed(() =>
  myCommissions.value.flatMap(c =>
    finance.splitsOf(c.id).filter(s => s.beneficiaryType === 'broker' && s.beneficiaryId === brokerId.value),
  ),
)

const accumulatedCommission = computed(() =>
  mySplits.value.reduce((sum, s) => sum + s.amount, 0),
)

const pendingCommission = computed(() =>
  mySplits.value.filter(s => s.status === 'pending').reduce((sum, s) => sum + s.amount, 0),
)

const kpis = computed(() => [
  { title: 'Minhas vendas (mês)', value: String(mySalesMonth.value.length), icon: 'ri-home-4-line', color: 'primary', subtitle: `${mySales.value.length} no total` },
  { title: 'VGV do mês', value: formatBRLCompact(myVgv.value), icon: 'ri-funds-line', color: 'info', subtitle: 'Valor geral de vendas' },
  { title: 'Comissão acumulada', value: formatBRL(accumulatedCommission.value), icon: 'ri-hand-coin-line', color: 'success', subtitle: 'Splits do corretor' },
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
        v-if="!ownBroker"
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
                    v-for="com in myCommissions"
                    :key="com.id"
                  >
                    <VExpansionPanelTitle>
                      <div class="d-flex align-center justify-space-between flex-grow-1 me-3">
                        <div>
                          <div class="font-weight-medium">
                            {{ finance.saleById(com.saleId)?.buyerName ?? '—' }}
                          </div>
                          <div class="text-caption text-disabled">
                            {{ finance.developmentName(finance.saleById(com.saleId)?.developmentId) }}
                          </div>
                        </div>
                        <div class="d-flex align-center gap-x-3">
                          <span class="font-weight-medium">{{ formatBRL(com.totalAmount) }}</span>
                          <StatusChip
                            :value="com.status"
                            :map="commissionStatusMeta"
                          />
                        </div>
                      </div>
                    </VExpansionPanelTitle>
                    <VExpansionPanelText>
                      <VTimeline
                        side="end"
                        density="compact"
                        truncate-line="both"
                      >
                        <VTimelineItem
                          v-for="inst in finance.installmentsOf(com.id)"
                          :key="inst.id"
                          :dot-color="installmentStatusMeta[inst.status].color"
                          size="x-small"
                        >
                          <div class="d-flex justify-space-between flex-wrap gap-2">
                            <div>
                              <span class="font-weight-medium">
                                Parcela {{ inst.installmentNumber }} · {{ formatBRL(inst.amount) }}
                              </span>
                              <div class="text-caption text-disabled">
                                Prevista: {{ formatDate(inst.expectedDate) }}
                                <template v-if="inst.receivedDate">
                                  · Recebida: {{ formatDate(inst.receivedDate) }}
                                </template>
                              </div>
                            </div>
                            <StatusChip
                              :value="inst.status"
                              :map="installmentStatusMeta"
                            />
                          </div>
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
