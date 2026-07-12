import { computed } from 'vue'
import { useFinanceStore } from '@/stores/finance'
import { useAppStore } from '@/stores/app'
import type { Company } from '@/types/finance'

// ============================================================================
// Métricas consolidadas do grupo (todas as empresas acessíveis) — usadas no
// dashboard do Super Admin. Agregam direto das listas cruas por companyId,
// pois os getters `company*` são escopados à empresa atual.
// ============================================================================

export interface CompanyMetrics {
  company: Company
  income: number
  expense: number
  balance: number
  openPayables: number
  overdueReceivables: number
  overdueAmount: number
}

export function useConsolidatedMetrics() {
  const finance = useFinanceStore()
  const app = useAppStore()

  const monthStart = computed(() => {
    const d = new Date()

    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const inCurrentMonth = (iso?: string) => {
    if (!iso)
      return false
    const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso)

    return d >= monthStart.value && d <= new Date()
  }

  const byCompany = computed<CompanyMetrics[]>(() =>
    app.availableCompanies.map(company => {
      const tx = finance.transactions.filter(t => t.companyId === company.id && inCurrentMonth(t.date))
      const income = tx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
      const expense = tx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)

      const openPayables = finance.payables
        .filter(p => p.companyId === company.id && (p.status === 'open' || (p.status !== 'paid' && p.status !== 'cancelled' && daysUntil(p.dueDate) < 0)))
        .reduce((s, p) => s + p.amount, 0)

      const overdue = finance.receivables
        .filter(r => r.companyId === company.id && r.status !== 'received' && r.status !== 'cancelled' && daysUntil(r.dueDate) < 0)

      return {
        company,
        income,
        expense,
        balance: income - expense,
        openPayables,
        overdueReceivables: overdue.length,
        overdueAmount: overdue.reduce((s, r) => s + r.amount, 0),
      }
    }),
  )

  const totals = computed(() => byCompany.value.reduce(
    (acc, m) => ({
      income: acc.income + m.income,
      expense: acc.expense + m.expense,
      balance: acc.balance + m.balance,
      openPayables: acc.openPayables + m.openPayables,
      overdueAmount: acc.overdueAmount + m.overdueAmount,
    }),
    { income: 0, expense: 0, balance: 0, openPayables: 0, overdueAmount: 0 },
  ))

  return { byCompany, totals }
}
