import { defineStore } from 'pinia'
import { useAppStore } from './app'
import { useAuditStore } from './audit'
import * as seed from '@/data/seed'
import type {
  AppNotification,
  ChartAccount,
  Commission,
  CommissionInstallment,
  CommissionSplit,
  CostCenter,
  Development,
  Employee,
  FunnelCard,
  FunnelHistory,
  FunnelStage,
  Invoice,
  NotificationRule,
  Payable,
  Receivable,
  Sale,
  Supplier,
  Transaction,
} from '@/types/finance'

// ============================================================================
// Store financeira central. Todos os dados são in-memory (clonados do seed).
// Getters são SEMPRE escopados pela empresa atual (simula RLS multi-tenant).
// ============================================================================

const clone = <T>(v: T): T => structuredClone(v)

export const useFinanceStore = defineStore('finance', {
  state: () => ({
    chartAccounts: clone(seed.chartAccounts) as ChartAccount[],
    costCenters: clone(seed.costCenters) as CostCenter[],
    suppliers: clone(seed.suppliers) as Supplier[],
    employees: clone(seed.employees) as Employee[],
    payables: clone(seed.payables) as Payable[],
    receivables: clone(seed.receivables) as Receivable[],
    transactions: clone(seed.transactions) as Transaction[],
    developments: clone(seed.developments) as Development[],
    sales: clone(seed.sales) as Sale[],
    funnelCards: clone(seed.funnelCards) as FunnelCard[],
    funnelHistory: [] as FunnelHistory[],
    commissions: clone(seed.commissions) as Commission[],
    commissionInstallments: clone(seed.commissionInstallments) as CommissionInstallment[],
    commissionSplits: clone(seed.commissionSplits) as CommissionSplit[],
    invoices: clone(seed.invoices) as Invoice[],
    notifications: clone(seed.notifications) as AppNotification[],
    notificationRules: clone(seed.notificationRules) as NotificationRule[],
    // Status da integração NFS-e (carregado do servidor sob demanda). null =
    // ainda não verificado; configured=false → emissão roda no modo simulado.
    nfseStatus: null as null | {
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
    companyEmployees(state): Employee[] {
      return state.employees.filter(x => x.companyId === this.cid)
    },
    companyPayables(state): Payable[] {
      return this.withDerivedStatus(state.payables.filter(x => x.companyId === this.cid)) as Payable[]
    },
    companyReceivables(state): Receivable[] {
      return this.withDerivedStatus(state.receivables.filter(x => x.companyId === this.cid)) as Receivable[]
    },
    companyTransactions(state): Transaction[] {
      return state.transactions.filter(x => x.companyId === this.cid)
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

    pushTransaction(t: Omit<Transaction, 'id' | 'createdAt'>) {
      this.transactions.push({ ...t, id: uid('tx'), createdAt: new Date().toISOString() })
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

    saveSupplier(s: Partial<Supplier>) {
      if (!this.canWrite())
        return
      if (s.id) {
        const i = this.suppliers.findIndex(x => x.id === s.id)
        if (i >= 0)
          this.suppliers[i] = { ...this.suppliers[i], ...s } as Supplier
      }
      else {
        this.suppliers.push({
          id: uid('sup'),
          companyId: this.cid,
          isActive: true,
          bankInfo: {},
          createdAt: new Date().toISOString(),
          documentType: 'cnpj',
          documentNumber: '',
          legalName: '',
          ...s,
        } as Supplier)
      }
    },

    saveEmployee(e: Partial<Employee>) {
      if (!this.canWrite())
        return
      if (e.id) {
        const i = this.employees.findIndex(x => x.id === e.id)
        if (i >= 0)
          this.employees[i] = { ...this.employees[i], ...e } as Employee
      }
      else {
        this.employees.push({
          id: uid('emp'),
          companyId: this.cid,
          status: 'active',
          bankInfo: {},
          createdAt: new Date().toISOString(),
          fullName: '',
          cpf: '',
          employmentType: 'clt',
          ...e,
        } as Employee)
      }
    },

    saveCostCenter(c: Partial<CostCenter>) {
      if (!this.canWrite())
        return
      if (c.id) {
        const i = this.costCenters.findIndex(x => x.id === c.id)
        if (i >= 0)
          this.costCenters[i] = { ...this.costCenters[i], ...c } as CostCenter
      }
      else {
        this.costCenters.push({ id: uid('cc'), companyId: this.cid, isActive: true, name: '', ...c } as CostCenter)
      }
    },

    saveChartAccount(a: Partial<ChartAccount>) {
      if (!this.canWrite())
        return
      if (a.id) {
        const i = this.chartAccounts.findIndex(x => x.id === a.id)
        if (i >= 0)
          this.chartAccounts[i] = { ...this.chartAccounts[i], ...a } as ChartAccount
      }
      else {
        this.chartAccounts.push({
          id: uid('coa'),
          companyId: this.cid,
          parentId: null,
          code: '',
          name: '',
          type: 'expense',
          isActive: true,
          ...a,
        } as ChartAccount)
      }
    },

    toggleActive(collection: 'suppliers' | 'employees' | 'costCenters' | 'chartAccounts' | 'developments', id: string) {
      if (!this.canWrite())
        return
      const list = this[collection] as { id: string; isActive?: boolean; status?: string }[]
      const item = list.find(x => x.id === id)
      if (item && 'isActive' in item)
        item.isActive = !item.isActive
    },

    // ---- contas a pagar / receber -------------------------------------------

    savePayable(p: Partial<Payable>) {
      if (!this.canWrite())
        return
      if (p.id) {
        const i = this.payables.findIndex(x => x.id === p.id)
        if (i >= 0)
          this.payables[i] = { ...this.payables[i], ...p } as Payable
      }
      else {
        this.payables.push({
          id: uid('pay'),
          companyId: this.cid,
          description: '',
          amount: 0,
          dueDate: todayISO(),
          recurrence: 'once',
          status: 'open',
          createdAt: new Date().toISOString(),
          ...p,
        } as Payable)
      }
    },

    /** Cria N parcelas de uma conta a pagar. */
    createInstallmentPayable(pBase: Partial<Payable>, count: number) {
      if (!this.canWrite())
        return
      const parentId = uid('pay')
      const baseDate = new Date(`${pBase.dueDate ?? todayISO()}T00:00:00`)
      const amount = Number(pBase.amount ?? 0)
      for (let n = 1; n <= count; n++) {
        const due = new Date(baseDate)

        due.setMonth(due.getMonth() + (n - 1))
        this.payables.push({
          id: n === 1 ? parentId : uid('pay'),
          companyId: this.cid,
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
          parentPayableId: n === 1 ? undefined : parentId,
          notes: pBase.notes,
          proofUrl: pBase.proofUrl,
          status: 'open',
          createdAt: new Date().toISOString(),
        } as Payable)
      }
    },

    /**
     * Gera as próximas ocorrências de contas a pagar/receber recorrentes cujo
     * vencimento já passou e ainda não existem. Idempotente e limitado (evita
     * geração descontrolada). Retorna quantos lançamentos foram criados.
     */
    generateRecurrences(): number {
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
      payGroups.forEach(arr => {
        arr.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        let last = arr[arr.length - 1]
        for (let guard = 0; guard < 36; guard++) {
          const next = advance(last.dueDate, last.recurrence)
          if (!next || next > today || arr.some(p => p.dueDate === next))
            break
          const created_ = { ...clone(last), id: uid('pay'), dueDate: next, status: 'open' as const, paidAt: undefined, paidAmount: undefined, proofUrl: undefined, createdAt: new Date().toISOString() }

          this.payables.push(created_)
          arr.push(created_)
          last = created_
          created++
        }
      })

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
      recGroups.forEach(arr => {
        arr.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        let last = arr[arr.length - 1]
        for (let guard = 0; guard < 36; guard++) {
          const next = advance(last.dueDate, 'monthly')
          if (!next || next > today || arr.some(r => r.dueDate === next))
            break
          const created_ = { ...clone(last), id: uid('rec'), dueDate: next, status: 'open' as const, receivedAt: undefined, receivedAmount: undefined, proofUrl: undefined, commissionInstallmentId: undefined, createdAt: new Date().toISOString() }

          this.receivables.push(created_)
          arr.push(created_)
          last = created_
          created++
        }
      })

      if (created > 0)
        this.logAudit('generate', 'recurrence', `${created} lançamento(s) recorrente(s) gerado(s)`)

      return created
    },

    payPayable(id: string, opts: { amount?: number; proofUrl?: string } = {}) {
      if (!this.canWrite())
        return
      const p = this.payables.find(x => x.id === id)
      if (!p || p.status === 'paid')
        return
      p.status = 'paid'
      p.paidAt = new Date().toISOString()
      p.paidAmount = opts.amount ?? p.amount
      if (opts.proofUrl)
        p.proofUrl = opts.proofUrl
      this.pushTransaction({ companyId: p.companyId, type: 'expense', amount: p.paidAmount, date: p.paidAt, payableId: p.id, description: p.description })

      // se esta conta é um repasse de comissão, marca o split vinculado como pago
      const split = this.commissionSplits.find(s => s.payableId === id)
      if (split && split.status === 'pending')
        split.status = 'paid'

      this.logAudit('pay', 'payable', `Baixa: ${p.description} — ${formatBRL(p.paidAmount)}`, p.id)
    },

    cancelPayable(id: string) {
      if (!this.canWrite())
        return
      const p = this.payables.find(x => x.id === id)
      if (p) {
        p.status = 'cancelled'
        this.logAudit('cancel', 'payable', `Cancelamento: ${p.description}`, p.id)
      }
    },

    saveReceivable(r: Partial<Receivable>) {
      if (!this.canWrite())
        return
      if (r.id) {
        const i = this.receivables.findIndex(x => x.id === r.id)
        if (i >= 0)
          this.receivables[i] = { ...this.receivables[i], ...r } as Receivable
      }
      else {
        const created = {
          id: uid('rec'),
          companyId: this.cid,
          description: '',
          amount: 0,
          dueDate: todayISO(),
          invoiceRule: 'on_receive',
          recurrence: 'once',
          status: 'open',
          createdAt: new Date().toISOString(),
          ...r,
        } as Receivable

        this.receivables.push(created)

        // regra "antecipada": emite NFS-e no ato do cadastro
        if (created.invoiceRule === 'immediate')
          this.createInvoiceFromReceivable(created.id, true)
      }
    },

    receiveReceivable(id: string, opts: { amount?: number; proofUrl?: string } = {}) {
      if (!this.canWrite())
        return
      const r = this.receivables.find(x => x.id === id)
      if (!r || r.status === 'received')
        return
      r.status = 'received'
      r.receivedAt = new Date().toISOString()
      r.receivedAmount = opts.amount ?? r.amount
      if (opts.proofUrl)
        r.proofUrl = opts.proofUrl
      this.pushTransaction({ companyId: r.companyId, type: 'income', amount: r.receivedAmount, date: r.receivedAt, receivableId: r.id, description: r.description })

      // vincula parcela de comissão, se houver
      if (r.commissionInstallmentId) {
        const inst = this.commissionInstallments.find(x => x.id === r.commissionInstallmentId)
        if (inst) {
          inst.status = 'received'
          inst.receivedDate = todayISO()
          this.refreshCommissionStatus(inst.commissionId)
        }
      }

      // regra "ao receber": emite NFS-e na baixa
      if (r.invoiceRule === 'on_receive')
        this.createInvoiceFromReceivable(r.id, true)

      this.logAudit('receive', 'receivable', `Recebimento: ${r.description} — ${formatBRL(r.receivedAmount)}`, r.id)
    },

    cancelReceivable(id: string) {
      if (!this.canWrite())
        return
      const r = this.receivables.find(x => x.id === id)
      if (r) {
        r.status = 'cancelled'
        this.logAudit('cancel', 'receivable', `Cancelamento: ${r.description}`, r.id)
      }
    },

    // ---- comercial -----------------------------------------------------------

    saveDevelopment(dv: Partial<Development>) {
      // empreendimentos definem as regras de comissão → só gestão financeira
      if (!useAppStore().canManageFinance)
        return
      if (dv.id) {
        const i = this.developments.findIndex(x => x.id === dv.id)
        if (i >= 0)
          this.developments[i] = { ...this.developments[i], ...dv } as Development
      }
      else {
        this.developments.push({
          id: uid('dev'),
          companyId: this.cid,
          name: '',
          developer: '',
          type: 'launch',
          commissionPercentage: 0,
          brokerSplitPercentage: 0,
          isActive: true,
          createdAt: new Date().toISOString(),
          ...dv,
        } as Development)
      }
    },

    /** Registra venda e (opcionalmente) gera a comissão pelo motor. */
    saveSale(
      s: Partial<Sale>,
      generateCommission = true,
      commissionOpts: { installments?: number; managerPct?: number; captadorPct?: number } = {},
    ) {
      if (!this.canWrite())
        return s.id
      let saleId = s.id
      if (s.id) {
        const i = this.sales.findIndex(x => x.id === s.id)
        if (i >= 0)
          this.sales[i] = { ...this.sales[i], ...s } as Sale
      }
      else {
        saleId = uid('sale')
        this.sales.push({
          id: saleId,
          companyId: this.cid,
          developmentId: '',
          saleValue: 0,
          buyerName: '',
          paymentMethod: 'cash',
          brokerId: '',
          saleDate: todayISO(),
          status: 'in_progress',
          createdAt: new Date().toISOString(),
          ...s,
        } as Sale)
        if (generateCommission && saleId)
          this.generateCommissionForSale(saleId, commissionOpts)
        this.logAudit('create', 'sale', `Venda registrada: ${s.buyerName ?? ''} — ${formatBRL(s.saleValue)}`, saleId)
      }

      return saleId
    },

    /**
     * Motor de comissões — gera comissão, parcela, splits, conta a receber e
     * (quando aplicável) conta a pagar de repasse ao corretor.
     */
    generateCommissionForSale(
      saleId: string,
      opts: { receiptOverride?: Commission['receiptType']; installments?: number; managerPct?: number; captadorPct?: number } = {},
    ) {
      const sale = this.sales.find(x => x.id === saleId)
      if (!sale || this.commissions.some(c => c.saleId === saleId))
        return
      const dev = this.developments.find(x => x.id === sale.developmentId)
      if (!dev)
        return

      const total = +(sale.saleValue * dev.commissionPercentage / 100).toFixed(2)
      const brokerPct = dev.brokerSplitPercentage
      const managerPct = Math.max(0, opts.managerPct ?? 0)
      const captadorPct = Math.max(0, opts.captadorPct ?? 0)
      const brokerAmount = +(total * brokerPct / 100).toFixed(2)
      const managerAmount = +(total * managerPct / 100).toFixed(2)
      const captadorAmount = +(total * captadorPct / 100).toFixed(2)
      const brokerageAmount = +(total - brokerAmount - managerAmount - captadorAmount).toFixed(2)

      const receiptType: Commission['receiptType']
        = opts.receiptOverride ?? (dev.type === 'launch' ? 'launch_passthrough' : 'resale_consolidated')

      const commissionId = uid('com')

      this.commissions.push({
        id: commissionId,
        companyId: this.cid,
        saleId,
        totalAmount: total,
        receiptType,
        status: 'pending',
        createdAt: new Date().toISOString(),
      })

      // data local (yyyy-mm-dd) deslocada N dias
      const dueAfter = (days: number) => {
        const d = new Date()

        d.setDate(d.getDate() + days)

        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      }

      // N parcelas de comissão (padrão 1), cada uma com sua conta a receber
      const count = Math.max(1, Math.min(12, Math.round(opts.installments ?? 1)))
      const receivableTotal = receiptType === 'resale_split' ? brokerageAmount : total
      const per = +(receivableTotal / count).toFixed(2)
      const firstDueISO = dueAfter(30)

      for (let n = 1; n <= count; n++) {
        const dueISO = dueAfter(30 * n)
        const amount = n === count ? +(receivableTotal - per * (count - 1)).toFixed(2) : per
        const recId = uid('rec')
        const instId = uid('ci')
        const suffix = count > 1 ? ` (${n}/${count})` : ''

        this.receivables.push({
          id: recId,
          companyId: this.cid,
          clientName: receiptType === 'launch_passthrough' ? dev.developer : sale.buyerName,
          clientDocument: sale.buyerDocument,
          saleId,
          commissionInstallmentId: instId,
          description: `Comissão ${dev.name} — ${sale.buyerName}${suffix}`,
          amount,
          dueDate: dueISO,
          competenceDate: sale.saleDate,
          categoryId: this.companyChartAccounts.find(a => a.type === 'revenue' && a.parentId)?.id,
          costCenterId: this.companyCostCenters[0]?.id,
          invoiceRule: 'on_receive',
          recurrence: 'once',
          status: 'open',
          createdAt: new Date().toISOString(),
        })

        this.commissionInstallments.push({
          id: instId,
          commissionId,
          installmentNumber: n,
          amount,
          expectedDate: dueISO,
          status: 'pending',
          receivableId: recId,
        })
      }

      // split da imobiliária (informativo)
      this.commissionSplits.push({
        id: uid('cs'),
        commissionId,
        beneficiaryType: 'brokerage',
        percentage: +(100 - brokerPct - managerPct - captadorPct).toFixed(2),
        amount: brokerageAmount,
        status: 'not_applicable',
      })

      // no "avulso dividido" o corretor já recebe direto → sem conta a pagar
      let brokerPayableId: string | undefined
      if (receiptType !== 'resale_split') {
        brokerPayableId = uid('pay')
        this.payables.push({
          id: brokerPayableId,
          companyId: this.cid,
          employeeId: sale.brokerId,
          description: `Repasse comissão — ${sale.buyerName}`,
          amount: brokerAmount,
          dueDate: firstDueISO,
          categoryId: this.companyChartAccounts.find(a => a.name.includes('Repasse'))?.id,
          costCenterId: this.companyCostCenters[0]?.id,
          recurrence: 'once',
          status: 'open',
          notes: 'Executar após recebimento da comissão.',
          createdAt: new Date().toISOString(),
        } as Payable)
      }

      this.commissionSplits.push({
        id: uid('cs'),
        commissionId,
        beneficiaryType: 'broker',
        beneficiaryId: sale.brokerId,
        percentage: brokerPct,
        amount: brokerAmount,
        payableId: brokerPayableId,
        status: receiptType === 'resale_split' ? 'not_applicable' : 'pending',
      })

      // splits adicionais opcionais (gerente / captador) — informativos
      if (managerPct > 0) {
        this.commissionSplits.push({
          id: uid('cs'),
          commissionId,
          beneficiaryType: 'manager',
          percentage: managerPct,
          amount: managerAmount,
          status: 'pending',
        })
      }
      if (captadorPct > 0) {
        this.commissionSplits.push({
          id: uid('cs'),
          commissionId,
          beneficiaryType: 'captador',
          percentage: captadorPct,
          amount: captadorAmount,
          status: 'pending',
        })
      }
    },

    refreshCommissionStatus(commissionId: string) {
      const c = this.commissions.find(x => x.id === commissionId)
      if (!c)
        return
      const insts = this.commissionInstallments.filter(x => x.commissionId === commissionId)
      const received = insts.filter(x => x.status === 'received').length
      if (received === 0)
        c.status = 'pending'
      else if (received === insts.length)
        c.status = 'received'
      else
        c.status = 'partial'
    },

    // ---- funil ---------------------------------------------------------------

    saveFunnelCard(card: Partial<FunnelCard>) {
      if (!this.canWrite())
        return
      if (card.id) {
        const i = this.funnelCards.findIndex(x => x.id === card.id)
        if (i >= 0)
          this.funnelCards[i] = { ...this.funnelCards[i], ...card } as FunnelCard
      }
      else {
        this.funnelCards.push({
          id: uid('fn'),
          companyId: this.cid,
          contactName: '',
          currentStage: 'lead',
          stageEnteredAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          ...card,
        } as FunnelCard)
      }
    },

    moveFunnelCard(id: string, toStage: FunnelStage) {
      if (!this.canWrite())
        return
      const card = this.funnelCards.find(x => x.id === id)
      if (!card || card.currentStage === toStage)
        return
      this.funnelHistory.push({
        id: uid('fh'),
        cardId: id,
        fromStage: card.currentStage,
        toStage,
        changedAt: new Date().toISOString(),
      })
      card.currentStage = toStage
      card.stageEnteredAt = new Date().toISOString()
    },

    // ---- NFS-e (mock de emissão) --------------------------------------------

    createInvoiceFromReceivable(receivableId: string, autoIssue = false) {
      const r = this.receivables.find(x => x.id === receivableId)
      if (!r)
        return
      const company = useAppStore().currentCompany
      const cfg = company.invoiceConfig

      const now = new Date()
      const competencia = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const issAmount = Number((r.amount * cfg.defaultIssRate / 100).toFixed(2))

      const inv: Invoice = {
        id: uid('inv'),
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

      this.invoices.push(inv)
      if (autoIssue)
        this.issueInvoice(inv.id)

      return inv.id
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

    /** Próximo número de RPS por empresa (monotônico). */
    nextRpsNumber(companyId: string): string {
      const base = useAppStore().companyById(companyId)?.type === 'agency' ? 311 : 143
      const nums = this.invoices
        .filter(i => i.companyId === companyId && i.rpsNumber)
        .map(i => Number(i.rpsNumber))
        .filter(n => !Number.isNaN(n))

      return String(Math.max(base, ...nums) + 1).padStart(6, '0')
    },

    /** Monta o corpo da requisição de emissão a partir da nota + empresa. */
    buildEmitirRequest(inv: Invoice) {
      const company = useAppStore().companyById(inv.companyId)

      return {
        company: {
          cnpj: company?.cnpj ?? '',
          municipalRegistration: company?.municipalRegistration,
          razaoSocial: company?.name ?? '',
          nomeFantasia: company?.tradeName,
          cnaeCode: inv.cnaeCode ?? company?.mainCnae?.replace(/\D/g, ''),
          cityIbge: company?.cityIbge ?? company?.address?.cityIbge,
          optanteSimplesNacional: company?.taxRegime === 'simples_nacional',
          address: company?.address
            ? {
                logradouro: company.address.street,
                numero: company.address.number,
                complemento: company.address.complement,
                bairro: company.address.neighborhood,
                cidadeIbge: company.address.cityIbge,
                uf: company.address.state,
                cep: company.address.zipCode,
              }
            : undefined,
        },
        invoice: {
          rpsNumber: inv.rpsNumber ?? '',
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
            address: inv.takerAddress
              ? {
                  logradouro: inv.takerAddress.street,
                  numero: inv.takerAddress.number,
                  complemento: inv.takerAddress.complement,
                  bairro: inv.takerAddress.neighborhood,
                  cidadeIbge: inv.takerAddress.cityIbge,
                  uf: inv.takerAddress.state,
                  cep: inv.takerAddress.zipCode,
                }
              : undefined,
          },
        },
      }
    },

    /**
     * Emite a NFS-e. Se a integração real estiver configurada (certificado A1 +
     * SEFIN Fortaleza), chama o backend; caso contrário, usa emissão simulada.
     */
    async issueInvoice(id: string) {
      if (!this.canWrite())
        return
      const inv = this.invoices.find(x => x.id === id)
      if (!inv || inv.status === 'issued')
        return

      if (!inv.rpsNumber)
        inv.rpsNumber = this.nextRpsNumber(inv.companyId)
      inv.series = inv.rpsSeries ?? '1'

      const status = await this.loadNfseStatus()

      // ---- Modo simulado (sem certificado configurado) -----------------------
      if (!status?.configured) {
        const seq = this.nextRpsNumber(inv.companyId)
        inv.status = 'issued'
        inv.invoiceNumber = seq
        inv.verificationCode = `${Math.random().toString(36).slice(2, 6)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase()
        inv.issuedAt = new Date().toISOString()
        inv.environment = 'homologacao'
        inv.errorMessage = undefined
        this.notify({ type: 'invoice_issued', title: 'NFS-e emitida (simulada)', message: `NFS-e ${seq} emitida para ${inv.takerName}.`, channel: 'dashboard', severity: 'success' })
        this.logAudit('emit_invoice', 'invoice', `NFS-e ${seq} emitida (simulada) para ${inv.takerName}`, inv.id)

        return
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
            company: { cnpj: useAppStore().companyById(inv.companyId)?.cnpj, municipalRegistration: useAppStore().companyById(inv.companyId)?.municipalRegistration, cityIbge: inv.municipioIbge },
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

      // Modo simulado ou nota ainda não emitida na SEFIN.
      if (!status?.configured || !inv.invoiceNumber || inv.environment === 'homologacao' && !inv.protocol) {
        inv.status = 'cancelled'
        inv.cancelledAt = new Date().toISOString()
        inv.cancelReason = reason
        this.logAudit('cancel_invoice', 'invoice', `NFS-e cancelada para ${inv.takerName}`, inv.id)

        return
      }

      try {
        const res = await $fetch('/api/nfse/cancelar', {
          method: 'POST',
          body: {
            company: { cnpj: useAppStore().companyById(inv.companyId)?.cnpj, municipalRegistration: useAppStore().companyById(inv.companyId)?.municipalRegistration, cityIbge: inv.municipioIbge },
            numeroNfse: inv.invoiceNumber,
            codigoMunicipio: inv.municipioIbge,
            codigoCancelamento: '1',
            motivo: reason,
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

    markNotificationRead(id: string) {
      const n = this.notifications.find(x => x.id === id)
      if (n)
        n.status = 'read'
    },

    markAllNotificationsRead() {
      this.companyNotifications.forEach(n => (n.status = 'read'))
    },

    saveNotificationRule(rule: NotificationRule) {
      if (!this.canWrite())
        return
      const i = this.notificationRules.findIndex(x => x.id === rule.id)
      if (i >= 0)
        this.notificationRules[i] = { ...this.notificationRules[i], ...rule }
    },
  },
})
