import { defineStore } from 'pinia'
import { useAppStore } from './app'
import { users as seedUsers } from '@/data/seed'

// ============================================================================
// Sessão de autenticação. No mock, valida o e-mail contra os usuários do seed
// (a senha é aceita como demo). A sessão é persistida em COOKIE (via useCookie
// no plugin/páginas) para que SSR e cliente concordem — evita mismatch de
// hidratação. Ao ligar o Supabase Auth, trocar por sessão real mantendo esta
// mesma interface (isAuthenticated / setUser / clear).
// ============================================================================

export const useAuthStore = defineStore('auth', {
  state: () => ({
    userId: null as string | null,
  }),

  getters: {
    isAuthenticated: state => !!state.userId,
  },

  actions: {
    /** Ativa a sessão de um usuário (usado no restore por cookie e no login). */
    setUser(id: string): boolean {
      if (!seedUsers.some(u => u.id === id))
        return false
      this.userId = id
      useAppStore().setUser(id)

      return true
    },

    /** Valida o e-mail (mock). Retorna o id do usuário ou null. */
    resolveByEmail(email: string): string | null {
      return seedUsers.find(u => u.email.toLowerCase() === email.trim().toLowerCase())?.id ?? null
    },

    clear() {
      this.userId = null
    },
  },
})
