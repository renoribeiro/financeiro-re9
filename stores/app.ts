import { defineStore } from 'pinia'
import { companies as seedCompanies, users as seedUsers } from '@/data/seed'
import type { Company, Role, UserProfile } from '@/types/finance'

// ============================================================================
// Contexto da aplicação: empresa atual (multi-tenant) e usuário/perfil logado.
// Simula o middleware de contexto + seletor de empresa do header.
// ============================================================================

export const useAppStore = defineStore('app', {
  state: () => ({
    companies: structuredClone(seedCompanies) as Company[],
    users: structuredClone(seedUsers) as UserProfile[],
    currentCompanyId: seedCompanies[0].id,
    currentUserId: seedUsers[0].id,
  }),

  getters: {
    currentUser(state): UserProfile {
      return state.users.find(u => u.id === state.currentUserId) ?? state.users[0]
    },

    currentCompany(state): Company {
      return state.companies.find(c => c.id === state.currentCompanyId) ?? state.companies[0]
    },

    /** Empresas que o usuário atual pode acessar. */
    availableCompanies(): Company[] {
      const ids = new Set(this.currentUser.roles.map(r => r.companyId))

      return this.companies.filter(c => ids.has(c.id))
    },

    /** Perfil do usuário atual na empresa atual. */
    currentRole(): Role {
      const link = this.currentUser.roles.find(r => r.companyId === this.currentCompanyId)

      return link?.role ?? 'viewer'
    },

    isSuperAdmin(): boolean {
      return this.currentRole === 'super_admin'
    },

    isBroker(): boolean {
      return this.currentRole === 'broker'
    },

    /** Somente leitura (contador/visualizador). */
    isReadOnly(): boolean {
      return this.currentRole === 'accountant' || this.currentRole === 'viewer'
    },

    /**
     * Pode gerenciar dados financeiros/comerciais sensíveis (empreendimentos,
     * baixa de comissões, repasses). Exclui somente-leitura E corretor — o
     * corretor só opera as próprias vendas/funil, nunca as regras da imobiliária.
     */
    canManageFinance(): boolean {
      return !this.isReadOnly && !this.isBroker
    },

    isRealEstate(): boolean {
      return this.currentCompany.type === 'real_estate'
    },

    isAgency(): boolean {
      return this.currentCompany.type === 'agency'
    },

    companyById: state => (id: string) =>
      state.companies.find(c => c.id === id),
  },

  actions: {
    setCompany(id: string) {
      // só permite trocar para empresas às quais o usuário tem acesso
      if (this.currentUser.roles.some(r => r.companyId === id))
        this.currentCompanyId = id
    },

    setUser(id: string) {
      const user = this.users.find(u => u.id === id)
      if (!user)
        return
      this.currentUserId = id

      // ao trocar de usuário, garante uma empresa acessível
      if (!user.roles.some(r => r.companyId === this.currentCompanyId))
        this.currentCompanyId = user.roles[0].companyId
    },

    updateCompany(id: string, patch: Partial<Company>) {
      const c = this.companies.find(x => x.id === id)
      if (c)
        Object.assign(c, patch)
    },
  },
})
