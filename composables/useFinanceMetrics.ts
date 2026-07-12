import { computed } from 'vue'
import { useFinanceStore } from '@/stores/finance'
import { useAppStore } from '@/stores/app'

// ============================================================================
// Métricas derivadas da empresa atual — usadas no dashboard, fluxo de caixa
// e relatórios. Tudo reativo à empresa selecionada.
// ============================================================================

export function useFinanceMetrics() {
  const finance = useFinanceStore()
  const app = useAppStore()

  const monthStart = computed(() => {
    const d = new Date()

    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const inCurrentMonth = (iso?: string) => {
    if (!iso)
      return false

    // datas puras (yyyy-mm-dd) devem ser interpretadas como meia-noite LOCAL,
    // senão em UTC-3 o dia 1º cai no mês anterior e some das métricas.
    const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso)

    return d >= monthStart.value && d <= new Date()
  }

  // 👉 Realizado no mês (transações)
  const realized = computed(() => {
    const tx = finance.companyTransactions.filter(t => inCurrentMonth(t.date))
    const income = tx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const expense = tx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)

    return { income, expense, balance: income - expense }
  })

  // 👉 Vencimentos da semana (próximos 7 dias, ainda não vencidos)
  // Piso `>= 0` para não misturar itens já vencidos (esses têm alerta próprio).
  const weekPayables = computed(() =>
    finance.companyPayables.filter(p => p.status === 'open' && daysUntil(p.dueDate) >= 0 && daysUntil(p.dueDate) <= 7),
  )

  const weekReceivables = computed(() =>
    finance.companyReceivables.filter(r => r.status === 'open' && daysUntil(r.dueDate) >= 0 && daysUntil(r.dueDate) <= 7),
  )

  const overduePayables = computed(() => finance.companyPayables.filter(p => p.status === 'overdue'))
  const overdueReceivables = computed(() => finance.companyReceivables.filter(r => r.status === 'overdue'))

  const sum = (arr: { amount: number }[]) => arr.reduce((s, x) => s + x.amount, 0)

  // 👉 Fluxo de caixa: últimos 30 dias (realizado) + acumulado
  const cashFlow30d = computed(() => {
    const days = 30
    const labels: string[] = []
    const income: number[] = []
    const expense: number[] = []
    const balance: number[] = []

    // Saldo de abertura = tudo que foi realizado ANTES da janela de 30 dias,
    // para o "Saldo acumulado" refletir o caixa real e não só o delta do período.
    const windowStart = new Date()

    windowStart.setHours(0, 0, 0, 0)
    windowStart.setDate(windowStart.getDate() - (days - 1))

    const windowStartKey = windowStart.toISOString().slice(0, 10)
    let acc = finance.companyTransactions
      .filter(t => t.date.slice(0, 10) < windowStartKey)
      .reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0)

    for (let i = days - 1; i >= 0; i--) {
      const day = new Date()

      day.setHours(0, 0, 0, 0)
      day.setDate(day.getDate() - i)

      const key = day.toISOString().slice(0, 10)
      const dayTx = finance.companyTransactions.filter(t => t.date.slice(0, 10) === key)
      const inc = dayTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
      const exp = dayTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)

      acc += inc - exp
      labels.push(day.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }))
      income.push(inc)
      expense.push(exp)
      balance.push(acc)
    }

    return { labels, income, expense, balance }
  })

  // 👉 Projeção próximos N dias (saldo atual + previstos)
  const projection = computed(() => {
    const horizon = [7, 15, 30]
    const currentBalance = realized.value.balance

    return horizon.map(days => {
      // Simétrico nos dois lados: inclui em aberto E vencidos (dinheiro ainda
      // a entrar/sair) com o mesmo teto de janela. Antes, vencidos a pagar
      // eram somados mas vencidos a receber ignorados → projeção pessimista.
      const futureIn = finance.companyReceivables
        .filter(r => ['open', 'overdue'].includes(r.status) && daysUntil(r.dueDate) <= days)
        .reduce((s, r) => s + r.amount, 0)

      const futureOut = finance.companyPayables
        .filter(p => ['open', 'overdue'].includes(p.status) && daysUntil(p.dueDate) <= days)
        .reduce((s, p) => s + p.amount, 0)

      return { days, projected: currentBalance + futureIn - futureOut, futureIn, futureOut }
    })
  })

  // 👉 DRE resumido do mês
  const dre = computed(() => {
    const revenues = realized.value.income
    const expenses = realized.value.expense

    return { revenues, expenses, result: revenues - expenses }
  })

  // 👉 Indicadores RE9 Imob
  const realEstate = computed(() => {
    const sales = finance.companySales.filter(s => inCurrentMonth(s.saleDate) && s.status !== 'cancelled')
    const vgv = sales.reduce((s, x) => s + x.saleValue, 0)
    const companyCommissionIds = new Set(finance.companyCommissions.map(c => c.id))

    const pendingCommission = finance.commissionInstallments
      .filter(i => companyCommissionIds.has(i.commissionId) && ['pending', 'overdue'].includes(i.status))
      .reduce((s, i) => s + i.amount, 0)

    const funnelByStage = funnelStages.map(st => ({
      ...st,
      count: finance.companyFunnel.filter(c => c.currentStage === st.value).length,
    }))

    return { salesCount: sales.length, vgv, pendingCommission, funnelByStage }
  })

  // 👉 Indicadores RE9 Online
  const agency = computed(() => {
    const contracts = finance.companyReceivables.filter(r => r.recurrence === 'monthly' && r.status !== 'cancelled')
    const monthlyRevenue = contracts.reduce((s, r) => s + r.amount, 0)
    const distinctClients = new Set(contracts.map(r => r.clientName)).size
    const overdue = overdueReceivables.value

    return {
      activeContracts: distinctClients,
      monthlyRevenue,
      delinquencyCount: overdue.length,
      delinquencyAmount: sum(overdue),
    }
  })

  return {
    realized,
    weekPayables,
    weekReceivables,
    overduePayables,
    overdueReceivables,
    cashFlow30d,
    projection,
    dre,
    realEstate,
    agency,
    sum,
    isRealEstate: computed(() => app.isRealEstate),
  }
}
