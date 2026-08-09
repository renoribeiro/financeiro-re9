<script setup lang="ts">
import { useAuditStore } from '@/stores/audit'
import { useAppStore } from '@/stores/app'
import { useFinanceStore } from '@/stores/finance'
import type { AuditEntry } from '@/types/finance'

const audit = useAuditStore()
const app = useAppStore()
const finance = useFinanceStore()
const loadingAudit = ref(false)
const auditError = ref('')
const successMessage = ref('')

async function loadHistory() {
  loadingAudit.value = true
  auditError.value = ''
  try {
    await audit.load()
  }
  catch (error) {
    auditError.value = (error as Error).message
  }
  finally {
    loadingAudit.value = false
  }
}

onMounted(loadHistory)
watch(() => app.currentCompanyId, loadHistory)

useHead({ title: 'Histórico' })

const search = ref('')
const typeFilter = ref<string | null>(null)

const actionMeta: Record<string, { label: string; color: string; icon: string }> = {
  insert: { label: 'Criação', color: 'info', icon: 'ri-add-circle-line' },
  create: { label: 'Criação', color: 'info', icon: 'ri-add-circle-line' },
  update: { label: 'Edição', color: 'warning', icon: 'ri-pencil-line' },
  delete: { label: 'Exclusão', color: 'error', icon: 'ri-delete-bin-line' },
  restore: { label: 'Restauração', color: 'primary', icon: 'ri-history-line' },
  pay: { label: 'Pagamento', color: 'success', icon: 'ri-bank-card-line' },
  receive: { label: 'Recebimento', color: 'success', icon: 'ri-hand-coin-line' },
  cancel: { label: 'Cancelamento', color: 'error', icon: 'ri-close-circle-line' },
  emit_invoice: { label: 'Emissão NFS-e', color: 'primary', icon: 'ri-file-text-line' },
  cancel_invoice: { label: 'Cancelamento NFS-e', color: 'error', icon: 'ri-file-close-line' },
}

const entityLabels: Record<string, string> = {
  chart_accounts: 'Plano de contas',
  cost_centers: 'Centro de custo',
  suppliers: 'Fornecedor',
  clients: 'Cliente',
  employees: 'Colaborador',
  developments: 'Empreendimento',
  sales: 'Venda',
  sale: 'Venda',
  commissions: 'Comissão',
  commission_installments: 'Parcela de comissão',
  commission_splits: 'Divisão de comissão',
  payables: 'Conta a pagar',
  payable: 'Conta a pagar',
  receivables: 'Conta a receber',
  receivable: 'Conta a receber',
  transactions: 'Transação',
  settlements: 'Baixa financeira',
  funnel_cards: 'Oportunidade do funil',
  funnel_history: 'Movimentação do funil',
  invoices: 'NFS-e',
  invoice: 'NFS-e',
  notification_rules: 'Regra de notificação',
  history: 'Histórico',
}

const typeOptions = computed(() =>
  [...new Set(audit.companyEntries.map(e => e.entityType))]
    .map(type => ({ title: entityLabels[type] ?? type, value: type })),
)

const filtered = computed(() =>
  audit.companyEntries.filter(entry => {
    const okType = !typeFilter.value || entry.entityType === typeFilter.value

    const okSearch = !search.value
      || `${entry.description} ${entry.userName}`.toLowerCase().includes(search.value.toLowerCase())

    return okType && okSearch
  }),
)

const headers = [
  { title: 'Data e hora', key: 'createdAt' },
  { title: 'Usuário', key: 'userName' },
  { title: 'Ação', key: 'action' },
  { title: 'Entidade', key: 'entityType' },
  { title: 'Descrição', key: 'description', sortable: false },
  { title: '', key: 'actions', sortable: false, align: 'end' as const },
]

const detailDialog = ref(false)
const selected = ref<AuditEntry | null>(null)

function openDetail(entry: AuditEntry) {
  selected.value = entry
  detailDialog.value = true
}

const restoreDialog = ref(false)
const restoreTarget = ref<AuditEntry | null>(null)
const restoreReason = ref('')
const restoring = ref(false)
const restoreError = ref('')

function askRestore(entry: AuditEntry) {
  restoreTarget.value = entry
  restoreReason.value = ''
  restoreError.value = ''
  detailDialog.value = false
  restoreDialog.value = true
}

async function confirmRestore() {
  if (!restoreTarget.value || !restoreReason.value.trim())
    return
  restoring.value = true
  restoreError.value = ''
  try {
    const affected = await audit.restoreTo(restoreTarget.value.id, restoreReason.value.trim())
    const data = await loadAppData()
    if (data) {
      app.hydrate(data)
      finance.hydrate(data.finance)
    }
    successMessage.value = `Restauração concluída: ${affected} registro(s) retornaram ao ponto selecionado.`
    restoreDialog.value = false
  }
  catch (error) {
    restoreError.value = (error as Error).message
  }
  finally {
    restoring.value = false
  }
}

const jsonText = (value?: Record<string, unknown>) => value ? JSON.stringify(value, null, 2) : 'Sem dados'
</script>

