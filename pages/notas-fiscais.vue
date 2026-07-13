<script setup lang="ts">
import { useFinanceStore } from '@/stores/finance'
import { useAppStore } from '@/stores/app'
import type { Invoice, InvoiceStatus } from '@/types/finance'

const finance = useFinanceStore()
const app = useAppStore()

useHead({ title: 'Notas Fiscais (NFS-e)' })

// Verifica se a emissão real (certificado A1 + SEFIN Fortaleza) está ativa.
onMounted(() => finance.loadNfseStatus())
const nfse = computed(() => finance.nfseStatus)
const cert = computed(() => nfse.value?.certificate)

const search = ref('')
const statusFilter = ref<'all' | InvoiceStatus>('all')

const filtered = computed(() => {
  return finance.companyInvoices.filter(inv => {
    const matchesSearch = !search.value
      || inv.takerName.toLowerCase().includes(search.value.toLowerCase())
      || inv.takerDocument.includes(search.value)
      || (inv.invoiceNumber ?? '').includes(search.value)

    const matchesStatus = statusFilter.value === 'all' || inv.status === statusFilter.value

    return matchesSearch && matchesStatus
  })
})

// 👉 KPIs
const issued = computed(() => finance.companyInvoices.filter(i => i.status === 'issued'))
const pending = computed(() => finance.companyInvoices.filter(i => i.status === 'pending'))
const withError = computed(() => finance.companyInvoices.filter(i => i.status === 'error'))
const totalIssued = computed(() => issued.value.reduce((acc, i) => acc + i.amount, 0))

const statusOptions = [
  { title: 'Todos', value: 'all' },
  { title: 'Pendente', value: 'pending' },
  { title: 'Processando', value: 'processing' },
  { title: 'Emitida', value: 'issued' },
  { title: 'Cancelada', value: 'cancelled' },
  { title: 'Com erro', value: 'error' },
]

// 👉 Download do XML autorizado (base64 → arquivo)
function downloadXml(inv: Invoice) {
  if (!inv.xmlBase64)
    return
  const bytes = atob(inv.xmlBase64)
  const buf = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++)
    buf[i] = bytes.charCodeAt(i)
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/xml' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `nfse-${inv.invoiceNumber ?? inv.rpsNumber ?? inv.id}.xml`
  a.click()
  URL.revokeObjectURL(url)
}

const headers = [
  { title: 'Número', key: 'invoiceNumber' },
  { title: 'Tomador', key: 'takerName' },
  { title: 'Descrição', key: 'serviceDescription', sortable: false },
  { title: 'Valor', key: 'amount', align: 'end' as const },
  { title: 'ISS', key: 'issRate', align: 'end' as const },
  { title: 'Status', key: 'status' },
  { title: 'Emissão', key: 'issuedAt' },
  { title: '', key: 'actions', sortable: false, align: 'end' as const },
]

// 👉 Dialog de detalhes (NFS-e emitida)
const detailDialog = ref(false)
const detail = ref<Invoice | null>(null)
function openDetail(inv: Invoice) {
  detail.value = structuredClone(toRaw(inv))
  detailDialog.value = true
}

// 👉 Emitir
function issue(inv: Invoice) {
  finance.issueInvoice(inv.id)
}
function retry(inv: Invoice) {
  finance.retryInvoice(inv.id)
}

// 👉 Cancelar (confirmação)
const confirm = ref(false)
const target = ref<Invoice | null>(null)
function askCancel(inv: Invoice) {
  target.value = inv
  confirm.value = true
}
function doCancel() {
  if (target.value)
    finance.cancelInvoice(target.value.id)
}
</script>

