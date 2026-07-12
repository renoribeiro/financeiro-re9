<script setup lang="ts">
import { useTheme } from 'vuetify'
import { hexToRgb } from '@layouts/utils'
import { useConsolidatedMetrics } from '@/composables/useConsolidatedMetrics'
import { useAppStore } from '@/stores/app'

const app = useAppStore()
const { byCompany, totals } = useConsolidatedMetrics()
const vuetifyTheme = useTheme()

useHead({ title: 'Dashboard consolidado' })

// só super admin acessa a visão do grupo
definePageMeta({})

const kpis = computed(() => [
  { title: 'Receita do mês (grupo)', value: formatBRL(totals.value.income), icon: 'ri-arrow-down-circle-line', color: 'success' },
  { title: 'Despesa do mês (grupo)', value: formatBRL(totals.value.expense), icon: 'ri-arrow-up-circle-line', color: 'error' },
  { title: 'Resultado do mês', value: formatBRL(totals.value.balance), icon: 'ri-scales-3-line', color: totals.value.balance >= 0 ? 'primary' : 'warning' },
  { title: 'Inadimplência (grupo)', value: formatBRL(totals.value.overdueAmount), icon: 'ri-error-warning-line', color: 'warning' },
])

const chartSeries = computed(() => [
  { name: 'Receita', data: byCompany.value.map(m => m.income) },
  { name: 'Despesa', data: byCompany.value.map(m => m.expense) },
])

const chartOptions = computed(() => {
  const theme = vuetifyTheme.current.value.colors
  const vars = vuetifyTheme.current.value.variables
  const labelColor = `rgba(${hexToRgb(theme['on-surface'])},${vars['disabled-opacity']})`
  const borderColor = `rgba(${hexToRgb(String(vars['border-color']))},${vars['border-opacity']})`

  return {
    chart: { type: 'bar', toolbar: { show: false }, parentHeightOffset: 0 },
    colors: [theme.success, theme.error],
    plotOptions: { bar: { borderRadius: 6, columnWidth: '40%' } },
    dataLabels: { enabled: false },
    legend: { position: 'top', horizontalAlign: 'left', labels: { colors: labelColor } },
    grid: { borderColor, strokeDashArray: 6 },
    xaxis: { categories: byCompany.value.map(m => m.company.tradeName), labels: { style: { colors: labelColor } } },
    yaxis: { labels: { style: { colors: labelColor }, formatter: (v: number) => formatBRLCompact(v) } },
    tooltip: { y: { formatter: (v: number) => formatBRL(v) } },
  }
})

const headers = [
  { title: 'Empresa', key: 'company' },
  { title: 'Receita (mês)', key: 'income', align: 'end' as const },
  { title: 'Despesa (mês)', key: 'expense', align: 'end' as const },
  { title: 'Resultado', key: 'balance', align: 'end' as const },
  { title: 'A pagar em aberto', key: 'openPayables', align: 'end' as const },
  { title: 'Inadimplência', key: 'overdueAmount', align: 'end' as const },
]
</script>

<template>
  <div>
    <AppPageHeader
      title="Dashboard consolidado"
      subtitle="Visão somada e comparativo entre as empresas do grupo"
      icon="ri-stack-line"
    />

    <VAlert
      v-if="!app.isSuperAdmin"
      type="warning"
      variant="tonal"
      text="Disponível apenas para o Super Admin."
    />

    <template v-else>
      <VRow class="match-height mb-1">
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

      <VRow>
        <VCol
          cols="12"
          md="7"
        >
          <VCard title="Receitas x Despesas por empresa (mês)">
            <VCardText>
              <VueApexCharts
                type="bar"
                :options="chartOptions"
                :series="chartSeries"
                :height="320"
              />
            </VCardText>
          </VCard>
        </VCol>
        <VCol
          cols="12"
          md="5"
        >
          <VCard title="Resumo por empresa">
            <VDataTable
              :headers="headers"
              :items="byCompany"
              hide-default-footer
              class="text-no-wrap"
            >
              <template #item.company="{ item }">
                <div class="d-flex align-center gap-2">
                  <VAvatar
                    :color="item.company.logoColor"
                    variant="tonal"
                    size="28"
                  >
                    <VIcon
                      :icon="item.company.type === 'real_estate' ? 'ri-building-2-line' : 'ri-megaphone-line'"
                      size="16"
                    />
                  </VAvatar>
                  <span class="font-weight-medium">{{ item.company.tradeName }}</span>
                </div>
              </template>
              <template #item.income="{ item }">
                <span class="text-success">{{ formatBRL(item.income) }}</span>
              </template>
              <template #item.expense="{ item }">
                <span class="text-error">{{ formatBRL(item.expense) }}</span>
              </template>
              <template #item.balance="{ item }">
                <span
                  :class="item.balance >= 0 ? 'text-success' : 'text-error'"
                  class="font-weight-medium"
                >{{ formatBRL(item.balance) }}</span>
              </template>
              <template #item.openPayables="{ item }">
                {{ formatBRL(item.openPayables) }}
              </template>
              <template #item.overdueAmount="{ item }">
                <span :class="{ 'text-error': item.overdueAmount > 0 }">{{ formatBRL(item.overdueAmount) }}</span>
              </template>
            </VDataTable>
          </VCard>
        </VCol>
      </VRow>
    </template>
  </div>
</template>
