import { defineStore } from 'pinia'
import { useAppStore } from './app'
import { useFinanceStore } from './finance'

// ============================================================================
// Autenticação real via Supabase Auth. A sessão (cookie) é gerida pelo módulo
// @nuxtjs/supabase; aqui expomos apenas login/logout. O estado "autenticado"
// vem de `useSupabaseUser()` (usado no middleware e na hidratação).
// ============================================================================

export const useAuthStore = defineStore('auth', {
  actions: {
    async login(email: string, password: string) {
      const supabase = useSupabaseClient()
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (error)
        throw error
    },

    async register(email: string, password: string, fullName?: string) {
      const supabase = useSupabaseClient()
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName } },
      })
      if (error)
        throw error
    },

    async logout() {
      const supabase = useSupabaseClient()
      await supabase.auth.signOut()
      useAppStore().reset()
      useFinanceStore().reset()
      await navigateTo('/login')
    },
  },
})
