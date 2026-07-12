import { useAuthStore } from '@/stores/auth'

// ============================================================================
// Proteção de rota: usuários não autenticados só acessam login/register.
// Roda em SSR e cliente (a sessão vem do cookie restaurado no plugin auth),
// então não há mismatch de hidratação.
// ============================================================================

const publicPages = new Set(['/login', '/register'])

export default defineNuxtRouteMiddleware(to => {
  const auth = useAuthStore()

  if (!auth.isAuthenticated && !publicPages.has(to.path))
    return navigateTo('/login')

  if (auth.isAuthenticated && publicPages.has(to.path))
    return navigateTo('/dashboard')
})
