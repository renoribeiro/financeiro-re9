<script setup lang="ts">
import { useTheme } from 'vuetify'
import { hexToRgb } from '@layouts/utils'
import { useFinanceStore } from '@/stores/finance'
import { useFinanceMetrics } from '@/composables/useFinanceMetrics'

const finance = useFinanceStore()
const m = useFinanceMetrics()
const vuetifyTheme = useTheme()

useHead({ title: 'Fluxo de Caixa' })

// 👉 Próximas movimentações previstas (contas em aberto)
const horizon = ref(30)

const horizonItems = [
  { title: 'Próximos 7 dias', value: 7 },
  { title: 'Próximos 15 dias', value: 15 },
  { title: 'Próximos 30 dias', value: 30 },
  { title: 'Próximos 90 dias', value: 90 },
]

const upcoming = computed(() => {
  const within = (iso: string) => daysUntil(iso) >= 0 && daysUntil(iso) <= horizon.value

  const ins = finance.companyReceivables
    .filter(r => r.status === 'open' && within(r.dueDate))
    .map(r => ({ kind: 'income' as const, date: r.dueDate, description: r.description, party: r.clientName ?? '—', amount: r.amount }))

  const outs = finance.companyPayables
    .filter(p => ['open', 'overdue'].includes(p.status) && within(p.dueDate))
    .map(p => ({ kind: 'expense' as const, date: p.dueDate, description: p.description, party: p.supplierId ? finance.supplierName(p.supplierId) : finance.employeeName(p.employeeId), amount: p.amount }))

  return [...ins, ...outs].sort((a, b) => a.date.localeCompare(b.date))
})

const totalIn = computed(() => upcoming.value.filter(u => u.kind === 'income').reduce((s, u) => s + u.amount, 0))
const totalOut = computed(() => upcoming.value.filter(u => u.kind === 'expense').reduce((s, u) => s + u.amount, 0))

const headers = [
  { title: 'Data', key: 'date' },
  { title: 'Tipo', key: 'kind' },
  { title: 'Descrição', key: 'description' },
  { title: 'Parte', key: 'party' },
  { title: 'Valor', key: 'amount', align: 'end' as const },
]