<template>
  <div>
    <AppPageHeader
      title="Notas Fiscais (NFS-e)"
      subtitle="Emissão e acompanhamento de notas de serviço"
      icon="ri-file-text-line"
    />

    <!-- Integração ativa (certificado A1 + SEFIN Fortaleza) -->
    <VAlert
      v-if="nfse?.configured"
      type="success"
      variant="tonal"
      density="comfortable"
      class="mb-3"
      icon="ri-shield-check-line"
    >
      Emissão real conectada à SEFIN Fortaleza
      <strong>({{ nfse.ambiente === 'producao' ? 'Produção' : 'Homologação' }})</strong>
      via {{ nfse.provider === 'nacional' ? 'NFS-e Nacional' : 'webservice GINFES' }}.
      <template v-if="cert?.subjectCN">
        Certificado: {{ cert.subjectCN }}<template v-if="cert.daysToExpire != null"> · vence em {{ cert.daysToExpire }} dia(s)</template>.
      </template>
    </VAlert>

    <!-- Certificado presente porém inválido -->
    <VAlert
      v-else-if="cert?.present && cert?.error"
      type="error"
      variant="tonal"
      density="comfortable"
      class="mb-3"
      icon="ri-error-warning-line"
    >
      Certificado A1 configurado, mas inválido: {{ cert.error }}
    </VAlert>

    <!-- Modo simulado (sem certificado) -->
    <VAlert
      v-else
      type="info"
      variant="tonal"
      density="comfortable"
      class="mb-3"
      icon="ri-information-line"
    >
      Emissão <strong>simulada</strong> — envie o certificado digital A1 e as variáveis da SEFIN no
      servidor para ativar a emissão real. Veja <code>docs/NFSE-FORTALEZA.md</code>.
    </VAlert>

    <!-- Aviso de validade do certificado -->
    <VAlert
      v-if="nfse?.configured && cert?.daysToExpire != null && cert.daysToExpire <= 30"
      type="warning"
      variant="tonal"
      density="comfortable"
      class="mb-6"
      icon="ri-calendar-close-line"
    >
      O certificado digital vence em {{ cert.daysToExpire }} dia(s). Renove-o para não interromper a emissão.
    </VAlert>
    <div
      v-else
      class="mb-6"
    />


    <VRow class="match-height mb-1">
      <VCol
        cols="12"
        sm="6"
        lg="3"
      >
        <KpiCard
          title="Emitidas"
          :value="String(issued.length)"
          icon="ri-checkbox-circle-line"
          color="success"
        />
      </VCol>
      <VCol
        cols="12"
        sm="6"
        lg="3"
      >
        <KpiCard
          title="Pendentes"
          :value="String(pending.length)"
          icon="ri-time-line"
          color="warning"
        />
      </VCol>
      <VCol
        cols="12"
        sm="6"
        lg="3"
      >
        <KpiCard
          title="Com erro"
          :value="String(withError.length)"
          icon="ri-error-warning-line"
          color="error"
        />
      </VCol>
      <VCol
        cols="12"
        sm="6"
        lg="3"
      >
        <KpiCard
          title="Valor total emitido"
          :value="formatBRL(totalIssued)"
          icon="ri-money-dollar-circle-line"
          color="primary"
        />
      </VCol>
    </VRow>

    <VCard class="mt-1">
      <VCardText class="d-flex flex-wrap gap-4 align-center">
        <VTextField
          v-model="search"
          placeholder="Buscar por tomador, documento ou número"
          prepend-inner-icon="ri-search-line"
          density="compact"
          style="max-inline-size: 360px;"
          clearable
        />
        <VSpacer />
        <VSelect
          v-model="statusFilter"
          :items="statusOptions"
          density="compact"
          label="Status"
          style="max-inline-size: 220px;"
        />
      </VCardText>

      <VDivider />

      <VDataTable
        :headers="headers"
        :items="filtered"
        :items-per-page="10"
        item-value="id"
        class="text-no-wrap"
      >
        <template #item.invoiceNumber="{ item }">
          <span class="font-weight-medium">{{ item.invoiceNumber || '—' }}</span>
        </template>

        <template #item.takerName="{ item }">
          <div class="py-2">
            <div class="font-weight-medium">
              {{ item.takerName }}
            </div>
            <div class="text-caption text-disabled">
              {{ formatDocument(item.takerDocument) }}
            </div>
          </div>
        </template>

        <template #item.serviceDescription="{ item }">
          <span class="text-body-2">{{ item.serviceDescription }}</span>
        </template>

        <template #item.amount="{ item }">
          {{ formatBRL(item.amount) }}
        </template>

        <template #item.issRate="{ item }">
          {{ formatPercent(item.issRate) }}
        </template>

        <template #item.status="{ item }">
          <div class="d-flex align-center gap-2">
            <StatusChip
              :value="item.status"
              :map="invoiceStatusMeta"
            />
            <VTooltip
              v-if="item.status === 'error' && item.errorMessage"
              location="top"
            >
              <template #activator="{ props }">
                <VIcon
                  v-bind="props"
                  icon="ri-error-warning-line"
                  color="error"
                  size="18"
                />
              </template>
              <span>{{ item.errorMessage }}</span>
            </VTooltip>
          </div>
        </template>

        <template #item.issuedAt="{ item }">
          {{ formatDate(item.issuedAt) }}
        </template>

        <template #item.actions="{ item }">
          <div class="d-flex justify-end">
            <IconBtn
              v-if="item.status === 'pending' && !app.isReadOnly"
              @click="issue(item)"
            >
              <VIcon icon="ri-send-plane-line" />
              <VTooltip
                activator="parent"
                location="top"
              >
                Emitir
              </VTooltip>
            </IconBtn>

            <VProgressCircular
              v-if="item.status === 'processing'"
              indeterminate
              size="18"
              width="2"
              color="info"
              class="mx-2"
            />
            <IconBtn
              v-if="item.status === 'processing'"
              @click="finance.consultInvoice(item.id)"
            >
              <VIcon icon="ri-refresh-line" />
              <VTooltip
                activator="parent"
                location="top"
              >
                Atualizar situação na SEFIN
              </VTooltip>
            </IconBtn>

            <IconBtn
              v-if="item.status === 'error' && !app.isReadOnly"
              @click="retry(item)"
            >
              <VIcon icon="ri-refresh-line" />
              <VTooltip
                activator="parent"
                location="top"
              >
                Reenviar
              </VTooltip>
            </IconBtn>

            <IconBtn
              v-if="item.status === 'issued'"
              @click="openDetail(item)"
            >
              <VIcon icon="ri-eye-line" />
              <VTooltip
                activator="parent"
                location="top"
              >
                Ver detalhes
              </VTooltip>
            </IconBtn>

            <IconBtn
              v-if="item.status === 'issued' && !app.isReadOnly"
              @click="askCancel(item)"
            >
              <VIcon icon="ri-close-circle-line" />
              <VTooltip
                activator="parent"
                location="top"
              >
                Cancelar
              </VTooltip>
            </IconBtn>
          </div>
        </template>

        <template #no-data>
          <div class="text-center py-8 text-disabled">
            Nenhuma nota fiscal encontrada
          </div>
        </template>
      </VDataTable>
    </VCard>

    <!-- Dialog de detalhes da NFS-e -->
    <VDialog
      v-model="detailDialog"
      max-width="560"
    >
      <VCard v-if="detail">
        <VCardItem>
          <VCardTitle>NFS-e {{ detail.invoiceNumber || '—' }}</VCardTitle>
          <VCardSubtitle>{{ detail.takerName }}</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <VList
            density="compact"
            lines="two"
          >
            <VListItem
              title="Número"
              :subtitle="detail.invoiceNumber || '—'"
            />
            <VListItem
              title="Série"
              :subtitle="detail.series || '—'"
            />
            <VListItem
              title="Código de verificação"
              :subtitle="detail.verificationCode || '—'"
            />
            <VListItem
              title="Tomador"
              :subtitle="`${detail.takerName} · ${formatDocument(detail.takerDocument)}`"
            />
            <VListItem
              title="Descrição do serviço"
              :subtitle="detail.serviceDescription"
            />
            <VListItem
              title="Valor"
              :subtitle="formatBRL(detail.amount)"
            />
            <VListItem
              title="ISS"
              :subtitle="formatPercent(detail.issRate)"
            />
            <VListItem
              title="Emissão"
              :subtitle="formatDateTime(detail.issuedAt)"
            />
            <VListItem
              v-if="detail.environment"
              title="Ambiente"
              :subtitle="detail.environment === 'producao' ? 'Produção' : 'Homologação'"
            />
            <VListItem
              v-if="detail.protocol"
              title="Protocolo"
              :subtitle="detail.protocol"
            />
          </VList>

          <VDivider class="my-3" />

          <div class="d-flex flex-wrap gap-3">
            <VBtn
              variant="tonal"
              color="error"
              prepend-icon="ri-external-link-line"
              :href="detail.publicUrl"
              target="_blank"
              rel="noopener"
              :disabled="!detail.publicUrl"
            >
              Consulta pública
            </VBtn>
            <VBtn
              variant="tonal"
              color="info"
              prepend-icon="ri-code-line"
              :disabled="!detail.xmlBase64"
              @click="downloadXml(detail)"
            >
              Baixar XML
            </VBtn>
          </div>
          <div
            v-if="!detail.xmlBase64 && !detail.publicUrl"
            class="text-caption text-disabled mt-2"
          >
            Downloads disponíveis para notas emitidas na SEFIN (modo real).
          </div>
        </VCardText>
        <VCardText class="d-flex justify-end pt-0">
          <VBtn
            variant="tonal"
            color="secondary"
            @click="detailDialog = false"
          >
            Fechar
          </VBtn>
        </VCardText>
      </VCard>
    </VDialog>

    <ConfirmDialog
      v-model="confirm"
      title="Cancelar NFS-e"
      :message="`Deseja cancelar a NFS-e ${target?.invoiceNumber || ''} de ${target?.takerName}?`"
      @confirm="doCancel"
    />
  </div>
</template>
