import { homeRouteFor, resolveRouteRedirect } from '../utils/routeAccess'
import type { RouteAccessContext } from '../utils/routeAccess'

let passed = 0
let failed = 0

function assert(name: string, condition: boolean) {
  if (condition) {
    passed++
  }
  else {
    failed++
    console.error(`  ✗ ${name}`)
  }
}

const admin: RouteAccessContext = { isRealEstate: true, isBroker: false, canManageFinance: true, isSuperAdmin: true, currentRole: 'super_admin' }
const broker: RouteAccessContext = { isRealEstate: true, isBroker: true, canManageFinance: false, isSuperAdmin: false, currentRole: 'broker' }
const agencyBroker: RouteAccessContext = { ...broker, isRealEstate: false }
const agencyAdmin: RouteAccessContext = { ...admin, isRealEstate: false }
const viewer: RouteAccessContext = { isRealEstate: true, isBroker: false, canManageFinance: false, isSuperAdmin: false, currentRole: 'viewer' }
const accountant: RouteAccessContext = { ...viewer, currentRole: 'accountant' }

assert('admin acessa o dashboard', resolveRouteRedirect('/dashboard', admin) === null)
assert('admin acessa contas a pagar', resolveRouteRedirect('/contas-a-pagar', admin) === null)
assert('corretor da imobiliária vai do dashboard ao portal', resolveRouteRedirect('/dashboard', broker) === '/portal-corretor')
assert('corretor não acessa contas a pagar', resolveRouteRedirect('/contas-a-pagar', broker) === '/portal-corretor')
assert('corretor acessa o portal', resolveRouteRedirect('/portal-corretor', broker) === null)
assert('corretor acessa vendas', resolveRouteRedirect('/vendas', broker) === null)
assert('corretor de agência fica no dashboard (sem laço)', resolveRouteRedirect('/dashboard', agencyBroker) === null)
assert('corretor de agência sai do portal para o dashboard', resolveRouteRedirect('/portal-corretor', agencyBroker) === '/dashboard')
assert('agência não acessa vendas', resolveRouteRedirect('/vendas', agencyAdmin) === '/dashboard')
assert('visualizador não acessa importador', resolveRouteRedirect('/importador', viewer) === '/dashboard')
assert('visualizador não acessa histórico', resolveRouteRedirect('/auditoria', viewer) === '/dashboard')
assert('contador acessa histórico', resolveRouteRedirect('/auditoria', accountant) === null)
assert('só super admin acessa consolidado', resolveRouteRedirect('/dashboard-consolidado', viewer) === '/dashboard')
assert('página inicial do corretor é o portal', homeRouteFor(broker) === '/portal-corretor')
assert('página inicial do admin é o dashboard', homeRouteFor(admin) === '/dashboard')

// Nenhum destino de redirecionamento pode redirecionar de novo (evita laço).
for (const ctx of [admin, broker, agencyBroker, agencyAdmin, viewer, accountant]) {
  for (const path of ['/dashboard', '/portal-corretor', '/vendas', '/contas-a-pagar', '/auditoria', '/importador', '/dashboard-consolidado']) {
    const target = resolveRouteRedirect(path, ctx)
    if (target)
      assert(`sem laço: ${ctx.currentRole}/${ctx.isRealEstate ? 'imob' : 'agência'} ${path} → ${target}`, resolveRouteRedirect(target, ctx) === null)
  }
}

console.log(`\nRouteAccess: ${passed} passaram, ${failed} falharam.`)
if (failed > 0)
  process.exit(1)
