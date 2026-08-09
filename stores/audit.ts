import { defineStore } from 'pinia'
import { useAppStore } from './app'
import type { AuditEntry } from '@/types/finance'

const entityLabels: Record<string, string> = {
  chart_accounts: 'plano de contas',
  cost_centers: 'centro de custo',
  suppliers: 'fornecedor',
  clients: 'cliente',
  employees: 'colaborador',
  developments: 'empreendimento',
  sales: 'venda',
  commissions: 'comissão',
  commission_installments: 'parcela de comissão',
  commission_splits: 'divisão de comissão',
  payables: 'conta a pagar',
  receivables: 'conta a receber',
  transactions: 'transação',
  settlements: 'baixa financeira',
  funnel_cards: 'oportunidade do funil',
  funnel_history: 'movimentação do funil',
  invoices: 'NFS-e',
  notification_rules: 'regra de notificação',
  history: 'histórico',
}

function rowSummary(data?: Record<string, any> | null) {
  if (!data)
    return ''

  return data.buyer_name
    || data.description
    || data.name
    || data.full_name
    || data.trade_name
    || data.legal_name
    || data.nfse_number
    || ''
}

function describe(
  action: string,
  entityType: string,
  oldData?: Record<string, any> | null,
  newData?: Record<string, any> | null,
) {
  const entity = entityLabels[entityType] ?? entityType
  const summary = rowSummary(newData) || rowSummary(oldData)
  const suffix = summary ? ` — ${summary}` : ''

  if (action === 'insert')
    return `Criou ${entity}${suffix}`
  if (action === 'update')
    return `Atualizou ${entity}${suffix}`
  if (action === 'delete')
    return `Excluiu ${entity}${suffix}`
  if (action === 'restore')
    return `Restaurou o sistema para o ponto #${newData?.targetAuditId ?? ''}: ${newData?.reason ?? ''}`

  return `${action} em ${entity}${suffix}`
}

// A fonte de verdade é audit_log, preenchida por triggers do PostgreSQL.
export const useAuditStore = defineStore('audit', {
  state: () => ({
    entries: [] as AuditEntry[],
  }),

  getters: {
    companyEntries(state): AuditEntry[] {
      const app = useAppStore()

      return state.entries
        .filter(e => e.companyId === app.currentCompanyId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },
  },

  actions: {
    async load() {
      const app = useAppStore()
      if (!app.currentCompanyId)
        return
      const supabase = useSupabaseClient() as any

      const { data, error } = await supabase
        .from('audit_log')
        .select('id, company_id, actor_id, action, entity_type, entity_id, old_data, new_data, created_at')
        .eq('company_id', app.currentCompanyId)
        .order('created_at', { ascending: false })
        .limit(1000)

      if (error)
        throw new Error(error.message)

      const actorIds = [...new Set((data ?? [])
        .map((row: Record<string, any>) => row.actor_id)
        .filter(Boolean))]

      let profiles: Record<string, any>[] = []
      if (actorIds.length) {
        const { data: profileRows } = await supabase
          .from('user_profiles')
          .select('id, full_name, email')
          .in('id', actorIds)

        profiles = profileRows ?? []
      }
      const profileById = new Map(profiles.map(profile => [profile.id, profile]))

      this.entries = (data ?? []).map((row: Record<string, any>) => ({
        id: String(row.id),
        companyId: row.company_id,
        userId: row.actor_id ?? '',
        userName: row.actor_id
          ? (profileById.get(row.actor_id)?.full_name
            || profileById.get(row.actor_id)?.email
            || 'Usuário não identificado')
          : 'Sistema',
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id ?? undefined,
        description: describe(row.action, row.entity_type, row.old_data, row.new_data),
        createdAt: row.created_at,
        oldData: row.old_data ?? undefined,
        newData: row.new_data ?? undefined,
      }))
    },

    async restoreTo(targetAuditId: string, reason: string) {
      const supabase = useSupabaseClient() as any

      const { data, error } = await supabase.rpc('restore_company_to_history_point', {
        target_audit_id: targetAuditId,
        restore_reason: reason,
      })

      if (error)
        throw new Error(error.message)
      await this.load()

      return Number(data ?? 0)
    },

    reset() {
      this.entries = []
    },

    /** Entrada transitória; a confirmação durável vem do trigger no reload. */
    record(action: string, entityType: string, description: string, entityId?: string) {
      const app = useAppStore()

      this.entries.unshift({
        id: uid('aud'),
        companyId: app.currentCompanyId,
        userId: app.currentUserId,
        userName: app.currentUser.fullName,
        action,
        entityType,
        entityId,
        description,
        createdAt: new Date().toISOString(),
      })
    },
  },
})
