// ============================================================================
// Carrega TODOS os dados do usuário autenticado a partir do Supabase e devolve
// já no formato dos stores (camelCase). O RLS por empresa garante que só vêm
// as empresas/linhas às quais o usuário tem acesso.
// ============================================================================
import type { Company, Role, UserProfile } from '@/types/finance'

const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())

function camelizeRow<T = Record<string, unknown>>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {}
  for (const k in row) out[toCamel(k)] = row[k]

  return out as T
}
const camelizeRows = (rows: unknown): Record<string, unknown>[] =>
  ((rows as Record<string, unknown>[]) ?? []).map(r => camelizeRow(r))

export interface AppData {
  companies: Company[]
  currentUser: UserProfile
  finance: Record<string, unknown[]>
}

const TABLES = [
  'companies', 'company_members', 'user_profiles',
  'chart_accounts', 'cost_centers', 'suppliers', 'employees',
  'developments', 'sales', 'commissions', 'commission_installments', 'commission_splits',
  'payables', 'receivables', 'transactions',
] as const

export async function loadAppData(): Promise<AppData | null> {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  if (!user.value)
    return null

  const results = await Promise.all(TABLES.map(t => supabase.from(t).select('*')))
  const data: Record<string, Record<string, unknown>[]> = {}
  TABLES.forEach((t, i) => {
    if (results[i].error)
      throw results[i].error
    data[t] = (results[i].data as Record<string, unknown>[]) ?? []
  })

  const companies = camelizeRows(data.companies) as unknown as Company[]

  const members = data.company_members as unknown as { user_id: string; company_id: string; role: Role }[]
  const profile = data.user_profiles.find(p => p.id === user.value!.id) as Record<string, unknown> | undefined
  const currentUser: UserProfile = {
    id: user.value.id,
    fullName: (profile?.full_name as string) || (profile?.email as string) || (user.value.email ?? 'Usuário'),
    email: (profile?.email as string) || (user.value.email ?? ''),
    phone: (profile?.phone as string) || undefined,
    avatarColor: 'primary',
    roles: members
      .filter(m => m.user_id === user.value!.id)
      .map(m => ({ companyId: m.company_id, role: m.role })),
  }

  // Fixups: colunas ausentes no banco que o app espera com default.
  const withActive = (rows: Record<string, unknown>[]) => rows.map(r => ({ isActive: true, ...r }))

  return {
    companies,
    currentUser,
    finance: {
      chartAccounts: withActive(camelizeRows(data.chart_accounts)),
      costCenters: withActive(camelizeRows(data.cost_centers)),
      suppliers: camelizeRows(data.suppliers),
      employees: camelizeRows(data.employees),
      developments: camelizeRows(data.developments),
      sales: camelizeRows(data.sales),
      commissions: camelizeRows(data.commissions),
      commissionInstallments: camelizeRows(data.commission_installments),
      commissionSplits: camelizeRows(data.commission_splits),
      payables: camelizeRows(data.payables),
      receivables: camelizeRows(data.receivables),
      transactions: camelizeRows(data.transactions),
    },
  }
}
