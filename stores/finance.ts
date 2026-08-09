import { defineStore } from 'pinia'
import { useAppStore } from './app'
import { useAuditStore } from './audit'
import type {
  AppNotification,
  ChartAccount,
  Client,
  Commission,
  CommissionInstallment,
  CommissionSplit,
  CostCenter,
  Development,
  Employee,
  ExternalInvoiceInput,
  FunnelCard,
  FunnelHistory,
  FunnelStage,
  Invoice,
  NotificationRule,
  Payable,
  ReceiptInput,
  Receivable,
  Sale,
  Settlement,
  Supplier,
  Transaction,
} from '@/types/finance'

function deriveStatuses<T extends Payable | Receivable>(items: T[]): T[] {
  return items.map(item => {
    const late = daysUntil(item.dueDate) < 0
    if (item.status === 'open' && late)
      return { ...item, status: 'overdue' } as T
    if (item.status === 'overdue' && !late)
      return { ...item, status: 'open' } as T

    return item
  })
}

// ============================================================================
// Store financeira central. Todos os dados são in-memory (clonados do seed).
// Getters são SEMPRE escopados pela empresa atual (simula RLS multi-tenant).
// ============================================================================

export const useFinanceStore = defineStore('finance', {
  state: () => ({
    // Populado a partir do Supabase (ver hydrate). Vazio até a hidratação.
    chartAccounts: [] as ChartAccount[],
    costCenters: [] as CostCenter[],
    suppliers: [] as Supplier[],
    clients: [] as Client[],
    employees: [] as Employee[],
    payables: [] as Payable[],
    receivables: [] as Receivable[],
    transactions: [] as Transaction[],
    settlements: [] as Settlement[],
    developments: [] as Development[],
    sales: [] as Sale[],
    funnelCards: [] as FunnelCard[],
    funnelHistory: [] as FunnelHistory[],
    commissions: [] as Commission[],
    commissionInstallments: [] as CommissionInstallment[],
    commissionSplits: [] as CommissionSplit[],
    invoices: [] as Invoice[],
    notifications: [] as AppNotification[],
    notificationRules: [] as NotificationRule[],

    // Status da integração NFS-e (carregado do servidor sob demanda). null =
    // ainda não verificado; configured=false → emissão roda no modo simulado.
    nfseStatus: null as null | {
      enabled?: boolean
      configured: boolean
      provider: string
      ambiente: string
      municipioIbge?: string
      certificate?: { present: boolean; subjectCN?: string; holderDocument?: string; notAfter?: string; daysToExpire?: number; error?: string }
    },
  }),

  getters: {
    // empresa atual ------------------------------------------------------------
    cid(): string {
      return useAppStore().currentCompanyId
    },

    // listas escopadas ---------------------------------------------------------
    companyChartAccounts(state): ChartAccount[] {
      return state.chartAccounts.filter(x => x.companyId === this.cid)
    },
    companyCostCenters(state): CostCenter[] {
      return state.costCenters.filter(x => x.companyId === this.cid)
    },
    companySuppliers(state): Supplier[] {
      return state.suppliers.filter(x => x.companyId === this.cid)
    },
    companyClients(state): Client[] {
      return state.clients.filter(x => x.companyId === this.cid)
    },
    companyEmployees(state): Employee[] {
      return state.employees.filter(x => x.companyId === this.cid)
    },
    companyPayables(state): Payable[] {
      return deriveStatuses(state.payables.filter(x => x.companyId === this.cid))
    },
    companyReceivables(state): Receivable[] {
      return deriveStatuses(state.receivables.filter(x => x.companyId === this.cid))
    },
    companyTransactions(state): Transaction[] {
      return state.transactions.filter(x => x.companyId === this.cid)
    },
    companySettlements(state): Settlement[] {
      return state.settlements.filter(x => x.companyId === this.cid)
    },
    receiptsOf(): (receivableId: string) => Settlement[] {
      const cid = this.cid

      return (receivableId: string) => this.settlements
        .filter(s => s.companyId === cid && s.receivableId === receivableId)
        .sort((a, b) => b.settledAt.localeCompare(a.settledAt))
    },
    companyDevelopments(state): Development[] {
      return state.developments.filter(x => x.companyId === this.cid)
    },
    companySales(state): Sale[] {
      return state.sales.filter(x => x.companyId === this.cid)
    },
    companyFunnel(state): FunnelCard[] {
      return state.funnelCards.filter(x => x.companyId === this.cid)
    },
    companyCommissions(state): Commission[] {
      return state.commissions.filter(x => x.companyId === this.cid)
    },
    companyInvoices(state): Invoice[] {
      return state.invoices.filter(x => x.companyId === this.cid)
    },
    companyNotifications(state): AppNotification[] {
      const uid = useAppStore().currentUserId

      return state.notifications
        .filter(x => x.companyId === this.cid && (!x.userId || x.userId === uid))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },
    companyNotificationRules(state): NotificationRule[] {
      return state.notificationRules.filter(x => x.companyId === this.cid)
    },

    // lookups — escopados pela empresa atual (defesa em profundidade multi-tenant)
    accountName(): (id?: string) => string {
      const cid = this.cid

      return (id?: string) => this.chartAccounts.find(x => x.id === id && x.companyId === cid)?.name ?? '—'
    },
    costCenterName(): (id?: string) => string {
      const cid = this.cid

      return (id?: string) => this.costCenters.find(x => x.id === id && x.companyId === cid)?.name ?? '—'
    },
    transactionCategoryId(): (transaction: Transaction) => string | undefined {
      const cid = this.cid

      return (transaction: Transaction) => {
        if (transaction.categoryId)
          return transaction.categoryId
        if (transaction.receivableId)
          return this.receivables.find(x => x.id === transaction.receivableId && x.companyId === cid)?.categoryId
        if (transaction.payableId)
          return this.payables.find(x => x.id === transaction.payableId && x.companyId === cid)?.categoryId

        return undefined
      }
    },
    transactionCostCenterId(): (transaction: Transaction) => string | undefined {
      const cid = this.cid

      return (transaction: Transaction) => {
        if (transaction.costCenterId)
          return transaction.costCenterId
        if (transaction.receivableId)
          return this.receivables.find(x => x.id === transaction.receivableId && x.companyId === cid)?.costCenterId
        if (transaction.payableId)
          return this.payables.find(x => x.id === transaction.payableId && x.companyId === cid)?.costCenterId

        return undefined
      }
    },
    supplierName(): (id?: string) => string {
      const cid = this.cid

      return (id?: string) => {
        const s = this.suppliers.find(x => x.id === id && x.companyId === cid)

        return s?.tradeName || s?.legalName || '—'
      }
    },
    employeeName(): (id?: string) => string {
      const cid = this.cid

      return (id?: string) => this.employees.find(x => x.id === id && x.companyId === cid)?.fullName ?? '—'
    },
    developmentName(): (id?: string) => string {
      const cid = this.cid

      return (id?: string) => this.developments.find(x => x.id === id && x.companyId === cid)?.name ?? '—'
    },
    saleById(): (id?: string) => Sale | undefined {
      const cid = this.cid

      return (id?: string) => this.sales.find(x => x.id === id && x.companyId === cid)
    },
    installmentsOf: state => (commissionId: string) =>
      state.commissionInstallments
        .filter(x => x.commissionId === commissionId)
        .sort((a, b) => a.installmentNumber - b.installmentNumber),
    splitsOf: state => (commissionId: string) =>
      state.commissionSplits.filter(x => x.commissionId === commissionId),
    commissionOfSale(): (saleId: string) => Commission | undefined {
      const cid = this.cid

      return (saleId: string) => this.commissions.find(x => x.saleId === saleId && x.companyId === cid)
    },

    unreadNotificationCount(): number {
      return this.companyNotifications.filter(n => n.status !== 'read').length
    },
  },

  actions: {
    // ---- hidratação (Supabase) ----------------------------------------------

    /** Popula os dados financeiros a partir do que foi carregado do Supabase. */
    hydrate(data: Record<string, unknown[]>) {
      this.chartAccounts = (data.chartAccounts ?? []) as ChartAccount[]
      this.costCenters = (data.costCenters ?? []) as CostCenter[]
      this.suppliers = (data.suppliers ?? []) as Supplier[]
      this.clients = (data.clients ?? []) as Client[]
      this.employees = (data.employees ?? []) as Employee[]
      this.developments = (data.developments ?? []) as Development[]
      this.sales = (data.sales ?? []) as Sale[]
      this.commissions = (data.commissions ?? []) as Commission[]
      this.commissionInstallments = (data.commissionInstallments ?? []) as CommissionInstallment[]
      this.commissionSplits = (data.commissionSplits ?? []) as CommissionSplit[]
      this.payables = (data.payables ?? []) as Payable[]
      this.receivables = (data.receivables ?? []) as Receivable[]
      this.transactions = (data.transactions ?? []) as Transaction[]
      this.settlements = (data.settlements ?? []) as Settlement[]
      this.funnelCards = (data.funnelCards ?? []) as FunnelCard[]
      this.funnelHistory = (data.funnelHistory ?? []) as FunnelHistory[]
      this.invoices = (data.invoices ?? []) as Invoice[]
      this.notifications = (data.notifications ?? []) as AppNotification[]
      this.notificationRules = (data.notificationRules ?? []) as NotificationRule[]
    },

    reset() {
      this.$reset()
    },

    // ---- helpers -------------------------------------------------------------

    /** Recalcula o status "overdue" ⇆ "open" conforme a data de vencimento. */
    withDerivedStatus<T extends Payable | Receivable>(items: T[]): T[] {
      return items.map(it => {
        const late = daysUntil(it.dueDate) < 0
        if (it.status === 'open' && late)
          return { ...it, status: 'overdue' } as T

        // desvence: se um item vencido teve a data movida para o futuro
        if (it.status === 'overdue' && !late)
          return { ...it, status: 'open' } as T

        return it
      })
    },

    /** Perfis somente-leitura (contador/visualizador) não escrevem. */
    canWrite(): boolean {
      return !useAppStore().isReadOnly
    },

    /** Atalho de registro no log de auditoria. */
    logAudit(action: string, entityType: string, description: string, entityId?: string) {
      useAuditStore().record(action, entityType, description, entityId)
    },

    notify(n: Omit<AppNotification, 'id' | 'companyId' | 'createdAt' | 'status'>) {
      this.notifications.push({
        ...n,
        id: uid('ntf'),
        companyId: useAppStore().currentCompanyId,
        status: 'sent',
        createdAt: new Date().toISOString(),
      })
    },

    // ---- cadastros base ------------------------------------------------------

    async saveSupplier(s: Partial<Supplier>) {
      if (!this.canWrite())
        return
      const saved = await useDb().saveSupplier(s)
      const index = this.suppliers.findIndex(item => item.id === saved.id)
      if (index >= 0)
        this.suppliers[index] = saved
      else
        this.suppliers.unshift(saved)

      return saved
    },

    async saveEmployee(e: Partial<Employee>) {
      if (!this.canWrite())
        return
      const saved = await useDb().saveEmployee(e)
      const index = this.employees.findIndex(item => item.id === saved.id)
      if (index >= 0)
        this.employees[index] = saved
      else
        this.employees.unshift(saved)

      return saved
    },

    async saveCostCenter(c: Partial<CostCenter>) {
      if (!this.canWrite())
        return
      const saved = await useDb().saveCostCenter(c)
      const index = this.costCenters.findIndex(item => item.id === saved.id)
      if (index >= 0)
        this.costCenters[index] = saved
      else
        this.costCenters.unshift(saved)

      return saved
    },

    async saveChartAccount(a: Partial<ChartAccount>) {
      if (!this.canWrite())
        return
      const saved = await useDb().saveChartAccount(a)
      const index = this.chartAccounts.findIndex(item => item.id === saved.id)
      if (index >= 0)
        this.chartAccounts[index] = saved
      else
        this.chartAccounts.unshift(saved)

      return saved
    },

    async toggleActive(collection: 'suppliers' | 'employees' | 'costCenters' | 'chartAccounts' | 'developments', id: string) {
      if (!this.canWrite())
        return
      const list = this[collection] as { id: string; isActive?: boolean; status?: string }[]
      const item = list.find(x => x.id === id)
      if (!item)
        return

      const table = {
        suppliers: 'suppliers',
        employees: 'employees',
        costCenters: 'cost_centers',
        chartAccounts: 'chart_accounts',
        developments: 'developments',
      }[collection]

      if ('isActive' in item) {
        const active = !item.isActive

        await useDb().toggleActive(table, id, active)
        item.isActive = active
      }
    },

    // ---- contas a pagar / receber -------------------------------------------

    async savePayable(p: Partial<Payable>) {
      if (!this.canWrite())
        return
      const isNew = !p.id
      const saved = await useDb().savePayable(p)
      const displaySaved = this.withDerivedStatus([saved])[0]
      const index = this.payables.findIndex(item => item.id === saved.id)
      if (index >= 0)
        this.payables[index] = displaySaved
      else
        this.payables.unshift(displaySaved)

      this.logAudit(isNew ? 'create' : 'update', 'payable', `${isNew ? 'Cadastro' : 'Edição'}: ${saved.description}`, saved.id)

      return displaySaved
    },

    /** Cria N parcelas de uma conta a pagar. */
    async createInstallmentPayable(pBase: Partial<Payable>, count: number) {
      if (!this.canWrite())
        return
      const baseDate = new Date(`${pBase.dueDate ?? todayISO()}T00:00:00`)
      const amount = Number(pBase.amount ?? 0)
      const items: Partial<Payable>[] = []
      for (let n = 1; n <= count; n++) {
        const due = new Date(baseDate)

        due.setMonth(due.getMonth() + (n - 1))
        items.push({
          description: `${pBase.description ?? 'Parcela'} (${n}/${count})`,
          amount,
          dueDate: due.toISOString().slice(0, 10),
          competenceDate: pBase.competenceDate,
          categoryId: pBase.categoryId,
          costCenterId: pBase.costCenterId,
          supplierId: pBase.supplierId,
          employeeId: pBase.employeeId,
          recurrence: 'once',
          installmentNumber: n,
          totalInstallments: count,
          notes: pBase.notes,
          proofUrl: pBase.proofUrl,
          status: 'open',
        })
      }
      const saved = await useDb().createPayableInstallments(items)

      this.payables.unshift(...saved)

      return saved
    },

    /**
     * Gera as próximas ocorrências de contas a pagar/receber recorrentes cujo
     * vencimento já passou e ainda não existem. Idempotente e limitado (evita
     * geração descontrolada). Retorna quantos lançamentos foram criados.
     */
    async generateRecurrences(): Promise<number> {
      if (!this.canWrite())
        return 0
      const cid = this.cid
      const today = todayISO()
      let created = 0

      const advance = (iso: string, rec: string): string | null => {
        const d = new Date(`${iso}T00:00:00`)
        if (rec === 'weekly')
          d.setDate(d.getDate() + 7)
        else if (rec === 'monthly')
          d.setMonth(d.getMonth() + 1)
        else if (rec === 'quarterly')
          d.setMonth(d.getMonth() + 3)
        else if (rec === 'yearly')
          d.setFullYear(d.getFullYear() + 1)
        else return null

        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      }

      const seriesKey = (desc: string, extra: string, amount: number) =>
        `${desc.replace(/\s*\(\d+\/\d+\)\s*$/, '')}|${extra}|${amount}`

      // ---- contas a pagar recorrentes (exclui parcelamentos) ----
      const payGroups = new Map<string, Payable[]>()

      this.payables
        .filter(p => p.companyId === cid && p.recurrence !== 'once' && !p.totalInstallments)
        .forEach(p => {
          const k = seriesKey(p.description, p.supplierId ?? p.employeeId ?? '', p.amount)
          if (!payGroups.has(k))
            payGroups.set(k, [])
          payGroups.get(k)!.push(p)
        })
      for (const arr of payGroups.values()) {
        arr.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        let last = arr[arr.length - 1]
        for (let guard = 0; guard < 36; guard++) {
          const next = advance(last.dueDate, last.recurrence)
          if (!next || next > today || arr.some(p => p.dueDate === next))
            break

          const saved = await useDb().savePayable({
            ...structuredClone(toRaw(last)),
            id: undefined,
            dueDate: next,
            status: 'open',
            paidAt: undefined,
            paidAmount: 0,
            proofUrl: undefined,
            createdAt: undefined,
          })

          this.payables.push(saved)
          arr.push(saved)
          last = saved
          created++
        }
      }

      // ---- contas a receber recorrentes (recurrence 'monthly') ----
      const recGroups = new Map<string, Receivable[]>()

      this.receivables
        .filter(r => r.companyId === cid && r.recurrence === 'monthly')
        .forEach(r => {
          const k = seriesKey(r.description, r.clientName ?? '', r.amount)
          if (!recGroups.has(k))
            recGroups.set(k, [])
          recGroups.get(k)!.push(r)
        })
      for (const arr of recGroups.values()) {
        arr.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        let last = arr[arr.length - 1]
        for (let guard = 0; guard < 36; guard++) {
          const next = advance(last.dueDate, 'monthly')
          if (!next || next > today || arr.some(r => r.dueDate === next))
            break

          const nextInvoiceDate = last.invoiceRule === 'scheduled'
            ? advance(last.invoiceScheduledDate ?? last.dueDate, 'monthly') ?? next
            : undefined

          const saved = await this.saveReceivable({
            ...structuredClone(toRaw(last)),
            id: undefined,
            dueDate: next,
            invoiceRule: last.invoiceRule === 'manual' ? 'on_receive' : last.invoiceRule,
            invoiceScheduledDate: nextInvoiceDate,
            status: 'open',
            receivedAt: undefined,
            receivedAmount: 0,
            proofUrl: undefined,
            commissionInstallmentId: undefined,
            createdAt: undefined,
          })

          if (!saved)
            break
          arr.push(saved)
          last = saved
          created++
        }
      }

      if (created > 0)
        this.logAudit('generate', 'recurrence', `${created} lançamento(s) recorrente(s) gerado(s)`)

      return created
    },

    async payPayable(id: string, opts: { amount?: number; proofUrl?: string } = {}) {
      if (!this.canWrite())
        return
      const p = this.payables.find(x => x.id === id)
      if (!p || p.status === 'paid')
        return
      const remaining = p.amount - (p.paidAmount ?? 0)
      const amount = opts.amount ?? remaining
      const saved = await useDb().settlePayable(id, amount, opts.proofUrl)

      Object.assign(p, saved)
      this.transactions = await useDb().loadTransactions()
      this.settlements = await useDb().loadSettlements()

      // se esta conta é um repasse de comissão, marca o split vinculado como pago
      const split = this.commissionSplits.find(s => s.payableId === id)
      if (split && split.status === 'pending')
        split.status = 'paid'

      this.logAudit('pay', 'payable', `Baixa: ${p.description} — ${formatBRL(amount)}`, p.id)

      return saved
    },

    async reopenPayable(id: string, reason: string) {
      if (!this.canWrite())
        return
      const target = this.payables.find(p => p.id === id)
      if (!target || (target.paidAmount ?? 0) <= 0)
        return target
      const reversedAmount = target.paidAmount ?? 0

      const saved = await useDb().reopenPayable(id, reason)

      Object.assign(target, saved)
      this.transactions = await useDb().loadTransactions()
      this.settlements = await useDb().loadSettlements()

      const split = this.commissionSplits.find(s => s.payableId === id)
      if (split)
        split.status = 'pending'

      this.logAudit('reverse', 'payable', `Reabertura de pagamento: ${saved.description} — ${formatBRL(reversedAmount)}`, saved.id)

      return saved
    },

    async cancelPayable(id: string) {
      if (!this.canWrite())
        return
      const p = this.payables.find(x => x.id === id)
      if (p) {
        Object.assign(p, await useDb().cancelPayable(id))
        this.logAudit('cancel', 'payable', `Cancelamento: ${p.description}`, p.id)
      }
    },

    async deletePayable(id: string) {
      if (!this.canWrite())
        return
      const index = this.payables.findIndex(item => item.id === id)
      if (index < 0)
        return
      const target = this.payables[index]

      await useDb().deletePayable(id)
      this.payables.splice(index, 1)
      this.logAudit('delete', 'payable', `Exclusão permanente: ${target.description}`, id)

      return id
    },

    async saveReceivable(
      r: Partial<Receivable>,
      options: { initialReceipt?: ReceiptInput; externalInvoice?: ExternalInvoiceInput } = {},
    ) {
      if (!this.canWrite())
        return
      const isNew = !r.id
      const saved = await useDb().saveReceivable(r, options)
      const displaySaved = this.withDerivedStatus([saved])[0]
      const index = this.receivables.findIndex(item => item.id === saved.id)
      if (index >= 0)
        this.receivables[index] = displaySaved
      else
        this.receivables.unshift(displaySaved)
      if (options.initialReceipt) {
        this.transactions = await useDb().loadTransactions()
        this.settlements = await useDb().loadSettlements()
      }

      if (isNew && saved.invoiceRule === 'immediate')
        await this.createInvoiceFromReceivable(saved.id, false)
      if (isNew && options.initialReceipt && saved.invoiceRule === 'on_receive')
        await this.createInvoiceFromReceivable(saved.id, false)

      if (saved.invoiceRule === 'manual') {
        const refreshed = await loadAppData()
        if (refreshed)
          this.hydrate(refreshed.finance)
      }

      this.logAudit(isNew ? 'create' : 'update', 'receivable', `${isNew ? 'Cadastro' : 'Edição'}: ${saved.description}`, saved.id)

      return displaySaved
    },

    async receiveReceivable(
      id: string,
      opts: Partial<ReceiptInput> & { amount?: number } = {},
    ) {
      if (!this.canWrite())
        return
      const r = this.receivables.find(x => x.id === id)
      if (!r || r.status === 'received')
        return
      const remaining = r.amount - (r.receivedAmount ?? 0)
      const amount = opts.amount ?? remaining

      const receipt: ReceiptInput = {
        amount,
        receivedAt: opts.receivedAt ?? new Date().toISOString(),
        method: opts.method ?? 'pix',
        account: opts.account,
        proofUrl: opts.proofUrl,
        notes: opts.notes,
        requestId: opts.requestId ?? crypto.randomUUID(),
      }

      const saved = await useDb().settleReceivable(id, receipt)

      Object.assign(r, saved)
      this.transactions = await useDb().loadTransactions()
      this.settlements = await useDb().loadSettlements()

      // O RPC atualiza também a parcela e o status da comissão.
      if (r.commissionInstallmentId) {
        const refreshed = await loadAppData()
        if (refreshed)
          this.hydrate(refreshed.finance)
      }

      // regra "ao receber": emite NFS-e na baixa
      if (r.invoiceRule === 'on_receive')
        await this.createInvoiceFromReceivable(r.id, false)

      this.logAudit('receive', 'receivable', `Recebimento: ${r.description} — ${formatBRL(amount)}`, r.id)

      return saved
    },

    async reverseReceivableSettlement(settlementId: string, reason: string) {
      if (!this.canWrite())
        return
      const settlement = this.settlements.find(s => s.id === settlementId)
      if (!settlement?.receivableId || settlement.type !== 'receipt')
        return

      const saved = await useDb().reverseReceivableSettlement(settlementId, reason, crypto.randomUUID())
      const target = this.receivables.find(r => r.id === settlement.receivableId)
      if (target)
        Object.assign(target, saved)
      this.transactions = await useDb().loadTransactions()
      this.settlements = await useDb().loadSettlements()

      if (saved.commissionInstallmentId) {
        const refreshed = await loadAppData()
        if (refreshed)
          this.hydrate(refreshed.finance)
      }

      this.logAudit('reverse', 'receivable', `Estorno de recebimento: ${saved.description} — ${formatBRL(settlement.amount)}`, saved.id)

      return saved
    },

    async reopenReceivable(id: string, reason: string) {
      if (!this.canWrite())
        return
      const target = this.receivables.find(r => r.id === id)
      if (!target || (target.receivedAmount ?? 0) <= 0)
        return target

      const reversedAmount = target.receivedAmount ?? 0
      const saved = await useDb().reopenReceivable(id, reason)

      Object.assign(target, saved)
      this.transactions = await useDb().loadTransactions()
      this.settlements = await useDb().loadSettlements()

      if (saved.commissionInstallmentId) {
        const refreshed = await loadAppData()
        if (refreshed)
          this.hydrate(refreshed.finance)
      }

      this.logAudit('reverse', 'receivable', `Reabertura de recebimento: ${saved.description} — ${formatBRL(reversedAmount)}`, saved.id)

      return saved
    },

    async cancelReceivable(id: string) {
      if (!this.canWrite())
        return
      const r = this.receivables.find(x => x.id === id)
      if (r) {
        Object.assign(r, await useDb().cancelReceivable(id))
        this.logAudit('cancel', 'receivable', `Cancelamento: ${r.description}`, r.id)
      }
    },

    async deleteReceivable(id: string) {
      if (!this.canWrite())
        return
      const index = this.receivables.findIndex(item => item.id === id)
      if (index < 0)
        return
      const target = this.receivables[index]

      await useDb().deleteReceivable(id)
      this.receivables.splice(index, 1)
      this.logAudit('delete', 'receivable', `Exclusão permanente: ${target.description}`, id)

      return id
    },

    // ---- comercial -----------------------------------------------------------

    async saveDevelopment(dv: Partial<Development>) {
      // empreendimentos definem as regras de comissão → só gestão financeira
      if (!useAppStore().canManageFinance)
        return
      const saved = await useDb().saveDevelopment(dv)
      const index = this.developments.findIndex(item => item.id === saved.id)
      if (index >= 0)
        this.developments[index] = saved
      else
        this.developments.unshift(saved)

      return saved
    },

    /** Registra venda e (opcionalmente) gera a comissão pelo motor. */
    async saveSale(
      s: Partial<Sale>,
      generateCommission = true,
      commissionOpts: { installments?: number; managerPct?: number; captadorPct?: number } = {},
    ) {
      if (!this.canWrite())
        return s.id
      const saved = await useDb().saveSale(s, generateCommission, commissionOpts)
      const index = this.sales.findIndex(item => item.id === saved.id)
      if (index >= 0)
        this.sales[index] = saved
      else
        this.sales.unshift(saved)

      if (generateCommission) {
        const refreshed = await loadAppData()
        if (refreshed)
          this.hydrate(refreshed.finance)
      }
      if (!s.id)
        this.logAudit('create', 'sale', `Venda registrada: ${saved.buyerName} — ${formatBRL(saved.saleValue)}`, saved.id)
      else
        this.logAudit('update', 'sale', `Venda atualizada: ${saved.buyerName} — ${formatBRL(saved.saleValue)}`, saved.id)

      return saved.id
    },

    async deleteSale(id: string) {
      if (!useAppStore().isAdmin)
        return
      await useDb().deleteSale(id)

      const refreshed = await loadAppData()
      if (refreshed)
        this.hydrate(refreshed.finance)
    },

    async updateCommission(input: {
      id: string
      totalAmount: number
      receiptType: string
      installments: number
      firstDueDate: string
      managerPct?: number
      captadorPct?: number
      notes?: string
    }) {
      if (!useAppStore().canManageFinance)
        return
      const id = await useDb().updateCommission(input)
      const refreshed = await loadAppData()
      if (refreshed)
        this.hydrate(refreshed.finance)

      return id
    },

    async deleteCommission(id: string) {
      if (!useAppStore().isAdmin)
        return
      await useDb().deleteCommission(id)

      const refreshed = await loadAppData()
      if (refreshed)
        this.hydrate(refreshed.finance)
    },

    // ---- funil ---------------------------------------------------------------

    async saveFunnelCard(card: Partial<FunnelCard>) {
      if (!this.canWrite())
        return
      const saved = await useDb().saveFunnelCard(card)
      const index = this.funnelCards.findIndex(item => item.id === saved.id)
      if (index >= 0)
        this.funnelCards[index] = saved
      else
        this.funnelCards.unshift(saved)

      return saved
    },

    async moveFunnelCard(id: string, toStage: FunnelStage) {
      if (!this.canWrite())
        return
      const card = this.funnelCards.find(x => x.id === id)
      if (!card || card.currentStage === toStage)
        return

      const history = {
        id: uid('fh'),
        cardId: id,
        fromStage: card.currentStage,
        toStage,
        changedAt: new Date().toISOString(),
      }

      const saved = await useDb().moveFunnelCard(id, toStage)

      this.funnelHistory.push(history)
      Object.assign(card, saved)
    },

    // ---- NFS-e ---------------------------------------------------------------

    async createInvoiceFromReceivable(receivableId: string, autoIssue = false) {
      const r = this.receivables.find(x => x.id === receivableId)
      if (!r || ['manual', 'none'].includes(r.invoiceRule))
        return
      const existing = this.invoices.find(i => i.receivableId === receivableId && i.status !== 'cancelled')
      if (existing)
        return existing.id
      const company = useAppStore().currentCompany
      const cfg = company.invoiceConfig

      const now = new Date()
      const competencia = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const issAmount = Number((r.amount * cfg.defaultIssRate / 100).toFixed(2))

      const inv: Invoice = {
        id: '',
        companyId: r.companyId,
        receivableId: r.id,
        cnae: cfg.defaultCnae,
        cnaeCode: cfg.defaultCnae.replace(/\D/g, ''),
        lc116Item: cfg.defaultLc116Item,
        ctiss: cfg.defaultCtiss,
        issRate: cfg.defaultIssRate,
        issRetido: cfg.issRetidoDefault ?? false,
        issAmount,
        netAmount: Number((r.amount - (cfg.issRetidoDefault ? issAmount : 0)).toFixed(2)),
        serviceDescription: cfg.defaultServiceDescription,
        amount: r.amount,
        municipioIbge: company.cityIbge ?? company.address?.cityIbge,
        competencia,
        rpsSeries: cfg.rpsSeries ?? '1',
        rpsType: 1,
        takerName: r.clientName ?? '—',
        takerDocument: r.clientDocument ?? '',
        status: 'pending',
        createdAt: now.toISOString(),
      }

      const saved = await useDb().saveInvoice(inv)

      this.invoices.unshift(saved)
      if (autoIssue)
        await this.issueInvoice(saved.id)

      return saved.id
    },

    /** Verifica no servidor se a emissão real (certificado A1 + SEFIN) está ativa. */
    async loadNfseStatus(force = false) {
      if (this.nfseStatus && !force)
        return this.nfseStatus
      try {
        this.nfseStatus = await $fetch('/api/nfse/status')
      }
      catch {
        this.nfseStatus = { configured: false, provider: 'ginfes', ambiente: 'homologacao' }
      }

      return this.nfseStatus
    },

    /** Monta o corpo; dados do prestador são sempre resolvidos no servidor. */
    buildEmitirRequest(inv: Invoice) {
      let takerAddress
      if (inv.takerAddress) {
        takerAddress = {
          logradouro: inv.takerAddress.street,
          numero: inv.takerAddress.number,
          complemento: inv.takerAddress.complement,
          bairro: inv.takerAddress.neighborhood,
          cidadeIbge: inv.takerAddress.cityIbge,
          uf: inv.takerAddress.state,
          cep: inv.takerAddress.zipCode,
        }
      }

      return {
        companyId: inv.companyId,
        invoiceId: inv.id,
        invoice: {
          rpsSeries: inv.rpsSeries ?? '1',
          rpsType: inv.rpsType ?? 1,
          dataEmissao: new Date().toISOString(),
          competencia: inv.competencia,
          lc116Item: inv.lc116Item ?? '',
          ctiss: inv.ctiss,
          cnaeCode: inv.cnaeCode,
          issRate: inv.issRate,
          issRetido: inv.issRetido ?? false,
          serviceDescription: inv.serviceDescription,
          amount: inv.amount,
          deductionsAmount: inv.deductionsAmount,
          municipioIbge: inv.municipioIbge,
          taker: {
            name: inv.takerName,
            document: inv.takerDocument,
            email: inv.takerEmail,
            address: takerAddress,
          },
        },
      }
    },

    /**
     * Emite a NFS-e. Não existe fallback simulado em produção: sem integração
     * habilitada, a nota permanece pendente e o usuário recebe erro explícito.
     */
    async issueInvoice(id: string) {
      if (!this.canWrite())
        return
      const inv = this.invoices.find(x => x.id === id)
      if (!inv || inv.status === 'issued')
        return

      inv.series = inv.rpsSeries ?? '1'

      const status = await this.loadNfseStatus()
      if (!status?.configured) {
        inv.status = 'error'
        inv.errorMessage = 'Emissão fiscal desabilitada ou certificado não configurado. Nenhuma nota foi emitida.'
        throw new Error(inv.errorMessage)
      }

      // ---- Emissão real (SEFIN Fortaleza) ------------------------------------
      inv.status = 'processing'
      inv.errorMessage = undefined
      try {
        const res = await $fetch('/api/nfse/emitir', { method: 'POST', body: this.buildEmitirRequest(inv) })

        if (res.success && res.status === 'issued') {
          inv.status = 'issued'
          inv.invoiceNumber = res.invoiceNumber
          inv.verificationCode = res.verificationCode
          inv.protocol = res.protocol
          inv.issuedAt = res.issuedAt ?? new Date().toISOString()
          inv.publicUrl = res.publicUrl
          inv.xmlBase64 = res.xmlBase64
          inv.environment = res.environment
          this.notify({ type: 'invoice_issued', title: 'NFS-e emitida', message: `NFS-e ${res.invoiceNumber} emitida para ${inv.takerName}.`, channel: 'dashboard', severity: 'success' })
          this.logAudit('emit_invoice', 'invoice', `NFS-e ${res.invoiceNumber} emitida (SEFIN ${res.environment}) para ${inv.takerName}`, inv.id)
        }
        else {
          inv.status = 'error'
          inv.protocol = res.protocol
          inv.errorMessage = (res.errors ?? []).map(e => `${e.code ? `[${e.code}] ` : ''}${e.message}`).join(' · ') || 'Falha na emissão.'
          this.notify({ type: 'invoice_error', title: 'Erro na emissão da NFS-e', message: inv.errorMessage, channel: 'dashboard', severity: 'error' })
          this.logAudit('emit_invoice', 'invoice', `Erro ao emitir NFS-e para ${inv.takerName}: ${inv.errorMessage}`, inv.id)
        }
      }
      catch (e) {
        inv.status = 'error'
        inv.errorMessage = (e as Error).message || 'Falha de comunicação com o servidor.'
        this.notify({ type: 'invoice_error', title: 'Erro na emissão da NFS-e', message: inv.errorMessage, channel: 'dashboard', severity: 'error' })
      }
    },

    /** Reconsulta uma NFS-e que ficou "em processamento" na SEFIN. */
    async consultInvoice(id: string) {
      const inv = this.invoices.find(x => x.id === id)
      if (!inv?.rpsNumber)
        return
      const status = await this.loadNfseStatus()
      if (!status?.configured)
        return

      try {
        const res = await $fetch('/api/nfse/consultar', {
          method: 'POST',
          body: {
            companyId: inv.companyId,
            invoiceId: inv.id,
            rpsNumber: inv.rpsNumber,
            rpsSeries: inv.rpsSeries ?? '1',
            rpsType: inv.rpsType ?? 1,
          },
        })

        if (res.success && res.status === 'issued') {
          inv.status = 'issued'
          inv.invoiceNumber = res.invoiceNumber
          inv.verificationCode = res.verificationCode
          inv.issuedAt = res.issuedAt ?? new Date().toISOString()
          inv.publicUrl = res.publicUrl
          inv.xmlBase64 = res.xmlBase64
          inv.environment = res.environment
          this.notify({ type: 'invoice_issued', title: 'NFS-e localizada', message: `NFS-e ${res.invoiceNumber} confirmada para ${inv.takerName}.`, channel: 'dashboard', severity: 'success' })
        }
      }
      catch { /* mantém o status atual */ }
    },

    async cancelInvoice(id: string, reason?: string) {
      if (!this.canWrite())
        return
      const inv = this.invoices.find(x => x.id === id)
      if (!inv)
        return

      const status = await this.loadNfseStatus()

      if (!status?.configured)
        throw new Error('Cancelamento fiscal desabilitado ou certificado não configurado.')
      if (!inv.invoiceNumber)
        throw new Error('A nota ainda não possui número fiscal e não pode ser cancelada na prefeitura.')

      try {
        const res = await $fetch('/api/nfse/cancelar', {
          method: 'POST',
          body: {
            companyId: inv.companyId,
            invoiceId: inv.id,
            numeroNfse: inv.invoiceNumber,
            codigoMunicipio: inv.municipioIbge,
            codigoCancelamento: '1',
            motivo: reason || 'Cancelamento solicitado pelo usuário.',
          },
        })

        if (res.success) {
          inv.status = 'cancelled'
          inv.cancelledAt = res.cancelledAt ?? new Date().toISOString()
          inv.cancelReason = reason
          this.logAudit('cancel_invoice', 'invoice', `NFS-e ${inv.invoiceNumber} cancelada na SEFIN para ${inv.takerName}`, inv.id)
        }
        else {
          inv.errorMessage = (res.errors ?? []).map(e => e.message).join(' · ') || 'Falha no cancelamento.'
          this.notify({ type: 'invoice_error', title: 'Erro ao cancelar NFS-e', message: inv.errorMessage, channel: 'dashboard', severity: 'error' })
        }
      }
      catch (e) {
        inv.errorMessage = (e as Error).message
        this.notify({ type: 'invoice_error', title: 'Erro ao cancelar NFS-e', message: inv.errorMessage, channel: 'dashboard', severity: 'error' })
      }
    },

    retryInvoice(id: string) {
      const inv = this.invoices.find(x => x.id === id)

      // Se ficou em processamento na SEFIN, reconsulta; senão reenvia.
      if (inv?.status === 'processing' || (inv?.status === 'error' && inv.protocol))
        return this.consultInvoice(id)

      return this.issueInvoice(id)
    },

    // ---- notificações --------------------------------------------------------

    async markNotificationRead(id: string) {
      const n = this.notifications.find(x => x.id === id)
      if (n) {
        await useDb().markNotificationRead(id)
        n.status = 'read'
        n.readAt = new Date().toISOString()
      }
    },

    async markAllNotificationsRead() {
      await useDb().markAllNotificationsRead()
      this.companyNotifications.forEach(n => (n.status = 'read'))
    },

    async saveNotificationRule(rule: NotificationRule) {
      if (!this.canWrite())
        return
      const saved = await useDb().saveNotificationRule(rule)
      const index = this.notificationRules.findIndex(item => item.id === saved.id)
      if (index >= 0)
        this.notificationRules[index] = saved
      else
        this.notificationRules.unshift(saved)
    },
  },
})
