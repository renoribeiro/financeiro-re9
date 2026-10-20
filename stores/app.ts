import { defineStore } from 'pinia'
import type { Company, Role, UserProfile } from '@/types/finance'

// ============================================================================
// Contexto da aplicação: empresa atual (multi-tenant) e usuário/perfil logado.
// Populado a partir do Supabase pelo plugin de hidratação (após autenticação).
// ============================================================================

// Fallbacks seguros para o intervalo entre boot e hidratação (evita acessar
// `.type`/`.fullName` de undefined em getters durante o SSR/primeiro render).
const EMPTY_COMPANY: Company = {
  id: '',
  name: '',
  tradeName: '',
  type: 'real_estate',
  cnpj: '',
  taxRegime: 'simples_nacional',
  city: '',
  state: '',
  logoColor: 'primary',
  invoiceConfig: { defaultCnae: '', defaultIssRate: 0, defaultServiceDescription: '' },
}

const EMPTY_USER: UserProfile = { id: '', fullName: '', email: '', avatarColor: 'primary', roles: [] }

// Lembra a última empresa escolhida neste navegador (só o id; o acesso é sempre
// revalidado contra os vínculos do usuário antes de ser usado). Lido pelo plugin
// de hidratação e repassado a `hydrate`; gravado aqui ao trocar de empresa.
export const COMPANY_COOKIE = 're9_company'

function rememberCompany(id: string) {
  if (import.meta.client)
    document.cookie = `${COMPANY_COOKIE}=${encodeURIComponent(id)}; Max-Age=${60 * 60 * 24 * 365}; Path=/; SameSite=Lax`
}

export const useAppStore = defineStore('app', {
  state: () => ({
    companies: [] as Company[],
    users: [] as UserProfile[],
    currentCompanyId: '' as string,
    currentUserId: '' as string,
    isHydrating: false,
    dataError: '' as string,
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
    isAdmin(): boolean {
      return this.currentRole === 'super_admin' || this.currentRole === 'admin'
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
    hydrate(data: { companies: Company[]; users: UserProfile[]; currentUser: UserProfile }, rememberedCompanyId?: string | null) {
      this.companies = data.companies
      this.users = data.users.some(user => user.id === data.currentUser.id)
        ? data.users
        : [...data.users, data.currentUser]
      this.currentUserId = data.currentUser.id

      // Ordem estável (por nome) para a escolha inicial ser sempre a mesma no
      // servidor e no navegador, independentemente da ordem vinda do banco.
      const nameOf = (id: string) => data.companies.find(c => c.id === id)?.tradeName ?? ''

      const accessible = data.currentUser.roles.map(r => r.companyId)
        .sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'pt-BR'))

      if (!accessible.includes(this.currentCompanyId)) {
        // Reabre na última empresa escolhida (se o usuário ainda tiver acesso),
        // em vez de voltar sempre para a primeira após recarregar a página.
        this.currentCompanyId = (rememberedCompanyId && accessible.includes(rememberedCompanyId))
          ? rememberedCompanyId
          : accessible[0] ?? data.companies[0]?.id ?? ''
      }
    },

    reset() {
      this.companies = []
      this.users = []
      this.currentCompanyId = ''
      this.currentUserId = ''
      this.isHydrating = false
      this.dataError = ''
    },

    setCompany(id: string) {
      // só permite trocar para empresas às quais o usuário tem acesso
      if (this.currentUser.roles.some(r => r.companyId === id)) {
        this.currentCompanyId = id
        rememberCompany(id)
      }
    },

    updateCompany(id: string, patch: Partial<Company>) {
      const c = this.companies.find(x => x.id === id)
      if (c)
        Object.assign(c, patch)
    },

    setHydrationState(loading: boolean, error = '') {
      this.isHydrating = loading
      this.dataError = error
    },
  },
})
