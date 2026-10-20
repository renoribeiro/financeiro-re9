import { COMPANY_COOKIE, useAppStore } from '@/stores/app'
import { useFinanceStore } from '@/stores/finance'
import { useAuditStore } from '@/stores/audit'
import { resolveRouteRedirect } from '@/utils/routeAccess'

// ============================================================================
// Hidratação: ao ter um usuário autenticado (Supabase), carrega TODOS os dados
// das empresas dele e popula os stores. Roda no boot e reage a login/logout.
// ============================================================================
export default defineNuxtPlugin(async nuxtApp => {
  const user = useSupabaseUser()
  const app = useAppStore()
  const finance = useFinanceStore()
  const audit = useAuditStore()

  // Lidos aqui, no início do plugin: depois de um `await` o contexto do Nuxt
  // não está garantido (no servidor, composables falhariam).
  const rememberedCompany = useCookie<string | null>(COMPANY_COOKIE, { default: () => null })
  const router = useRouter()

  async function hydrate() {
    app.setHydrationState(true)
    try {
      const data = await loadAppData()
      if (data) {
        app.hydrate(data, rememberedCompany.value)
        finance.hydrate(data.finance)

        const path = router.currentRoute.value.path
        if (data.currentUser.roles.length === 0 && path !== '/sem-acesso') {
          await nuxtApp.runWithContext(() => navigateTo('/sem-acesso'))
        }
        else if (data.currentUser.roles.length > 0) {
          // Os dados (perfil/empresa) chegam depois da primeira navegação — ex.:
          // logo após o login. Reavalia a página aberta com o perfil já conhecido.
          const target = resolveRouteRedirect(path, app)
          if (target && target !== path)
            await nuxtApp.runWithContext(() => navigateTo(target))
        }
      }
      app.setHydrationState(false)
    }
    catch (e) {
      console.error('Falha ao carregar dados do Supabase:', e)
      app.setHydrationState(false, (e as Error).message || 'Não foi possível carregar os dados.')
    }
  }

  if (user.value)
    await hydrate()

  if (import.meta.client) {
    watch(user, async u => {
      if (u) {
        await hydrate()
      }
      else {
        app.reset()
        finance.reset()
        audit.reset()
      }
    })
  }
})
