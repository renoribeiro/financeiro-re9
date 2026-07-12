<script setup lang="ts">
import { useAuditStore } from '@/stores/audit'
import { useAppStore } from '@/stores/app'

const audit = useAuditStore()
const app = useAppStore()

useHead({ title: 'Auditoria' })

const search = ref('')
const typeFilter = ref<string | null>(null)

const actionMeta: Record<string, { label: string; color: string }> = {
  create: { label: 'Criação', color: 'info' },
  pay: { label: 'Pagamento', color: 'success' },
  receive: { label: 'Recebimento', color: 'success' },
  cancel: { label: 'Cancelamento', color: 'error' },
  emit_invoice: { label: 'Emissão NFS-e', color: 'primary' },
  cancel_invoice: { label: 'Cancelamento NFS-e', color: 'error' },
}

const entityLabels: Record<string, string> = {
  payable: 'Conta a pagar',
  receivable: 'Conta a receber',
  invoice: 'NFS-e',
  sale: 'Venda',
}

const typeOptions = computed(() =>
  [...new Set(audit.companyEntries.map(e => e.entityType))]
    .map(t => ({ title: entityLabels[t] ?? t, value: t })),
)

const filtered = computed(() =>
  audit.companyEntries.filter(e => {
    const okType = !typeFilter.value || e.entityType === typeFilter.value

    const okSearch = !search.value
      || `${e.description} ${e.userName}`.toLowerCase().includes(search.value.toLowerCase())

    return okType && okSearch
  }),
)

const headers = [
  { title: 'Quando', key: 'createdAt' },
  { title: 'Usuário', key: 'userName' },
  { title: 'Ação', key: 'action' },
  { title: 'Entidade', key: 'entityType' },
  { title: 'Descrição', key: 'description', sortable: false },
]
</script>

<template>
  <div>
    <AppPageHeader
      title="Auditoria"
      :subtitle="`Trilha de ações — ${app.currentCompany.tradeName}`"
      icon="ri-history-line"
    />

    <VCard>
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
          style="max-inline-size: 220px;"
          clearable
          hide-details
        />
      </VCardText>
      <VDivider />

      <VDataTable
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
            :color="actionMeta[item.action]?.color ?? 'secondary'"
          >
            {{ actionMeta[item.action]?.label ?? item.action }}
          </VChip>
        </template>
        <template #item.entityType="{ item }">
          {{ entityLabels[item.entityType] ?? item.entityType }}
        </template>
        <template #no-data>
          <div class="text-center py-8 text-disabled">
            Nenhuma ação registrada ainda. As operações financeiras aparecerão aqui.
          </div>
        </template>
      </VDataTable>
    </VCard>
  </div>
</template>
