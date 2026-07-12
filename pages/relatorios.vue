<script setup lang="ts">
import { useTheme } from 'vuetify'
import { hexToRgb } from '@layouts/utils'
import { useFinanceStore } from '@/stores/finance'
import { useAppStore } from '@/stores/app'

const finance = useFinanceStore()
const app = useAppStore()
const vuetifyTheme = useTheme()

useHead({ title: 'Relatórios' })

const tab = ref('dre')

// 👉 Período
const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10)
const from = ref(yearStart)
const to = ref(todayISO())
const inRange = (iso?: string) => !!iso && iso.slice(0, 10) >= from.value && iso.slice(0, 10) <= to.value

// 👉 Export CSV
function exportCSV(filename: string, header: string[], lines: (string | number)[][]) {
  // números localizados (vírgula decimal) para o Excel pt-BR não ler "1234.5" como 12345
  const esc = (v: string | number) => {
    const cell = typeof v === 'number' ? v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : String(v)

    return `"${cell.replace(/"/g, '""')}"`
  }

  const csv = [header, ...lines].map(r => r.map(esc).join(';')).join('\r\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })

  download(blob, filename)
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')

  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// \uD83D\uDC49 Export Excel (SpreadsheetML 2003 \u2014 sem depend\u00EAncias; abre no Excel)
function exportXLS(filename: string, sheet: string, header: string[], lines: (string | number)[][]) {
  const xmlEsc = (v: string | number) => String(v).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '\'': '&apos;', '"': '&quot;' }[c] as string))

  const cell = (v: string | number) => {
    const isNum = typeof v === 'number'

    return `<Cell><Data ss:Type="${isNum ? 'Number' : 'String'}">${isNum ? v : xmlEsc(v)}</Data></Cell>`
  }

  const row = (cells: (string | number)[]) => `<Row>${cells.map(cell).join('')}</Row>`

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="${xmlEsc(sheet)}"><Table>${row(header)}${lines.map(row).join('')}</Table></Worksheet>
</Workbook>`

  download(new Blob([xml], { type: 'application/vnd.ms-excel' }), filename)
}

// \uD83D\uDC49 Export PDF (via janela de impress\u00E3o do navegador)
function printPDF(title: string, header: string[], lines: (string | number)[][]) {
  const fmt = (v: string | number) => typeof v === 'number' ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(v)
  const rows = lines.map(r => `<tr>${r.map((c, i) => `<td style="text-align:${typeof c === 'number' || i === r.length - 1 ? 'right' : 'left'}">${fmt(c)}</td>`).join('')}</tr>`).join('')
  const w = window.open('', '_blank')
  if (!w)
    return
  w.document.write(`<html><head><title>${title}</title><style>
    body{font-family:Arial,sans-serif;padding:24px;color:#333}
    h1{font-size:18px} table{width:100%;border-collapse:collapse;font-size:12px}
    th,td{border:1px solid #ddd;padding:6px 8px} th{background:#f5f5f5;text-align:left}
  </style></head><body><h1>${title}</h1><div>${app.currentCompany.tradeName} \u00B7 ${from.value} a ${to.value}</div>
  <table><thead><tr>${header.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
  <script>window.onload=function(){window.print()}<\/script></body></html>`)
  w.document.close()
}

// ===== DRE =====
const dre = computed(() => {
  const revenues = new Map<string, number>()
  const expenses = new Map<string, number>()

  finance.companyReceivables.filter(r => r.status === 'received' && inRange(r.receivedAt)).forEach(r => {
    const k = finance.accountName(r.categoryId)

    revenues.set(k, (revenues.get(k) ?? 0) + (r.receivedAmount ?? r.amount))
  })
  finance.companyPayables.filter(p => p.status === 'paid' && inRange(p.paidAt)).forEach(p => {
    const k = finance.accountName(p.categoryId)

    expenses.set(k, (expenses.get(k) ?? 0) + (p.paidAmount ?? p.amount))
  })

  const revRows = [...revenues.entries()].map(([name, value]) => ({ name, value }))
  const expRows = [...expenses.entries()].map(([name, value]) => ({ name, value }))
  const totalRev = revRows.reduce((s, x) => s + x.value, 0)
  const totalExp = expRows.reduce((s, x) => s + x.value, 0)

  return { revRows, expRows, totalRev, totalExp, result: totalRev - totalExp }
})

function exportDRE() {
  const lines: (string | number)[][] = []

  lines.push(['RECEITAS', ''])
  dre.value.revRows.forEach(r => lines.push([r.name, r.value]))
  lines.push(['Total receitas', dre.value.totalRev])
  lines.push(['DESPESAS', ''])
  dre.value.expRows.forEach(r => lines.push([r.name, r.value]))
  lines.push(['Total despesas', dre.value.totalExp])
  lines.push(['RESULTADO', dre.value.result])
  exportCSV('dre.csv', ['Conta', 'Valor'], lines)
}
function dreRows(): (string | number)[][] {
  return [
    ['RECEITAS', ''],
    ...dre.value.revRows.map(r => [r.name, r.value] as (string | number)[]),
    ['Total receitas', dre.value.totalRev],
    ['DESPESAS', ''],
    ...dre.value.expRows.map(r => [r.name, r.value] as (string | number)[]),
    ['Total despesas', dre.value.totalExp],
    ['RESULTADO', dre.value.result],
  ]
}

// ===== Balancete (saldos por conta do plano) =====
const balancete = computed(() => {
  const movement = new Map<string, number>() // categoryId -> saldo (receita + / despesa -)

  finance.companyReceivables
    .filter(r => r.status === 'received' && inRange(r.receivedAt))
    .forEach(r => movement.set(r.categoryId ?? '', (movement.get(r.categoryId ?? '') ?? 0) + (r.receivedAmount ?? r.amount)))
  finance.companyPayables
    .filter(p => p.status === 'paid' && inRange(p.paidAt))
    .forEach(p => movement.set(p.categoryId ?? '', (movement.get(p.categoryId ?? '') ?? 0) - (p.paidAmount ?? p.amount)))

  const rows = finance.companyChartAccounts
    .filter(a => movement.has(a.id))
    .map(a => ({ code: a.code, name: a.name, type: a.type, balance: movement.get(a.id) ?? 0 }))
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))

  return { rows, total: rows.reduce((s, r) => s + r.balance, 0) }
})

function balanceteRows(): (string | number)[][] {
  return [
    ...balancete.value.rows.map(r => [r.code, r.name, accountTypeLabels[r.type], r.balance] as (string | number)[]),
    ['', 'SALDO GERAL', '', balancete.value.total],
  ]
}

// ===== Aging =====
const aging = computed(() => {
  const buckets = [
    { label: '1–30 dias', min: 1, max: 30, items: [] as { desc: string; amount: number; days: number }[] },
    { label: '31–60 dias', min: 31, max: 60, items: [] as { desc: string; amount: number; days: number }[] },
    { label: '61–90 dias', min: 61, max: 90, items: [] as { desc: string; amount: number; days: number }[] },
    { label: '90+ dias', min: 91, max: Number.POSITIVE_INFINITY, items: [] as { desc: string; amount: number; days: number }[] },
  ]

  finance.companyReceivables.filter(r => r.status === 'overdue').forEach(r => {
    const days = Math.abs(daysUntil(r.dueDate))
    const b = buckets.find(x => days >= x.min && days <= x.max)

    b?.items.push({ desc: `${r.clientName ?? '—'} — ${r.description}`, amount: r.amount, days })
  })

  return buckets.map(b => ({ ...b, total: b.items.reduce((s, i) => s + i.amount, 0) }))
})

function exportAging() {
  const lines = aging.value.flatMap(b => b.items.map(i => [b.label, i.desc, i.days, i.amount]))

  exportCSV('aging.csv', ['Faixa', 'Título', 'Dias', 'Valor'], lines)
}

// ===== Comissões =====
const commissionRows = computed(() => finance.companyCommissions.map(c => {
  const sale = finance.saleById(c.saleId)
  const received = finance.installmentsOf(c.id).filter(i => i.status === 'received').reduce((s, i) => s + i.amount, 0)

  return {
    broker: finance.employeeName(sale?.brokerId),
    development: finance.developmentName(sale?.developmentId),
    buyer: sale?.buyerName ?? '—',
    total: c.totalAmount,
    received,
    status: c.status,
  }
}))

function exportCommissions() {
  exportCSV('comissoes.csv', ['Corretor', 'Empreendimento', 'Comprador', 'Total', 'Recebido', 'Status'],
    commissionRows.value.map(c => [c.broker, c.development, c.buyer, c.total, c.received, commissionStatusMeta[c.status].label]))
}

// ===== Centro de custo =====
const costCenterRows = computed(() => finance.companyCostCenters.map(cc => {
  const rev = finance.companyReceivables.filter(r => r.status === 'received' && r.costCenterId === cc.id && inRange(r.receivedAt)).reduce((s, r) => s + (r.receivedAmount ?? r.amount), 0)
  const exp = finance.companyPayables.filter(p => p.status === 'paid' && p.costCenterId === cc.id && inRange(p.paidAt)).reduce((s, p) => s + (p.paidAmount ?? p.amount), 0)

  return { name: cc.name, rev, exp, result: rev - exp }
}))

function exportCostCenters() {
  exportCSV('centros-de-custo.csv', ['Centro de custo', 'Receitas', 'Despesas', 'Resultado'],
    costCenterRows.value.map(c => [c.name, c.rev, c.exp, c.result]))
}

// ===== Comparativo mensal (6 meses) =====
const comparison = computed(() => {
  const months: { label: string; rev: number; exp: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date()

    d.setDate(1)
    d.setMonth(d.getMonth() - i)

    const key = d.toISOString().slice(0, 7)
    const rev = finance.companyReceivables.filter(r => r.status === 'received' && r.receivedAt?.slice(0, 7) === key).reduce((s, r) => s + (r.receivedAmount ?? r.amount), 0)
    const exp = finance.companyPayables.filter(p => p.status === 'paid' && p.paidAt?.slice(0, 7) === key).reduce((s, p) => s + (p.paidAmount ?? p.amount), 0)

    months.push({ label: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }), rev, exp })
  }

  return months
})

const comparisonOptions = computed(() => {
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
    xaxis: { categories: comparison.value.map(m => m.label), labels: { style: { colors: labelColor } }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { labels: { style: { colors: labelColor }, formatter: (v: number) => formatBRLCompact(v) } },
    tooltip: { y: { formatter: (v: number) => formatBRL(v) } },
  }
})

const comparisonSeries = computed(() => [
  { name: 'Receitas', data: comparison.value.map(m => m.rev) },
  { name: 'Despesas', data: comparison.value.map(m => m.exp) },
])

const tabs = computed(() => [
  { value: 'dre', label: 'DRE', icon: 'ri-pie-chart-2-line' },
  { value: 'balancete', label: 'Balancete', icon: 'ri-book-2-line' },
  { value: 'comparativo', label: 'Comparativo', icon: 'ri-bar-chart-grouped-line' },
  { value: 'comissoes', label: 'Comissões', icon: 'ri-hand-coin-line', realEstate: true },
  { value: 'aging', label: 'Inadimplência', icon: 'ri-error-warning-line' },
  { value: 'centros', label: 'Centros de custo', icon: 'ri-price-tag-3-line' },
].filter(t => !t.realEstate || app.isRealEstate))
</script>

<template>
  <div>
    <AppPageHeader
      title="Relatórios"
      subtitle="DRE, comparativos, comissões, inadimplência e centros de custo"
      icon="ri-bar-chart-box-line"
    />

    <VCard class="mb-6">
      <VCardText class="d-flex flex-wrap align-center gap-4">
        <VTextField
          v-model="from"
          label="De"
          type="date"
          density="compact"
          style="max-inline-size: 190px;"
          hide-details
        />
        <VTextField
          v-model="to"
          label="Até"
          type="date"
          density="compact"
          style="max-inline-size: 190px;"
          hide-details
        />
        <VChip
          label
          color="info"
        >
          {{ app.currentCompany.tradeName }}
        </VChip>
      </VCardText>
    </VCard>

    <VTabs
      v-model="tab"
      class="mb-4"
      show-arrows
    >
      <VTab
        v-for="t in tabs"
        :key="t.value"
        :value="t.value"
      >
        <VIcon
          start
          :icon="t.icon"
        />
        {{ t.label }}
      </VTab>
    </VTabs>

    <VWindow v-model="tab">
      <!-- DRE -->
      <VWindowItem value="dre">
        <VCard title="Demonstrativo de Resultado (realizado)">
          <template #append>
            <div class="d-flex flex-wrap gap-2 justify-end">
              <VBtn
                variant="tonal"
                size="small"
                prepend-icon="ri-file-excel-2-line"
                @click="exportXLS('dre.xls', 'DRE', ['Conta', 'Valor'], dreRows())"
              >
                Excel
              </VBtn>
              <VBtn
                variant="tonal"
                size="small"
                prepend-icon="ri-file-pdf-2-line"
                @click="printPDF('DRE', ['Conta', 'Valor'], dreRows())"
              >
                PDF
              </VBtn>
              <VBtn
                variant="tonal"
                size="small"
                prepend-icon="ri-download-line"
                @click="exportDRE"
              >
                CSV
              </VBtn>
            </div>
          </template>
          <VCardText>
            <div class="text-overline text-success mb-1">
              Receitas
            </div>
            <VTable
              density="compact"
              class="mb-4"
            >
              <tbody>
                <tr
                  v-for="r in dre.revRows"
                  :key="r.name"
                >
                  <td>{{ r.name }}</td>
                  <td class="text-end">
                    {{ formatBRL(r.value) }}
                  </td>
                </tr>
                <tr v-if="!dre.revRows.length">
                  <td
                    colspan="2"
                    class="text-disabled text-center"
                  >
                    Sem receitas no período
                  </td>
                </tr>
                <tr class="font-weight-bold">
                  <td>Total de receitas</td>
                  <td class="text-end text-success">
                    {{ formatBRL(dre.totalRev) }}
                  </td>
                </tr>
              </tbody>
            </VTable>

            <div class="text-overline text-error mb-1">
              Despesas
            </div>
            <VTable
              density="compact"
              class="mb-4"
            >
              <tbody>
                <tr
                  v-for="r in dre.expRows"
                  :key="r.name"
                >
                  <td>{{ r.name }}</td>
                  <td class="text-end">
                    {{ formatBRL(r.value) }}
                  </td>
                </tr>
                <tr v-if="!dre.expRows.length">
                  <td
                    colspan="2"
                    class="text-disabled text-center"
                  >
                    Sem despesas no período
                  </td>
                </tr>
                <tr class="font-weight-bold">
                  <td>Total de despesas</td>
                  <td class="text-end text-error">
                    {{ formatBRL(dre.totalExp) }}
                  </td>
                </tr>
              </tbody>
            </VTable>

            <VDivider class="mb-3" />
            <div class="d-flex justify-space-between align-center">
              <span class="text-h6">Resultado do período</span>
              <span
                class="text-h5"
                :class="dre.result >= 0 ? 'text-success' : 'text-error'"
              >{{ formatBRL(dre.result) }}</span>
            </div>
          </VCardText>
        </VCard>
      </VWindowItem>

      <!-- Balancete -->
      <VWindowItem value="balancete">
        <VCard title="Balancete — saldos por conta (realizado)">
          <template #append>
            <div class="d-flex flex-wrap gap-2 justify-end">
              <VBtn
                variant="tonal"
                size="small"
                prepend-icon="ri-file-excel-2-line"
                @click="exportXLS('balancete.xls', 'Balancete', ['Código', 'Conta', 'Tipo', 'Saldo'], balanceteRows())"
              >
                Excel
              </VBtn>
              <VBtn
                variant="tonal"
                size="small"
                prepend-icon="ri-file-pdf-2-line"
                @click="printPDF('Balancete', ['Código', 'Conta', 'Tipo', 'Saldo'], balanceteRows())"
              >
                PDF
              </VBtn>
              <VBtn
                variant="tonal"
                size="small"
                prepend-icon="ri-download-line"
                @click="exportCSV('balancete.csv', ['Código', 'Conta', 'Tipo', 'Saldo'], balanceteRows())"
              >
                CSV
              </VBtn>
            </div>
          </template>
          <VTable density="compact">
            <thead>
              <tr>
                <th>Código</th>
                <th>Conta</th>
                <th>Tipo</th>
                <th class="text-end">
                  Saldo
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="r in balancete.rows"
                :key="r.code"
              >
                <td class="text-disabled">
                  {{ r.code }}
                </td>
                <td>{{ r.name }}</td>
                <td>{{ accountTypeLabels[r.type] }}</td>
                <td
                  class="text-end"
                  :class="r.balance >= 0 ? 'text-success' : 'text-error'"
                >
                  {{ formatBRL(r.balance) }}
                </td>
              </tr>
              <tr v-if="!balancete.rows.length">
                <td
                  colspan="4"
                  class="text-center text-disabled"
                >
                  Sem movimentação no período
                </td>
              </tr>
              <tr class="font-weight-bold">
                <td colspan="3">
                  Saldo geral
                </td>
                <td
                  class="text-end"
                  :class="balancete.total >= 0 ? 'text-success' : 'text-error'"
                >
                  {{ formatBRL(balancete.total) }}
                </td>
              </tr>
            </tbody>
          </VTable>
        </VCard>
      </VWindowItem>

      <!-- Comparativo -->
      <VWindowItem value="comparativo">
        <VCard title="Receitas x Despesas — últimos 6 meses">
          <VCardText>
            <VueApexCharts
              type="bar"
              :options="comparisonOptions"
              :series="comparisonSeries"
              :height="340"
            />
          </VCardText>
        </VCard>
      </VWindowItem>

      <!-- Comissões -->
      <VWindowItem value="comissoes">
        <VCard title="Relatório de comissões">
          <template #append>
            <VBtn
              variant="tonal"
              size="small"
              prepend-icon="ri-download-line"
              @click="exportCommissions"
            >
              CSV
            </VBtn>
          </template>
          <VDataTable
            :headers="[
              { title: 'Corretor', key: 'broker' },
              { title: 'Empreendimento', key: 'development' },
              { title: 'Comprador', key: 'buyer' },
              { title: 'Total', key: 'total', align: 'end' },
              { title: 'Recebido', key: 'received', align: 'end' },
              { title: 'Status', key: 'status' },
            ]"
            :items="commissionRows"
            :items-per-page="10"
          >
            <template #item.total="{ item }">
              {{ formatBRL(item.total) }}
            </template>
            <template #item.received="{ item }">
              {{ formatBRL(item.received) }}
            </template>
            <template #item.status="{ item }">
              <StatusChip
                :value="item.status"
                :map="commissionStatusMeta"
              />
            </template>
          </VDataTable>
        </VCard>
      </VWindowItem>

      <!-- Aging -->
      <VWindowItem value="aging">
        <VCard title="Aging de inadimplência">
          <template #append>
            <VBtn
              variant="tonal"
              size="small"
              prepend-icon="ri-download-line"
              @click="exportAging"
            >
              CSV
            </VBtn>
          </template>
          <VCardText>
            <VRow>
              <VCol
                v-for="b in aging"
                :key="b.label"
                cols="12"
                sm="6"
                md="3"
              >
                <VCard
                  variant="tonal"
                  :color="b.total ? 'error' : 'success'"
                >
                  <VCardText>
                    <div class="text-caption">
                      {{ b.label }}
                    </div>
                    <div class="text-h6">
                      {{ formatBRL(b.total) }}
                    </div>
                    <div class="text-caption">
                      {{ b.items.length }} título(s)
                    </div>
                  </VCardText>
                </VCard>
              </VCol>
            </VRow>
            <VTable
              density="compact"
              class="mt-4"
            >
              <thead>
                <tr>
                  <th>Faixa</th><th>Título</th><th>Dias</th><th class="text-end">
                    Valor
                  </th>
                </tr>
              </thead>
              <tbody>
                <template
                  v-for="b in aging"
                  :key="b.label"
                >
                  <tr
                    v-for="(i, idx) in b.items"
                    :key="`${b.label}-${idx}`"
                  >
                    <td>{{ b.label }}</td>
                    <td>{{ i.desc }}</td>
                    <td>{{ i.days }}</td>
                    <td class="text-end">
                      {{ formatBRL(i.amount) }}
                    </td>
                  </tr>
                </template>
                <tr v-if="aging.every(b => !b.items.length)">
                  <td
                    colspan="4"
                    class="text-center text-disabled"
                  >
                    Nenhuma conta vencida 🎉
                  </td>
                </tr>
              </tbody>
            </VTable>
          </VCardText>
        </VCard>
      </VWindowItem>

      <!-- Centros de custo -->
      <VWindowItem value="centros">
        <VCard title="Resultado por centro de custo">
          <template #append>
            <VBtn
              variant="tonal"
              size="small"
              prepend-icon="ri-download-line"
              @click="exportCostCenters"
            >
              CSV
            </VBtn>
          </template>
          <VDataTable
            :headers="[
              { title: 'Centro de custo', key: 'name' },
              { title: 'Receitas', key: 'rev', align: 'end' },
              { title: 'Despesas', key: 'exp', align: 'end' },
              { title: 'Resultado', key: 'result', align: 'end' },
            ]"
            :items="costCenterRows"
            :items-per-page="10"
          >
            <template #item.rev="{ item }">
              <span class="text-success">{{ formatBRL(item.rev) }}</span>
            </template>
            <template #item.exp="{ item }">
              <span class="text-error">{{ formatBRL(item.exp) }}</span>
            </template>
            <template #item.result="{ item }">
              <span
                class="font-weight-medium"
                :class="item.result >= 0 ? 'text-success' : 'text-error'"
              >{{ formatBRL(item.result) }}</span>
            </template>
          </VDataTable>
        </VCard>
      </VWindowItem>
    </VWindow>
  </div>
</template>
