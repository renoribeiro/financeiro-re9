<script setup lang="ts">
import { useTheme } from 'vuetify'
import { hexToRgb } from '@layouts/utils'
import { useAppStore } from '@/stores/app'
import { useFinanceStore } from '@/stores/finance'
import { useFinanceMetrics } from '@/composables/useFinanceMetrics'

const appStore = useAppStore()
const finance = useFinanceStore()
const m = useFinanceMetrics()
const vuetifyTheme = useTheme()

useHead({ title: 'Dashboard' })

// 👉 KPIs principais
const kpis = computed(() => [
  { title: 'Saldo realizado (mês)', value: formatBRL(m.realized.value.balance), icon: 'ri-wallet-3-line', color: m.realized.value.balance >= 0 ? 'success' : 'error', subtitle: `Entradas ${formatBRLCompact(m.realized.value.income)} · Saídas ${formatBRLCompact(m.realized.value.expense)}` },
  { title: 'A pagar (7 dias)', value: formatBRL(m.sum(m.weekPayables.value)), icon: 'ri-arrow-up-circle-line', color: 'warning', subtitle: `${m.weekPayables.value.length} conta(s) vencendo` },
  { title: 'A receber (7 dias)', value: formatBRL(m.sum(m.weekReceivables.value)), icon: 'ri-arrow-down-circle-line', color: 'info', subtitle: `${m.weekReceivables.value.length} conta(s) a receber` },
  { title: 'Resultado do mês (DRE)', value: formatBRL(m.dre.value.result), icon: 'ri-pie-chart-2-line', color: m.dre.value.result >= 0 ? 'primary' : 'error', subtitle: 'Receitas − Despesas realizadas' },
])

// 👉 Alertas inteligentes (cards coloridos)
const alerts = computed(() => {
  const list: { title: string; message: string; color: string; icon: string }[] = []
  const op = m.overduePayables.value
  if (op.length)
    list.push({ title: `${op.length} conta(s) a pagar vencida(s)`, message: `Total de ${formatBRL(m.sum(op))} em atraso.`, color: 'error', icon: 'ri-alarm-warning-line' })

  const orr = m.overdueReceivables.value
  if (orr.length)
    list.push({ title: `Inadimplência: ${orr.length} título(s)`, message: `${formatBRL(m.sum(orr))} a receber em atraso.`, color: 'error', icon: 'ri-error-warning-line' })

  const dueSoon = m.weekPayables.value.filter(p => daysUntil(p.dueDate) >= 0)
  if (dueSoon.length)
    list.push({ title: `${dueSoon.length} conta(s) vencem em até 7 dias`, message: `Programe ${formatBRL(m.sum(dueSoon))} de pagamentos.`, color: 'warning', icon: 'ri-calendar-event-line' })

  const certDays = daysUntil(appStore.currentCompany.certificateExpiry)
  if (certDays <= 60)
    list.push({ title: 'Certificado A1 próximo do vencimento', message: `Vence em ${certDays} dias. Renove para não interromper a emissão de NFS-e.`, color: certDays <= 30 ? 'error' : 'warning', icon: 'ri-shield-keyhole-line' })

  if (!list.length)
    list.push({ title: 'Tudo em ordem', message: 'Nenhum alerta crítico no momento.', color: 'success', icon: 'ri-checkbox-circle-line' })

  return list
})

