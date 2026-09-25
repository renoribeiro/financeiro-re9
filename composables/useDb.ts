import type {
  AppNotification,
  ChartAccount,
  Client,
  CostCenter,
  Development,
  Employee,
  ExternalInvoiceInput,
  FunnelCard,
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
import type { Database } from '@/types/database.types'
import { useAppStore } from '@/stores/app'
import {
  DEFAULT_BROKER_SPLIT_PERCENTAGE,
  DEFAULT_DEVELOPMENT_COMMISSION_PERCENTAGE,
} from '@/utils/developmentDefaults'

const toCamel = (value: string) => value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())

function camelize(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [toCamel(key), value]))
}

function clean(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  )
}

function supplierFromRow(row: Record<string, unknown>): Supplier {
  const data = camelize(row)
  const documentNumber = String(data.document ?? '')

  return {
    ...data,
    documentNumber,
    documentType: documentNumber.replace(/\D/g, '').length === 11 ? 'cpf' : 'cnpj',
    bankInfo: data.bankInfo ?? {},
  } as unknown as Supplier
}

function employeeFromRow(row: Record<string, unknown>): Employee {
  const data = camelize(row)

  return {
    ...data,
    cpf: String(data.document ?? ''),
    baseSalary: data.salary,
    bankInfo: data.bankInfo ?? {},
  } as unknown as Employee
}

