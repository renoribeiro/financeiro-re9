import { useAuthStore } from '@/stores/auth'

// Restaura a sessão a partir do cookie no boot (server E client), para que o
// estado de autenticação seja idêntico nos dois lados e não haja mismatch de
// hidratação. O cookie é definido/limpo no login/logout (páginas).
export default defineNuxtPlugin(() => {
  const session = useCookie<string | null>('re9_session', { sameSite: 'lax' })
  if (session.value)
    useAuthStore().setUser(session.value)
})
