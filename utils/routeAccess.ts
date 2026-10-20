import type { Role } from '@/types/finance'

// ============================================================================
// Regras de acesso por página (empresa/perfil). Usadas pela guarda de rota e
// também ao trocar de empresa, para reavaliar a página aberta. Complementam o
// RLS do banco — não o substituem.
// ============================================================================

// páginas comerciais existem apenas para a imobiliária
const commercialRoutes = new Set([
  '/vendas',
  '/funil',
  '/empreendimentos',
  '/comissoes',
  '/portal-corretor',
])

// corretor só opera o próprio universo (portal, funil, vendas) — bloqueia gestão
const brokerBlocked = new Set([
  '/contas-a-pagar',
  '/contas-a-receber',
  '/fluxo-de-caixa',
  '/plano-de-contas',
  '/centros-de-custo',
  '/fornecedores',
  '/colaboradores',
  '/notas-fiscais',
  '/relatorios',
  '/configuracoes',
  '/importador',
  '/auditoria',
  '/dashboard-consolidado',
  '/clientes',
  '/empreendimentos',
  '/comissoes',
])

const managementOnly = new Set(['/importador'])
const auditRoles = new Set<Role>(['super_admin', 'admin', 'financial', 'accountant'])

export interface RouteAccessContext {
  isRealEstate: boolean
  isBroker: boolean
  canManageFinance: boolean
  isSuperAdmin: boolean
  currentRole: Role
}

/** Página inicial adequada ao perfil: o corretor da imobiliária vai ao Portal. */
export function homeRouteFor(ctx: RouteAccessContext): string {
  return ctx.isBroker && ctx.isRealEstate ? '/portal-corretor' : '/dashboard'
}

/** Retorna para onde redirecionar, ou `null` quando o acesso é permitido. */
export function resolveRouteRedirect(path: string, ctx: RouteAccessContext): string | null {
  const home = homeRouteFor(ctx)

  // páginas comerciais indisponíveis para empresa do tipo agência
  if (commercialRoutes.has(path) && !ctx.isRealEstate)
    return home

  // corretor não acessa páginas de gestão financeira/administrativa
  if (ctx.isBroker && brokerBlocked.has(path))
    return home

  // o painel financeiro da empresa não é do corretor (ele vê só o próprio Portal)
  if (ctx.isBroker && ctx.isRealEstate && path === '/dashboard')
    return '/portal-corretor'

  if (managementOnly.has(path) && !ctx.canManageFinance)
    return home

  if (path === '/auditoria' && !auditRoles.has(ctx.currentRole))
    return home

  if (path === '/dashboard-consolidado' && !ctx.isSuperAdmin)
    return home

  return null
}
