import { useAppStore } from '@/stores/app'
import { resolveRouteRedirect } from '@/utils/routeAccess'

// ============================================================================
// Guarda de rota por empresa/perfil. Complementa a ocultação cosmética do menu:
// impede acesso por URL direta a páginas fora do escopo do perfil/empresa atual.
// A autenticação é validada pelo middleware do Supabase; as regras ficam em
// `utils/routeAccess.ts` e complementam o RLS do banco.
// ============================================================================

export default defineNuxtRouteMiddleware(to => {
  const target = resolveRouteRedirect(to.path, useAppStore())
  if (target && target !== to.path)
    return navigateTo(target)
})
