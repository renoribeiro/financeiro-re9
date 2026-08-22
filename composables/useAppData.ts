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
  users: UserProfile[]
  currentUser: UserProfile
  finance: Record<string, unknown[]>
}

const CORE_TABLES = [
  'companies',
  'company_members',
  'user_profiles',
  'chart_accounts',
  'cost_centers',
  'suppliers',
  'employees',
  'clients',
  'developments',
  'sales',
  'commissions',
  'commission_installments',
  'commission_splits',
  'payables',
  'receivables',
  'transactions',
] as const

const OPTIONAL_TABLES = [
  'funnel_cards', 'funnel_history', 'invoices', 'notifications', 'notification_rules', 'settlements',
] as const

const TABLES = [...CORE_TABLES, ...OPTIONAL_TABLES] as const

function mapSuppliers(rows: Record<string, unknown>[]) {
  return camelizeRows(rows).map(row => {
    const documentNumber = String(row.document ?? '')

    return {
      ...row,
      documentNumber,
      documentType: documentNumber.replace(/\D/g, '').length === 11 ? 'cpf' : 'cnpj',
      bankInfo: row.bankInfo ?? {},
    }
  })
}

function mapEmployees(rows: Record<string, unknown>[]) {
  return camelizeRows(rows).map(row => ({
    ...row,
    cpf: String(row.document ?? ''),
    baseSalary: row.salary,
    bankInfo: row.bankInfo ?? {},
  }))
}

function mapInvoices(rows: Record<string, unknown>[]) {
  return camelizeRows(rows).map(row => ({
    ...row,
    invoiceNumber: row.nfseNumber,
    rpsNumber: row.rpsNumber == null ? undefined : String(row.rpsNumber),
    lc116Item: row.serviceCode,
    cnae: row.cnaeCode ?? '',
    verificationCode: row.verificationCode,
    xmlBase64: row.xmlResponse,
  }))
}

function mapNotifications(rows: Record<string, unknown>[]) {
  return camelizeRows(rows).map(row => {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>

    return {
      ...row,
      channel: metadata.channel ?? 'dashboard',
      severity: metadata.severity ?? 'info',
    }
  })
}

function mapNotificationRules(rows: Record<string, unknown>[]) {
  return camelizeRows(rows).map(row => ({
    ...row,
    label: row.name,
    advanceDays: row.daysBefore,
  }))
}

export async function loadAppData(): Promise<AppData | null> {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  if (!user.value)
    return null

  const results = await Promise.all(TABLES.map(t => supabase.from(t as any).select('*')))
  const data: Record<string, Record<string, unknown>[]> = {}

  TABLES.forEach((t, i) => {
    const optional = (OPTIONAL_TABLES as readonly string[]).includes(t)
    if (results[i].error && !optional)
      throw results[i].error
    if (results[i].error && optional)
      console.warn(`[loadAppData] tabela opcional ${t} indisponível:`, results[i].error.message)
    data[t] = (results[i].data as unknown as Record<string, unknown>[]) ?? []
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

  const users = data.user_profiles.map(profileRow => ({
    id: String(profileRow.id),
    fullName: String(profileRow.full_name || profileRow.email || 'Usuário'),
    email: String(profileRow.email || ''),
    phone: profileRow.phone ? String(profileRow.phone) : undefined,
    avatarColor: 'primary',
    roles: members
      .filter(member => member.user_id === profileRow.id)
      .map(member => ({ companyId: member.company_id, role: member.role })),
  })) satisfies UserProfile[]

  // Fallback robusto: se os vínculos não vieram na leitura direta da tabela,
  // busca-os pela RPC my_memberships() (sempre exposta; RLS aplica).
  if (currentUser.roles.length === 0) {
    const { data: cm, error: cmErr } = await (supabase.rpc as any)('my_memberships')
    if (cm?.length)
      currentUser.roles = (cm as { company_id: string; role: Role }[]).map(m => ({ companyId: m.company_id, role: m.role }))
    if (cmErr)
      console.warn('[loadAppData] memberships RPC indisponível:', cmErr.message)
  }

  const hydratedCurrentUser = users.find(profileUser => profileUser.id === currentUser.id)
  if (hydratedCurrentUser)
    hydratedCurrentUser.roles = currentUser.roles

  // Fixups: colunas ausentes no banco que o app espera com default.
  const withActive = (rows: Record<string, unknown>[]) => rows.map(r => ({ isActive: true, ...r }))

  return {
    companies,
    users,
    currentUser,
    finance: {
      chartAccounts: withActive(camelizeRows(data.chart_accounts)),
      costCenters: withActive(camelizeRows(data.cost_centers)),
      suppliers: mapSuppliers(data.suppliers),
      employees: mapEmployees(data.employees),
      clients: camelizeRows(data.clients),
      developments: camelizeRows(data.developments),
      sales: camelizeRows(data.sales),
      commissions: camelizeRows(data.commissions),
      commissionInstallments: camelizeRows(data.commission_installments),
      commissionSplits: camelizeRows(data.commission_splits),
      payables: camelizeRows(data.payables),
      receivables: camelizeRows(data.receivables),
      transactions: camelizeRows(data.transactions),
      settlements: camelizeRows(data.settlements),
      funnelCards: camelizeRows(data.funnel_cards),
      funnelHistory: camelizeRows(data.funnel_history),
      invoices: mapInvoices(data.invoices),
      notifications: mapNotifications(data.notifications),
      notificationRules: mapNotificationRules(data.notification_rules),
    },
  }
}