// 👉 Gráfico de fluxo de caixa (30 dias)
const chartOptions = computed(() => {
  const theme = vuetifyTheme.current.value.colors
  const vars = vuetifyTheme.current.value.variables
  const borderColor = `rgba(${hexToRgb(String(vars['border-color']))},${vars['border-opacity']})`
  const labelColor = `rgba(${hexToRgb(theme['on-surface'])},${vars['disabled-opacity']})`

  return {
    chart: { type: 'area', toolbar: { show: false }, parentHeightOffset: 0 },
    colors: [theme.success, theme.error, theme.primary],
    stroke: { curve: 'smooth', width: [2, 2, 3] },
    fill: { type: 'gradient', gradient: { opacityFrom: 0.3, opacityTo: 0.05, stops: [0, 100] } },
    dataLabels: { enabled: false },
    legend: { position: 'top', horizontalAlign: 'left', labels: { colors: labelColor }, markers: { offsetX: -3 }, itemMargin: { horizontal: 9 } },
    grid: { borderColor, strokeDashArray: 6, padding: { top: 0 } },
    xaxis: { categories: m.cashFlow30d.value.labels, tickAmount: 6, labels: { style: { colors: labelColor } }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { labels: { style: { colors: labelColor }, formatter: (v: number) => formatBRLCompact(v) } },
    tooltip: { y: { formatter: (v: number) => formatBRL(v) } },
  }
})

const chartSeries = computed(() => [
  { name: 'Entradas', data: m.cashFlow30d.value.income },
  { name: 'Saídas', data: m.cashFlow30d.value.expense },
  { name: 'Saldo acumulado', data: m.cashFlow30d.value.balance },
])
</script>

<template>
  <div>
    <AppPageHeader
      title="Dashboard"
      :subtitle="`${appStore.currentCompany.tradeName} · visão geral financeira`"
      icon="ri-dashboard-line"
    />

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

    <!-- Alertas -->
    <VRow class="mt-1">
      <VCol
        v-for="(a, i) in alerts"
        :key="i"
        cols="12"
        md="6"
        lg="4"
      >
        <VCard
          :color="a.color"
          variant="tonal"
        >
          <VCardText class="d-flex align-center gap-x-3">
            <VAvatar
              :color="a.color"
              variant="elevated"
              size="40"
            >
              <VIcon :icon="a.icon" />
            </VAvatar>
            <div>
              <div class="font-weight-medium text-high-emphasis">
                {{ a.title }}
              </div>
              <div class="text-body-2">
                {{ a.message }}
              </div>
            </div>
          </VCardText>
        </VCard>
      </VCol>
    </VRow>

    <VRow class="mt-1">
      <!-- Fluxo de caixa -->
      <VCol
        cols="12"
        lg="8"
      >
        <VCard title="Fluxo de caixa — últimos 30 dias">
          <template #append>
            <VBtn
              variant="text"
              size="small"
              to="/fluxo-de-caixa"
              append-icon="ri-arrow-right-line"
            >
              Detalhar
            </VBtn>
          </template>
          <VCardText>
            <VueApexCharts
              type="area"
              :options="chartOptions"
              :series="chartSeries"
              :height="320"
            />
          </VCardText>
        </VCard>
      </VCol>

      <!-- DRE resumido + projeção -->
      <VCol
        cols="12"
        lg="4"
      >
        <VCard
          title="DRE resumido do mês"
          class="mb-6"
        >
          <VCardText>
            <div class="d-flex justify-space-between mb-3">
              <span class="text-body-1">Receitas</span>
              <span class="font-weight-medium text-success">{{ formatBRL(m.dre.value.revenues) }}</span>
            </div>
            <div class="d-flex justify-space-between mb-3">
              <span class="text-body-1">Despesas</span>
              <span class="font-weight-medium text-error">{{ formatBRL(m.dre.value.expenses) }}</span>
            </div>
            <VDivider class="mb-3" />
            <div class="d-flex justify-space-between">
              <span class="text-body-1 font-weight-medium">Resultado</span>
              <span
                class="text-h6"
                :class="m.dre.value.result >= 0 ? 'text-success' : 'text-error'"
              >
                {{ formatBRL(m.dre.value.result) }}
              </span>
            </div>
          </VCardText>
        </VCard>

        <VCard title="Saldo projetado">
          <VCardText>
            <VList class="card-list">
              <VListItem
                v-for="p in m.projection.value"
                :key="p.days"
              >
                <VListItemTitle>Próximos {{ p.days }} dias</VListItemTitle>
                <template #append>
                  <span
                    class="font-weight-medium"
                    :class="p.projected >= 0 ? 'text-success' : 'text-error'"
                  >
                    {{ formatBRL(p.projected) }}
                  </span>
                </template>
              </VListItem>
            </VList>
          </VCardText>
        </VCard>
      </VCol>
    </VRow>

    <!-- Indicadores por tipo de empresa -->
    <VRow class="mt-1">
      <template v-if="appStore.isRealEstate">
        <VCol
          cols="12"
          sm="6"
          lg="3"
        >
          <KpiCard
            title="Vendas do mês"
            :value="String(m.realEstate.value.salesCount)"
            :subtitle="`VGV ${formatBRLCompact(m.realEstate.value.vgv)}`"
            icon="ri-home-4-line"
            color="primary"
          />
        </VCol>
        <VCol
          cols="12"
          sm="6"
          lg="3"
        >
          <KpiCard
            title="Comissões pendentes"
            :value="formatBRL(m.realEstate.value.pendingCommission)"
            subtitle="A receber das vendas"
            icon="ri-hand-coin-line"
            color="warning"
          />
        </VCol>
        <VCol
          cols="12"
          lg="6"
        >
          <VCard title="Funil de vendas">
            <template #append>
              <VBtn
                variant="text"
                size="small"
                to="/funil"
                append-icon="ri-arrow-right-line"
              >
                Abrir
              </VBtn>
            </template>
            <VCardText>
              <div class="d-flex flex-wrap justify-space-between gap-4">
                <div
                  v-for="st in m.realEstate.value.funnelByStage"
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
                    {{ st.label }}
                  </div>
                </div>
              </div>
            </VCardText>
          </VCard>
        </VCol>
      </template>

      <template v-else>
        <VCol
          cols="12"
          sm="6"
          lg="3"
        >
          <KpiCard
            title="Contratos ativos"
            :value="String(m.agency.value.activeContracts)"
            subtitle="Clientes recorrentes"
            icon="ri-file-list-3-line"
            color="primary"
          />
        </VCol>
        <VCol
          cols="12"
          sm="6"
          lg="3"
        >
          <KpiCard
            title="Faturamento mensal"
            :value="formatBRL(m.agency.value.monthlyRevenue)"
            subtitle="Contratos recorrentes"
            icon="ri-money-dollar-circle-line"
            color="success"
          />
        </VCol>
        <VCol
          cols="12"
          sm="6"
          lg="3"
        >
          <KpiCard
            title="Inadimplência"
            :value="formatBRL(m.agency.value.delinquencyAmount)"
            :subtitle="`${m.agency.value.delinquencyCount} cliente(s) em atraso`"
            icon="ri-error-warning-line"
            color="error"
          />
        </VCol>
        <VCol
          cols="12"
          sm="6"
          lg="3"
        >
          <KpiCard
            title="NFS-e emitidas"
            :value="String(finance.companyInvoices.filter(i => i.status === 'issued').length)"
            subtitle="No período"
            icon="ri-file-text-line"
            color="info"
          />
        </VCol>
      </template>
    </VRow>
  </div>
</template>

<style lang="scss" scoped>
.card-list {
  --v-card-list-gap: 0.75rem;
}
</style>