export function useDb() {
  const supabase = useSupabaseClient<Database>()

  // As tabelas novas entram nos tipos gerados após a migração remota.
  const db = supabase as any
  const app = useAppStore()

  function companyId() {
    if (!app.currentCompanyId)
      throw new Error('Selecione uma empresa antes de salvar.')

    return app.currentCompanyId
  }

  async function saveRow(
    table: string,
    id: string | undefined,
    payload: Record<string, unknown>,
    map: (row: Record<string, unknown>) => any = camelize,
  ) {
    const cid = companyId()
    if (!app.canManageFinance && !app.isBroker)
      throw new Error('Seu perfil não permite alterações nesta empresa.')

    const query = id
      ? db.from(table).update(clean(payload)).eq('id', id).eq('company_id', cid)
      : db.from(table).insert({ company_id: cid, ...clean(payload) })

    const { data, error } = await query.select().single()
    if (error)
      throw new Error(error.message)

    return map(data as Record<string, unknown>)
  }

  async function updateRow(table: string, id: string, payload: Record<string, unknown>) {
    return saveRow(table, id, payload)
  }

  return {
    async saveCompany(id: string, payload: Record<string, unknown>) {
      const { data, error } = await db
        .from('companies')
        .update(clean(payload))
        .eq('id', id)
        .select()
        .single()

      if (error)
        throw new Error(error.message)

      return camelize(data as Record<string, unknown>)
    },

    async createClient(input: Record<string, unknown>) {
      return saveRow('clients', undefined, {
        name: input.name,
        document: input.document,
        email: input.email,
        phone: input.phone,
        bank_info: input.bankInfo,
        category_id: input.categoryId,
        address: input.address,
        city: input.city,
        state: input.state,
        notes: input.notes,
        is_active: true,
      }) as Promise<Client>
    },

    saveSupplier(input: Partial<Supplier>) {
      return saveRow('suppliers', input.id, {
        legal_name: input.legalName,
        trade_name: input.tradeName,
        document: input.documentNumber,
        email: input.email,
        phone: input.phone,
        bank_info: input.bankInfo,
        category_id: input.categoryId,
        notes: input.notes,
        is_active: input.isActive,
      }, supplierFromRow) as Promise<Supplier>
    },

    createSupplier(input: Record<string, unknown>) {
      return saveRow('suppliers', undefined, {
        legal_name: input.legalName,
        trade_name: input.tradeName,
        document: input.document,
        email: input.email,
        phone: input.phone,
        notes: input.notes,
        is_active: true,
      }, supplierFromRow) as Promise<Supplier>
    },

    saveEmployee(input: Partial<Employee>) {
      return saveRow('employees', input.id, {
        full_name: input.fullName,
        employment_type: input.employmentType,
        status: input.status ?? 'active',
        salary: input.baseSalary,
        email: input.email,
        phone: input.phone,
        document: input.cpf,
        user_id: input.userId,
        role_title: input.roleTitle,
        pj_cnpj: input.pjCnpj,
        bank_info: input.bankInfo,
        hire_date: input.hireDate,
        termination_date: input.terminationDate,
      }, employeeFromRow) as Promise<Employee>
    },

    createEmployee(input: Record<string, unknown>) {
      return saveRow('employees', undefined, {
        full_name: input.fullName,
        employment_type: input.employmentType,
        status: 'active',
        salary: input.salary,
        email: input.email,
        phone: input.phone,
        document: input.document,
        role_title: input.roleTitle,
        pj_cnpj: input.pjCnpj,
        bank_info: input.bankInfo,
        hire_date: input.hireDate,
        termination_date: input.terminationDate,
      }, employeeFromRow) as Promise<Employee>
    },

    saveCostCenter(input: Partial<CostCenter>) {
      return saveRow('cost_centers', input.id, {
        name: input.name,
        description: input.description,
        is_active: input.isActive,
      }) as Promise<CostCenter>
    },

    saveChartAccount(input: Partial<ChartAccount>) {
      return saveRow('chart_accounts', input.id, {
        code: input.code,
        name: input.name,
        type: input.type,
        parent_id: input.parentId,
        is_active: input.isActive,
      }) as Promise<ChartAccount>
    },

    async savePayable(input: Partial<Payable>) {
      const { data, error } = await db.rpc(input.id ? 'update_payable_entry' : 'save_payable_entry', {
        target_id: input.id ?? null,
        payload: {
          companyId: companyId(),
          description: input.description,
          amount: input.amount,
          dueDate: input.dueDate,
          competenceDate: input.competenceDate,
          categoryId: input.categoryId,
          costCenterId: input.costCenterId,
          supplierId: input.supplierId,
          employeeId: input.employeeId,
          recurrence: input.recurrence ?? 'once',
          installmentNumber: input.installmentNumber,
          totalInstallments: input.totalInstallments,
          parentPayableId: input.parentPayableId,
          proofUrl: input.proofUrl,
          notes: input.notes,
        },
      })

      if (error)
        throw new Error(error.message)

      return camelize(data as Record<string, unknown>) as unknown as Payable
    },

    createPayable(input: Record<string, unknown>) {
      return saveRow('payables', undefined, {
        description: input.description,
        amount: input.amount,
        due_date: input.dueDate,
        category_id: input.categoryId,
        cost_center_id: input.costCenterId,
        supplier_id: input.supplierId,
        employee_id: input.employeeId,
        status: input.status ?? 'open',
        recurrence: input.recurrence ?? 'once',
      }) as Promise<Payable>
    },

    async createPayableInstallments(items: Partial<Payable>[]) {
      const cid = companyId()

      const payload = items.map(item => ({
        company_id: cid,
        description: item.description,
        amount: item.amount,
        due_date: item.dueDate,
        competence_date: item.competenceDate,
        category_id: item.categoryId,
        cost_center_id: item.costCenterId,
        supplier_id: item.supplierId,
        employee_id: item.employeeId,
        recurrence: 'installment',
        installment_number: item.installmentNumber,
        total_installments: item.totalInstallments,
        parent_payable_id: item.parentPayableId,
        notes: item.notes,
        status: 'open',
      }))

      const { data, error } = await db.from('payables').insert(payload).select()
      if (error)
        throw new Error(error.message)

      return (data as Record<string, unknown>[]).map(camelize) as unknown as Payable[]
    },

    async saveReceivable(
      input: Partial<Receivable>,
      options: {
        initialReceipt?: ReceiptInput
        externalInvoice?: ExternalInvoiceInput
        adjustmentReason?: string
      } = {},
    ) {
      const payload = {
        companyId: companyId(),
        description: input.description,
        amount: input.amount,
        dueDate: input.dueDate,
        competenceDate: input.competenceDate,
        clientName: input.clientName,
        clientDocument: input.clientDocument,
        categoryId: input.categoryId,
        costCenterId: input.costCenterId,
        invoiceRule: input.invoiceRule ?? 'on_receive',
        invoiceScheduledDate: input.invoiceScheduledDate,
        invoiceRecurrenceDay: input.invoiceRecurrenceDay,
        recurrence: input.recurrence ?? 'once',
        notes: input.notes,
        saleId: input.saleId,
        commissionInstallmentId: input.commissionInstallmentId,
      }

      const isLinkedCommission = Boolean(input.id && (input.commissionInstallmentId || input.saleId))

      const args: Record<string, unknown> = {
        target_id: input.id ?? null,
        payload,
        external_invoice: options.externalInvoice ?? null,
      }

      if (isLinkedCommission) {
        args.adjustment_reason = options.adjustmentReason ?? null
        args.expected_updated_at = input.updatedAt ?? null
      }
      else if (!input.id) {
        args.initial_receipt = options.initialReceipt ?? null
      }

      const rpcName = isLinkedCommission
        ? 'update_commission_receivable_entry'
        : input.id ? 'update_receivable_entry' : 'save_receivable_entry'

      const { data, error } = await db.rpc(rpcName, args)

      if (error)
        throw new Error(error.message)

      return camelize(data as Record<string, unknown>) as unknown as Receivable
    },

    async settlePayable(id: string, amount: number, proofUrl?: string) {
      const { data, error } = await db.rpc('settle_payable', {
        target_id: id,
        settle_amount: amount,
        settle_at: new Date().toISOString(),
        proof: proofUrl,
        request_key: crypto.randomUUID(),
      })

      if (error)
        throw new Error(error.message)

      return camelize(data as Record<string, unknown>) as unknown as Payable
    },

    async reopenPayable(id: string, reason: string) {
      const { data, error } = await db.rpc('reopen_payable', {
        target_id: id,
        reversal_reason: reason,
      })

      if (error)
        throw new Error(error.message)

      return camelize(data as Record<string, unknown>) as unknown as Payable
    },

    async settleReceivable(id: string, receipt: ReceiptInput) {
      const { data, error } = await db.rpc('settle_receivable', {
        target_id: id,
        settle_amount: receipt.amount,
        settle_at: receipt.receivedAt,
        method: receipt.method,
        account_name: receipt.account,
        proof: receipt.proofUrl,
        request_key: receipt.requestId,
        settlement_note: receipt.notes,
      })

      if (error)
        throw new Error(error.message)

      return camelize(data as Record<string, unknown>) as unknown as Receivable
    },

    async loadTransactions() {
      const { data, error } = await db
        .from('transactions')
        .select('*')
        .eq('company_id', companyId())
        .order('date', { ascending: false })

      if (error)
        throw new Error(error.message)

      return (data as Record<string, unknown>[]).map(row => camelize(row) as unknown as Transaction)
    },

    async loadSettlements() {
      const { data, error } = await db
        .from('settlements')
        .select('*')
        .eq('company_id', companyId())
        .order('settled_at', { ascending: false })

      if (error)
        throw new Error(error.message)

      return (data as Record<string, unknown>[]).map(row => camelize(row) as unknown as Settlement)
    },

    async reverseReceivableSettlement(settlementId: string, reason: string, requestId: string) {
      const { data, error } = await db.rpc('reverse_receivable_settlement', {
        target_settlement: settlementId,
        reversed_at: new Date().toISOString(),
        reversal_reason: reason,
        request_key: requestId,
      })

      if (error)
        throw new Error(error.message)

      return camelize(data as Record<string, unknown>) as unknown as Receivable
    },

    async reopenReceivable(id: string, reason: string) {
      const { data, error } = await db.rpc('reopen_receivable', {
        target_id: id,
        reversal_reason: reason,
      })

      if (error)
        throw new Error(error.message)

      return camelize(data as Record<string, unknown>) as unknown as Receivable
    },

    cancelPayable: (id: string) => updateRow('payables', id, { status: 'cancelled' }) as Promise<Payable>,
    async cancelReceivable(id: string) {
      const { data, error } = await db.rpc('cancel_receivable', { target_id: id })
      if (error)
        throw new Error(error.message)

      return camelize(data as Record<string, unknown>) as unknown as Receivable
    },
    async deletePayable(id: string) {
      const { data, error } = await db.rpc('delete_payable_entry', { target_id: id })
      if (error)
        throw new Error(error.message)

      return data as string
    },
    async deleteReceivable(id: string) {
      const { data, error } = await db.rpc('delete_receivable_entry', { target_id: id })
      if (error)
        throw new Error(error.message)

      return data as string
    },

    saveDevelopment(input: Partial<Development>) {
      return saveRow('developments', input.id, {
        name: input.name,
        developer: input.developer,
        address: input.address,
        type: input.type,
        commission_percentage: input.commissionPercentage
          ?? (input.id ? undefined : DEFAULT_DEVELOPMENT_COMMISSION_PERCENTAGE),
        broker_split_percentage: input.brokerSplitPercentage
          ?? (input.id ? undefined : DEFAULT_BROKER_SPLIT_PERCENTAGE),
        is_active: input.isActive,
        notes: input.notes,
      }) as Promise<Development>
    },

    async saveSale(
      input: Partial<Sale>,
      generateCommission = true,
      options: {
        installments?: number
        managerPct?: number
        captadorPct?: number
        calculationMode?: 'percentage' | 'manual_amount'
        commissionPercentage?: number
        commissionAmountOverride?: number
      } = {},
    ) {
      const { data, error } = await db.rpc('save_sale_with_commission', {
        target_id: input.id ?? null,
        payload: {
          companyId: companyId(),
          developmentId: input.developmentId,
          unit: input.unit,
          saleValue: input.saleValue,
          buyerName: input.buyerName,
          buyerDocument: input.buyerDocument,
          buyerContact: input.buyerContact,
          paymentMethod: input.paymentMethod,
          brokerId: input.brokerId,
          saleDate: input.saleDate,
          status: input.status,
          notes: input.notes,
          commissionCalculationMode: options.calculationMode ?? input.commissionCalculationMode,
          commissionPercentage: options.commissionPercentage ?? input.commissionPercentage,
          commissionAmountOverride: options.calculationMode === 'manual_amount'
            ? options.commissionAmountOverride ?? input.commissionAmountOverride
            : undefined,
        },
        generate_commission: generateCommission,
        installment_count: options.installments ?? 1,
        manager_percentage: options.managerPct ?? 0,
        captador_percentage: options.captadorPct ?? 0,
      })

      if (error)
        throw new Error(error.message)

      return camelize(data as Record<string, unknown>) as unknown as Sale
    },

    async generateCommissionForSale(
      saleId: string,
      options: { installments?: number; managerPct?: number; captadorPct?: number },
    ) {
      const { data, error } = await db.rpc('generate_commission_for_sale', {
        target_sale: saleId,
        installment_count: options.installments ?? 1,
        manager_percentage: options.managerPct ?? 0,
        captador_percentage: options.captadorPct ?? 0,
      })

      if (error)
        throw new Error(error.message)

      return data as string
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
      const { data, error } = await db.rpc('update_commission_entry', {
        target_id: input.id,
        total_amount: input.totalAmount,
        receipt_type: input.receiptType,
        installment_count: input.installments,
        first_due_date: input.firstDueDate,
        manager_percentage: input.managerPct ?? 0,
        captador_percentage: input.captadorPct ?? 0,
        commission_notes: input.notes,
      })

      if (error)
        throw new Error(error.message)

      return data as string
    },

    async deleteCommission(id: string) {
      const { data, error } = await db.rpc('delete_commission_entry', { target_id: id })
      if (error)
        throw new Error(error.message)

      return data as string
    },

    async deleteSale(id: string) {
      const { data, error } = await db.rpc('delete_sale_entry', { target_id: id })
      if (error)
        throw new Error(error.message)

      return data as string
    },

    saveFunnelCard(input: Partial<FunnelCard>) {
      return saveRow('funnel_cards', input.id, {
        contact_name: input.contactName,
        contact_phone: input.contactPhone,
        contact_email: input.contactEmail,
        development_id: input.developmentId,
        estimated_value: input.estimatedValue,
        broker_id: input.brokerId,
        current_stage: input.currentStage,
        sale_id: input.saleId,
        notes: input.notes,
        stage_entered_at: input.stageEnteredAt,
        updated_at: new Date().toISOString(),
      }) as Promise<FunnelCard>
    },

    async moveFunnelCard(id: string, stage: string) {
      const { data, error } = await db.rpc('move_funnel_card', {
        target_id: id,
        target_stage: stage,
      })

      if (error)
        throw new Error(error.message)

      return camelize(data as Record<string, unknown>) as unknown as FunnelCard
    },

    saveNotificationRule(input: NotificationRule) {
      return saveRow('notification_rules', input.id, {
        type: input.type,
        name: input.label,
        is_active: input.isActive,
        channels: input.channels,
        days_before: input.advanceDays,
        config: input,
        updated_at: new Date().toISOString(),
      }, row => {
        const data = camelize(row)

        return { ...data, label: data.name, advanceDays: data.daysBefore }
      }) as Promise<NotificationRule>
    },

    async markNotificationRead(id: string) {
      const { data, error } = await db
        .from('notifications')
        .update({ status: 'read', read_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()

      if (error)
        throw new Error(error.message)

      return camelize(data as Record<string, unknown>)
    },

    createNotification(input: Omit<AppNotification, 'id' | 'companyId' | 'createdAt'>) {
      return saveRow('notifications', undefined, {
        user_id: input.userId ?? app.currentUserId,
        type: input.type,
        title: input.title,
        message: input.message,
        status: input.status,
        metadata: { channel: input.channel, severity: input.severity },
        sent_at: input.status === 'sent' ? new Date().toISOString() : undefined,
      }, row => {
        const data = camelize(row)
        const metadata = (data.metadata ?? {}) as Record<string, unknown>

        return {
          ...data,
          channel: metadata.channel ?? 'dashboard',
          severity: metadata.severity ?? 'info',
        }
      }) as Promise<AppNotification>
    },

    async markAllNotificationsRead() {
      const { error } = await db
        .from('notifications')
        .update({ status: 'read', read_at: new Date().toISOString() })
        .eq('company_id', companyId())
        .neq('status', 'read')

      if (error)
        throw new Error(error.message)
    },

    saveInvoice(input: Partial<Invoice>) {
      return saveRow('invoices', input.id, {
        receivable_id: input.receivableId,
        source: input.source ?? 'system',
        status: input.status ?? 'pending',
        environment: input.environment ?? 'homologacao',
        provider: 'ginfes',
        rps_series: input.rpsSeries ?? '1',
        nfse_number: input.invoiceNumber,
        verification_code: input.verificationCode,
        protocol: input.protocol,
        service_code: input.lc116Item,
        cnae_code: input.cnaeCode ?? input.cnae,
        ctiss: input.ctiss,
        iss_retido: input.issRetido,
        service_description: input.serviceDescription,
        amount: input.amount,
        deductions_amount: input.deductionsAmount,
        iss_amount: input.issAmount,
        net_amount: input.netAmount,
        iss_rate: input.issRate,
        municipio_ibge: input.municipioIbge,
        competencia: input.competencia,
        rps_type: input.rpsType,
        taker_name: input.takerName,
        taker_document: input.takerDocument,
        taker_email: input.takerEmail,
        taker_address: input.takerAddress,
        public_url: input.publicUrl,
        cancel_reason: input.cancelReason,
        error_message: input.errorMessage,
        issued_at: input.issuedAt,
        cancelled_at: input.cancelledAt,
      }) as Promise<Invoice>
    },

    async toggleActive(table: string, id: string, active: boolean) {
      return updateRow(table, id, { is_active: active })
    },
  }
}