// 👉 Gráfico
const chartOptions = computed(() => {
  const theme = vuetifyTheme.current.value.colors
  const vars = vuetifyTheme.current.value.variables
  const borderColor = `rgba(${hexToRgb(String(vars['border-color']))},${vars['border-opacity']})`
  const labelColor = `rgba(${hexToRgb(theme['on-surface'])},${vars['disabled-opacity']})`

  return {
    chart: { type: 'area', toolbar: { show: false }, parentHeightOffset: 0, stacked: false },
    colors: [theme.success, theme.error, theme.primary],
    stroke: { curve: 'smooth', width: [2, 2, 3] },
    fill: { type: 'gradient', gradient: { opacityFrom: 0.25, opacityTo: 0.05 } },
    dataLabels: { enabled: false },
    legend: { position: 'top', horizontalAlign: 'left', labels: { colors: labelColor } },
    grid: { borderColor, strokeDashArray: 6 },
    xaxis: { categories: m.cashFlow30d.value.labels, tickAmount: 8, labels: { style: { colors: labelColor } }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { labels: { style: { colors: labelColor }, formatter: (v: number) => formatBRLCompact(v) } },
    tooltip: { y: { formatter: (v: number) => formatBRL(v) } },
  }
})

const chartSeries = computed(() => [
  { name: 'Entradas', data: m.cashFlow30d.value.income },
  { name: 'Saídas', data: m.cashFlow30d.value.expense },
  { name: 'Saldo acumulado', data: m.cashFlow30d.value.balance },
])

const negativeProjection = computed(() => m.projection.value.find(p => p.projected < 0))
</script>

<template>
  <div>
    <AppPageHeader
      title="Fluxo de Caixa"
      subtitle="Realizado, previsto e saldo projetado"
      icon="ri-line-chart-line"
    />

    <VAlert
      v-if="negativeProjection"
      type="error"
      variant="tonal"
      class="mb-6"
      prepend-icon="ri-alarm-warning-line"
    >
      Atenção: saldo projetado fica <strong>negativo</strong> nos próximos {{ negativeProjection.days }} dias
      ({{ formatBRL(negativeProjection.projected) }}). Reavalie pagamentos ou antecipe recebimentos.
    </VAlert>

    <!-- Projeção -->
    <VRow class="match-height mb-1">
      <VCol
        cols="12"
        sm="6"
        lg="3"
      >
        <KpiCard
          title="Saldo realizado (mês)"
          :value="formatBRL(m.realized.value.balance)"
          icon="ri-wallet-3-line"
          :color="m.realized.value.balance >= 0 ? 'success' : 'error'"
        />
      </VCol>
      <VCol
        v-for="p in m.projection.value"
        :key="p.days"
        cols="12"
        sm="6"
        lg="3"
      >
        <KpiCard
          :title="`Projeção ${p.days} dias`"
          :value="formatBRL(p.projected)"
          icon="ri-funds-line"
          :color="p.projected >= 0 ? 'primary' : 'error'"
          :subtitle="`+${formatBRLCompact(p.futureIn)} entradas · −${formatBRLCompact(p.futureOut)} saídas`"
        />
      </VCol>
    </VRow>

    <VCard
      title="Evolução do caixa — últimos 30 dias"
      class="mb-6"
    >
      <VCardText>
        <VueApexCharts
          type="area"
          :options="chartOptions"
          :series="chartSeries"
          :height="340"
        />
      </VCardText>
    </VCard>

    <VCard>
      <VCardItem>
        <VCardTitle>Movimentações previstas</VCardTitle>
        <template #append>
          <VSelect
            v-model="horizon"
            :items="horizonItems"
            aria-label="Horizonte de projeção"
            density="compact"
            variant="outlined"
            style="max-inline-size: 220px;"
            hide-details
          />
        </template>
      </VCardItem>
      <VCardText class="d-flex gap-6 flex-wrap">
        <div>
          <div class="text-caption text-disabled">
            Entradas previstas
          </div>
          <div class="text-h6 text-success">
            {{ formatBRL(totalIn) }}
          </div>
        </div>
        <div>
          <div class="text-caption text-disabled">
            Saídas previstas
          </div>
          <div class="text-h6 text-error">
            {{ formatBRL(totalOut) }}
          </div>
        </div>
        <div>
          <div class="text-caption text-disabled">
            Resultado previsto
          </div>
          <div
            class="text-h6"
            :class="(totalIn - totalOut) >= 0 ? 'text-success' : 'text-error'"
          >
            {{ formatBRL(totalIn - totalOut) }}
          </div>
        </div>
      </VCardText>
      <VDivider />
      <VDataTable
        :headers="headers"
        :items="upcoming"
        :items-per-page="15"
        class="text-no-wrap"
      >
        <template #item.date="{ item }">
          {{ formatDate(item.date) }}
        </template>
        <template #item.kind="{ item }">
          <VChip
            :color="item.kind === 'income' ? 'success' : 'error'"
            size="small"
            label
          >
            <VIcon
              start
              size="16"
              :icon="item.kind === 'income' ? 'ri-arrow-down-line' : 'ri-arrow-up-line'"
            />
            {{ item.kind === 'income' ? 'Entrada' : 'Saída' }}
          </VChip>
        </template>
        <template #item.amount="{ item }">
          <span
            class="font-weight-medium"
            :class="item.kind === 'income' ? 'text-success' : 'text-error'"
          >
            {{ item.kind === 'income' ? '+' : '−' }} {{ formatBRL(item.amount) }}
          </span>
        </template>
        <template #no-data>
          <div class="text-center py-8 text-disabled">
            Nenhuma movimentação prevista no período
          </div>
        </template>
      </VDataTable>
    </VCard>
  </div>
</template>
