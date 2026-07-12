import { defineStore } from 'pinia'
import { useAppStore } from './app'
import type { AuditEntry } from '@/types/finance'

// ============================================================================
// Log de auditoria (quem/o quê/quando/empresa). No mock vive em memória; ao
// ligar o backend, trocar `record` por INSERT em `audit_log` (ou trigger no
// Postgres). Escopado pela empresa atual, como todo o resto.
// ============================================================================

export const useAuditStore = defineStore('audit', {
  state: () => ({
    entries: [] as AuditEntry[],
  }),

  getters: {
    companyEntries(state): AuditEntry[] {
      const app = useAppStore()

      return state.entries
        .filter(e => e.companyId === app.currentCompanyId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },
  },

  actions: {
    record(action: string, entityType: string, description: string, entityId?: string) {
      const app = useAppStore()

      this.entries.unshift({
        id: uid('aud'),
        companyId: app.currentCompanyId,
        userId: app.currentUserId,
        userName: app.currentUser.fullName,
        action,
        entityType,
        entityId,
        description,
        createdAt: new Date().toISOString(),
      })
    },
  },
})
