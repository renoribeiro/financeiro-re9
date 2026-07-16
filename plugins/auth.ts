import { useAppStore } from '@/stores/app'
import { useFinanceStore } from '@/stores/finance'

// ============================================================================
// Hidratação: ao ter um usuário autenticado (Supabase), carrega TODOS os dados
// das empresas dele e popula os stores. Roda no boot e reage a login/logout.
// ============================================================================
export default defineNuxtPlugin(async () => {
  const user = useSupabaseUser()
  const app = useAppStore()
  const finance = useFinanceStore()

  async function hydrate() {
    try {
      const data = await loadAppData()
      if (data) {
        app.hydrate(data)
        finance.hydrate(data.finance)
      }
    }
    catch (e) {
      console.error('Falha ao carregar dados do Supabase:', e)
    }
  }

  if (user.value)
    await hydrate()

  if (import.meta.client) {
    watch(user, async (u) => {
      if (u)
        await hydrate()
      else {
        app.reset()
        finance.reset()
      }
    })
  }
})
