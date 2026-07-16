import { defineStore } from 'pinia'
import type { Company, Role, UserProfile } from '@/types/finance'

// ============================================================================
// Contexto da aplicação: empresa atual (multi-tenant) e usuário/perfil logado.
// Populado a partir do Supabase pelo plugin de hidratação (após autenticação).
// ============================================================================

// Fallbacks seguros para o intervalo entre boot e hidratação (evita acessar
// `.type`/`.fullName` de undefined em getters durante o SSR/primeiro render).
const EMPTY_COMPANY: Company = {
  id: '', name: '', tradeName: '', type: 'real_estate', cnpj: '',
  taxRegime: 'simples_nacional', city: '', state: '', logoColor: 'primary',
  invoiceConfig: { defaultCnae: '', defaultIssRate: 0, defaultServiceDescription: '' },
}
const EMPTY_USER: UserProfile = { id: '', fullName: '', email: '', avatarColor: 'primary', roles: [] }

export const useAppStore = defineStore('app', {
  state: () => ({
    companies: [] as Company[],
    users: [] as UserProfile[],
    currentCompanyId: '' as string,
    currentUserId: '' as string,
  }),

  getters: {
    currentUser(state): UserProfile {
      return state.users.find(u => u.id === state.currentUserId) ?? state.users[0] ?? EMPTY_USER
    },
    currentCompany(state): Company {
      return state.companies.find(c => c.id === state.currentCompanyId) ?? state.companies[0] ?? EMPTY_COMPANY
    },
    availableCompanies(): Company[] {
      const ids = new Set(this.currentUser.roles.map(r => r.companyId))

      return this.companies.filter(c => ids.has(c.id))
    },
    currentRole(): Role {
      return this.currentUser.roles.find(r => r.companyId === this.currentCompanyId)?.role ?? 'viewer'
    },
    isSuperAdmin(): boolean {
      return this.currentRole === 'super_admin'
    },
    isBroker(): boolean {
      return this.currentRole === 'broker'
    },
    isReadOnly(): boolean {
      return this.currentRole === 'accountant' || this.currentRole === 'viewer'
    },
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
    /** Popula o contexto a partir dos dados carregados do Supabase. */
    hydrate(data: { companies: Company[]; currentUser: UserProfile }) {
      this.companies = data.companies
      this.users = [data.currentUser]
      this.currentUserId = data.currentUser.id

      const accessible = data.currentUser.roles.map(r => r.companyId)
      if (!accessible.includes(this.currentCompanyId))
        this.currentCompanyId = accessible[0] ?? data.companies[0]?.id ?? ''
    },

    reset() {
      this.companies = []
      this.users = []
      this.currentCompanyId = ''
      this.currentUserId = ''
    },

    setCompany(id: string) {
      // só permite trocar para empresas às quais o usuário tem acesso
      if (this.currentUser.roles.some(r => r.companyId === id))
        this.currentCompanyId = id
    },

    updateCompany(id: string, patch: Partial<Company>) {
      const c = this.companies.find(x => x.id === id)
      if (c)
        Object.assign(c, patch)
    },
  },
})