<template>
  <div>
    <AppPageHeader
      title="Histórico"
      :subtitle="`Todas as ações e pontos de restauração — ${app.currentCompany.tradeName}`"
      icon="ri-history-line"
    />

    <VAlert
      type="info"
      variant="tonal"
      class="mb-4"
      title="Histórico protegido"
      text="Cada alteração registra data, hora, usuário e os dados anteriores/novos. Administradores podem restaurar os dados operacionais ao estado imediatamente após uma ação selecionada."
    />
    <VAlert
      v-if="successMessage"
      type="success"
      variant="tonal"
      closable
      class="mb-4"
      :text="successMessage"
      @click:close="successMessage = ''"
    />

    <VCard>
      <VAlert
        v-if="auditError"
        type="error"
        variant="tonal"
        class="ma-4"
        :text="auditError"
      />
      <VCardText class="d-flex flex-wrap gap-4 align-center">
        <VTextField
          v-model="search"
          placeholder="Buscar por descrição ou usuário"
          prepend-inner-icon="ri-search-line"
          density="compact"
          style="max-inline-size: 320px;"
          clearable
          hide-details
        />
        <VSelect
          v-model="typeFilter"
          :items="typeOptions"
          label="Entidade"
          density="compact"
          style="max-inline-size: 240px;"
          clearable
          hide-details
        />
        <VSpacer />
        <VBtn
          variant="tonal"
          prepend-icon="ri-refresh-line"
          :loading="loadingAudit"
          @click="loadHistory"
        >
          Atualizar
        </VBtn>
      </VCardText>
      <VDivider />

      <VDataTable
        :loading="loadingAudit"
        :headers="headers"
        :items="filtered"
        :items-per-page="15"
        item-value="id"
        class="text-no-wrap"
      >
        <template #item.createdAt="{ item }">
          {{ formatDateTime(item.createdAt) }}
        </template>
        <template #item.action="{ item }">
          <VChip
            size="small"
            label
            :prepend-icon="actionMeta[item.action]?.icon"
            :color="actionMeta[item.action]?.color ?? 'secondary'"
          >
            {{ actionMeta[item.action]?.label ?? item.action }}
          </VChip>
        </template>
        <template #item.entityType="{ item }">
          {{ entityLabels[item.entityType] ?? item.entityType }}
        </template>
        <template #item.actions="{ item }">
          <div class="d-flex justify-end ga-1">
            <IconBtn
              aria-label="Ver alteração"
              @click="openDetail(item)"
            >
              <VIcon icon="ri-eye-line" />
              <VTooltip activator="parent">
                Ver dados
              </VTooltip>
            </IconBtn>
            <IconBtn
              v-if="app.isAdmin && /^\d+$/.test(item.id)"
              aria-label="Restaurar para este ponto"
              color="primary"
              @click="askRestore(item)"
            >
              <VIcon icon="ri-history-line" />
              <VTooltip activator="parent">
                Restaurar para este ponto
              </VTooltip>
            </IconBtn>
          </div>
        </template>
        <template #no-data>
          <div class="text-center py-8 text-disabled">
            Nenhuma ação registrada ainda.
          </div>
        </template>
      </VDataTable>
    </VCard>

    <VDialog
      v-model="detailDialog"
      max-width="900"
      scrollable
    >
      <VCard v-if="selected">
        <VCardItem>
          <VCardTitle>{{ selected.description }}</VCardTitle>
          <VCardSubtitle>{{ formatDateTime(selected.createdAt) }} · {{ selected.userName }}</VCardSubtitle>
        </VCardItem>
        <VDivider />
        <VCardText>
          <VRow>
            <VCol
              cols="12"
              md="6"
            >
              <div class="text-overline mb-2">
                Antes
              </div>
              <pre class="history-json">{{ jsonText(selected.oldData) }}</pre>
            </VCol>
            <VCol
              cols="12"
              md="6"
            >
              <div class="text-overline mb-2">
                Depois
              </div>
              <pre class="history-json">{{ jsonText(selected.newData) }}</pre>
            </VCol>
          </VRow>
        </VCardText>
        <VDivider />
        <VCardText class="d-flex justify-end gap-3">
          <VBtn
            variant="tonal"
            color="secondary"
            @click="detailDialog = false"
          >
            Fechar
          </VBtn>
          <VBtn
            v-if="app.isAdmin && /^\d+$/.test(selected.id)"
            prepend-icon="ri-history-line"
            @click="askRestore(selected)"
          >
            Restaurar para este ponto
          </VBtn>
        </VCardText>
      </VCard>
    </VDialog>

    <VDialog
      v-model="restoreDialog"
      max-width="600"
      persistent
    >
      <VCard>
        <VCardItem>
          <VCardTitle>Restaurar histórico</VCardTitle>
          <VCardSubtitle v-if="restoreTarget">
            Estado imediatamente após {{ formatDateTime(restoreTarget.createdAt) }}
          </VCardSubtitle>
        </VCardItem>
        <VCardText>
          <VAlert
            type="warning"
            variant="tonal"
            class="mb-4"
            title="Confirme o ponto escolhido"
            text="Todas as alterações operacionais posteriores serão revertidas em uma única transação. A própria restauração ficará registrada e poderá ser desfeita por uma restauração futura."
          />
          <VAlert
            v-if="restoreError"
            type="error"
            variant="tonal"
            density="compact"
            class="mb-4"
            :text="restoreError"
          />
          <VTextarea
            v-model="restoreReason"
            label="Motivo da restauração"
            placeholder="Ex.: cadastro incorreto realizado por engano"
            rows="3"
            :rules="[requiredRule]"
          />
        </VCardText>
        <VCardText class="d-flex justify-end gap-3 pt-0">
          <VBtn
            variant="tonal"
            color="secondary"
            :disabled="restoring"
            @click="restoreDialog = false"
          >
            Cancelar
          </VBtn>
          <VBtn
            color="warning"
            prepend-icon="ri-history-line"
            :loading="restoring"
            :disabled="!restoreReason.trim()"
            @click="confirmRestore"
          >
            Restaurar dados
          </VBtn>
        </VCardText>
      </VCard>
    </VDialog>
  </div>
</template>

<style scoped>
.history-json {
  overflow: auto;
  padding: 12px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.03);
  font-size: 0.75rem;
  max-block-size: 420px;
  white-space: pre-wrap;
}
</style>
