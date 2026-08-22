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

const actionLoadingId = ref('')
const actionMessage = ref('')
const actionError = ref('')

async function runInvoiceAction(inv: Invoice, action: () => Promise<unknown>, successMessage: string) {
  actionLoadingId.value = inv.id
  actionMessage.value = ''
  actionError.value = ''
  try {
    await action()
    if (inv.status === 'error')
      throw new Error(inv.errorMessage || 'A operação fiscal não foi concluída.')
    actionMessage.value = successMessage
  }
  catch (error) {
    actionError.value = error instanceof Error ? error.message : 'Não foi possível concluir a operação fiscal.'
  }
  finally {
    actionLoadingId.value = ''
  }
}

function issue(inv: Invoice) {
  return runInvoiceAction(inv, () => finance.issueInvoice(inv.id), 'Emissão fiscal processada.')
}
function retry(inv: Invoice) {
  return runInvoiceAction(inv, () => finance.retryInvoice(inv.id), 'Consulta fiscal processada.')
}

// 👉 Cancelar (confirmação)
const confirm = ref(false)
const target = ref<Invoice | null>(null)
function askCancel(inv: Invoice) {
  target.value = inv
  confirm.value = true
}
async function doCancel() {
  if (target.value) {
    const invoice = target.value

    confirm.value = false
    await runInvoiceAction(invoice, () => finance.cancelInvoice(invoice.id), 'NFS-e cancelada com sucesso.')
  }
}
</script>

<template>
  <div>
    <AppPageHeader
      title="Notas Fiscais (NFS-e)"
      subtitle="Emissão e acompanhamento de notas de serviço"
      icon="ri-file-text-line"
    />

    <VAlert
      v-if="actionMessage || actionError"
      :type="actionError ? 'error' : 'success'"
      variant="tonal"
      class="mb-3"
      :text="actionError || actionMessage"
      closable
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
      <template v-if="cert?.daysToExpire != null">
        Certificado válido por {{ cert.daysToExpire }} dia(s).
      </template>
    </VAlert>

    <!-- Integração indisponível (sem simulação fiscal) -->
    <VAlert
      v-else
      type="info"
      variant="tonal"
      density="comfortable"
      class="mb-3"
      icon="ri-information-line"
    >
      Emissão fiscal <strong>indisponível</strong>. Configure o certificado digital A1 e as variáveis da SEFIN
      no servidor. Nenhuma nota é simulada ou considerada emitida sem resposta da prefeitura.
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
              v-if="item.status === 'pending' && app.canManageFinance"
              :disabled="actionLoadingId === item.id"
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
              :disabled="actionLoadingId === item.id"
              @click="retry(item)"
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
              v-if="item.status === 'error' && app.canManageFinance"
              :disabled="actionLoadingId === item.id"
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
              v-if="item.status === 'issued' && app.canManageFinance"
              :disabled="actionLoadingId === item.id"
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
              rel="noopener noreferrer"
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
