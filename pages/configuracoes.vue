<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import type { Company } from '@/types/finance'

const app = useAppStore()
const db = useDb()
const canManageStorage = computed(() => ['super_admin', 'admin'].includes(app.currentRole))

useHead({ title: 'Configurações' })

const route = useRoute()
const tab = ref(route.query.tab?.toString() || 'company')

const storage = ref({
  activeProvider: 'internal',
  googleConnected: false,
  googleConfigured: false,
  googleAccountEmail: null as string | null,
  connectedAt: null as string | null,
})

const storageLoading = ref(false)
const storageMessage = ref(route.query.storage === 'connected' ? 'Google Drive conectado e ativado com sucesso.' : '')
const storageError = ref(route.query.storageError?.toString() || '')

async function loadStorage() {
  storageLoading.value = true
  try {
    storage.value = await $fetch('/api/storage/settings', { query: { companyId: app.currentCompanyId } })
  }
  catch (error) {
    storageError.value = error instanceof Error ? error.message : 'Não foi possível carregar a configuração.'
  }
  finally {
    storageLoading.value = false
  }
}

async function setStorageProvider(activeProvider: 'internal' | 'google_drive') {
  storageLoading.value = true
  storageError.value = ''
  try {
    await $fetch('/api/storage/settings', { method: 'POST', body: { companyId: app.currentCompanyId, activeProvider } })
    storageMessage.value = activeProvider === 'internal' ? 'Armazenamento interno ativado.' : 'Google Drive ativado.'
    await loadStorage()
  }
  catch (error) {
    storageError.value = error instanceof Error ? error.message : 'Não foi possível alterar o provedor.'
  }
  finally {
    storageLoading.value = false
  }
}

function connectGoogleDrive() {
  window.location.assign(`/api/storage/google/connect?companyId=${encodeURIComponent(app.currentCompanyId)}`)
}

async function disconnectGoogleDrive() {
  storageLoading.value = true
  storageError.value = ''
  try {
    await $fetch('/api/storage/google/disconnect', { method: 'POST', body: { companyId: app.currentCompanyId } })
    storageMessage.value = 'Google Drive desconectado. O armazenamento interno voltou a ser usado.'
    await loadStorage()
  }
  catch (error) {
    storageError.value = error instanceof Error ? error.message : 'Não foi possível desconectar.'
  }
  finally {
    storageLoading.value = false
  }
}

// 👉 cópia local editável da empresa atual; re-sincroniza ao trocar de empresa
const form = ref<Company>(structuredClone(toRaw(app.currentCompany)))

watch(
  () => app.currentCompany.id,
  () => {
    form.value = structuredClone(toRaw(app.currentCompany))
    loadStorage()
  },
)

onMounted(loadStorage)

const taxRegimeOptions = computed(() =>
  Object.entries(taxRegimeLabels).map(([value, title]) => ({ title, value })),
)

const savingCompany = ref(false)
const companyMessage = ref('')
const companyError = ref('')

async function saveCompany() {
  savingCompany.value = true
  companyMessage.value = ''
  companyError.value = ''

  const patch = {
    name: form.value.name,
    tradeName: form.value.tradeName,
    cnpj: form.value.cnpj,
    creci: form.value.creci,
    city: form.value.city,
    state: form.value.state,
    taxRegime: form.value.taxRegime,
    stateRegistration: form.value.stateRegistration,
    municipalRegistration: form.value.municipalRegistration,
    mainCnae: form.value.mainCnae,
    cityIbge: form.value.cityIbge,
  }

  try {
    await db.saveCompany(app.currentCompany.id, {
      name: patch.name,
      trade_name: patch.tradeName,
      cnpj: patch.cnpj,
      creci: patch.creci,
      city: patch.city,
      state: patch.state,
      tax_regime: patch.taxRegime,
      state_registration: patch.stateRegistration,
      municipal_registration: patch.municipalRegistration,
      main_cnae: patch.mainCnae,
      city_ibge: patch.cityIbge,
    })
    app.updateCompany(app.currentCompany.id, patch)
    companyMessage.value = 'Dados da empresa salvos.'
  }
  catch (error) {
    companyError.value = error instanceof Error ? error.message : 'Não foi possível salvar os dados da empresa.'
  }
  finally {
    savingCompany.value = false
  }
}

const invoiceSaving = ref(false)
const invoiceMessage = ref('')
const invoiceError = ref('')

async function saveInvoiceConfig() {
  invoiceSaving.value = true
  invoiceMessage.value = ''
  invoiceError.value = ''

  const invoiceConfig = { ...form.value.invoiceConfig }
  try {
    await db.saveCompany(app.currentCompany.id, { invoice_config: invoiceConfig })
    app.updateCompany(app.currentCompany.id, { invoiceConfig })
    invoiceMessage.value = 'Configuração fiscal salva.'
  }
  catch (error) {
    invoiceError.value = error instanceof Error ? error.message : 'Não foi possível salvar a configuração fiscal.'
  }
  finally {
    invoiceSaving.value = false
  }
}

// 👉 Certificado A1
const certDays = computed(() => daysUntil(app.currentCompany.certificateExpiry))

const certMeta = computed(() => {
  if (!app.currentCompany.certificateExpiry)
    return { color: 'secondary', label: 'Validade não informada' }
  const days = certDays.value
  if (days <= 30)
    return { color: 'error', label: `Vence em ${days} dia(s)` }
  if (days <= 60)
    return { color: 'warning', label: `Vence em ${days} dia(s)` }

  return { color: 'success', label: `Válido por ${days} dia(s)` }
})

// 👉 Perfis & acesso — só usuários com vínculo na empresa atual (evita expor
// usuários de outros tenants nesta tela)
const userRows = computed(() =>
  app.users
    .filter(u => u.roles.some(r => r.companyId === app.currentCompanyId))
    .map(u => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      roles: u.roles.map(r => ({
        company: app.companyById(r.companyId)?.tradeName ?? r.companyId,
        label: roleLabels[r.role] ?? r.role,
      })),
    })),
)

const userHeaders = [
  { title: 'Usuário', key: 'fullName' },
  { title: 'E-mail', key: 'email' },
  { title: 'Perfis por empresa', key: 'roles', sortable: false },
]

const invite = ref({
  fullName: '',
  email: '',
  role: 'viewer',
})

const inviteLoading = ref(false)
const inviteMessage = ref('')
const inviteError = ref('')

const inviteRoles = computed(() => [
  ...(app.isSuperAdmin ? [{ title: 'Administrador', value: 'admin' }] : []),
  { title: 'Financeiro', value: 'financial' },
  { title: 'Corretor', value: 'broker' },
  { title: 'Contador', value: 'accountant' },
  { title: 'Visualizador', value: 'viewer' },
])

async function sendInvite() {
  inviteError.value = ''
  inviteMessage.value = ''
  inviteLoading.value = true
  try {
    await $fetch('/api/admin/invite', {
      method: 'POST',
      body: {
        companyId: app.currentCompanyId,
        ...invite.value,
      },
    })
    inviteMessage.value = `Convite enviado para ${invite.value.email}.`
    invite.value = { fullName: '', email: '', role: 'viewer' }
  }
  catch (error) {
    inviteError.value = (error as Error).message
  }
  finally {
    inviteLoading.value = false
  }
}
</script>

<template>
  <div>
    <AppPageHeader
      title="Configurações"
      :subtitle="`${app.currentCompany.tradeName} · dados cadastrais e fiscais`"
      icon="ri-settings-3-line"
    />

    <VCard>
      <VTabs
        v-model="tab"
        grow
      >
        <VTab value="company">
          <VIcon
            start
            icon="ri-building-line"
          /> Empresa
        </VTab>
        <VTab value="invoice">
          <VIcon
            start
            icon="ri-file-text-line"
          /> NFS-e
        </VTab>
        <VTab value="storage">
          <VIcon
            start
            icon="ri-hard-drive-3-line"
          /> Arquivos
        </VTab>
        <VTab value="access">
          <VIcon
            start
            icon="ri-team-line"
          /> Perfis &amp; Acesso
        </VTab>
      </VTabs>

      <VDivider />

      <VCardText>
        <VWindow v-model="tab">
          <!-- Aba: Empresa -->
          <VWindowItem value="company">
            <VForm @submit.prevent="saveCompany">
              <VAlert
                v-if="companyMessage || companyError"
                :type="companyError ? 'error' : 'success'"
                variant="tonal"
                class="mb-4"
                :text="companyError || companyMessage"
              />
              <VRow>
                <VCol
                  cols="12"
                  md="6"
                >
                  <VTextField
                    v-model="form.name"
                    label="Razão social"
                    :disabled="app.isReadOnly"
                  />
                </VCol>
                <VCol
                  cols="12"
                  md="4"
                >
                  <VTextField
                    v-model="form.stateRegistration"
                    label="Inscrição estadual"
                    :disabled="app.isReadOnly"
                  />
                </VCol>
                <VCol
                  cols="12"
                  md="4"
                >
                  <VTextField
                    v-model="form.municipalRegistration"
                    label="Inscrição municipal"
                    :disabled="app.isReadOnly"
                  />
                </VCol>
                <VCol
                  cols="12"
                  md="4"
                >
                  <VTextField
                    v-model="form.mainCnae"
                    label="CNAE principal"
                    :disabled="app.isReadOnly"
                  />
                </VCol>
                <VCol
                  cols="12"
                  md="6"
                >
                  <VTextField
                    v-model="form.tradeName"
                    label="Nome fantasia"
                    :disabled="app.isReadOnly"
                  />
                </VCol>
                <VCol
                  cols="12"
                  md="6"
                >
                  <VTextField
                    v-model="form.cnpj"
                    label="CNPJ"
                    :hint="`Formatado: ${formatDocument(form.cnpj)}`"
                    persistent-hint
                    :disabled="app.isReadOnly"
                  />
                </VCol>
                <VCol
                  v-if="app.isRealEstate"
                  cols="12"
                  md="6"
                >
                  <VTextField
                    v-model="form.creci"
                    label="CRECI"
                    :disabled="app.isReadOnly"
                  />
                </VCol>
                <VCol
                  cols="12"
                  md="6"
                >
                  <VTextField
                    v-model="form.city"
                    label="Cidade"
                    :disabled="app.isReadOnly"
                  />
                </VCol>
                <VCol
                  cols="12"
                  md="3"
                >
                  <VTextField
                    v-model="form.state"
                    label="UF"
                    :disabled="app.isReadOnly"
                  />
                </VCol>
                <VCol
                  cols="12"
                  md="3"
                >
                  <VTextField
                    v-model="form.cityIbge"
                    label="Código IBGE"
                    :disabled="app.isReadOnly"
                  />
                </VCol>
                <VCol
                  cols="12"
                  md="6"
                >
                  <VSelect
                    v-model="form.taxRegime"
                    label="Regime tributário"
                    :items="taxRegimeOptions"
                    :disabled="app.isReadOnly"
                  />
                </VCol>
              </VRow>
              <div class="d-flex justify-end mt-2">
                <VBtn
                  :disabled="app.isReadOnly"
                  :loading="savingCompany"
                  prepend-icon="ri-save-line"
                  @click="saveCompany"
                >
                  Salvar
                </VBtn>
              </div>
            </VForm>
          </VWindowItem>

          <!-- Aba: NFS-e -->
          <VWindowItem value="invoice">
            <VForm @submit.prevent="saveInvoiceConfig">
              <VAlert
                v-if="invoiceMessage || invoiceError"
                :type="invoiceError ? 'error' : 'success'"
                variant="tonal"
                class="mb-4"
                :text="invoiceError || invoiceMessage"
              />
              <VRow>
                <VCol
                  cols="12"
                  md="6"
                >
                  <VTextField
                    v-model="form.invoiceConfig.defaultCnae"
                    label="CNAE padrão"
                    :disabled="app.isReadOnly"
                  />
                </VCol>
                <VCol
                  cols="12"
                  md="6"
                >
                  <VTextField
                    v-model="form.invoiceConfig.defaultLc116Item"
                    label="Item LC 116 padrão"
                    :disabled="app.isReadOnly"
                  />
                </VCol>
                <VCol
                  cols="12"
                  md="6"
                >
                  <VTextField
                    v-model="form.invoiceConfig.defaultCtiss"
                    label="CTISS padrão"
                    :disabled="app.isReadOnly"
                  />
                </VCol>
                <VCol
                  cols="12"
                  md="6"
                >
                  <VTextField
                    v-model="form.invoiceConfig.rpsSeries"
                    label="Série do RPS"
                    :disabled="app.isReadOnly"
                  />
                </VCol>
                <VCol
                  cols="12"
                  md="6"
                >
                  <VSwitch
                    v-model="form.invoiceConfig.issRetidoDefault"
                    label="ISS retido por padrão"
                    :disabled="app.isReadOnly"
                  />
                </VCol>
                <VCol
                  cols="12"
                  md="6"
                >
                  <VTextField
                    v-model.number="form.invoiceConfig.defaultIssRate"
                    label="Alíquota ISS (%)"
                    type="number"
                    :disabled="app.isReadOnly"
                  />
                </VCol>
                <VCol cols="12">
                  <VTextarea
                    v-model="form.invoiceConfig.defaultServiceDescription"
                    label="Descrição padrão do serviço"
                    rows="2"
                    :disabled="app.isReadOnly"
                  />
                </VCol>
              </VRow>

              <div class="d-flex justify-end mt-2 mb-6">
                <VBtn
                  :disabled="app.isReadOnly"
                  :loading="invoiceSaving"
                  prepend-icon="ri-save-line"
                  @click="saveInvoiceConfig"
                >
                  Salvar
                </VBtn>
              </div>

              <VDivider class="mb-6" />

              <h6 class="text-h6 mb-3">
                Certificado digital A1
              </h6>
              <VCard
                variant="tonal"
                :color="certMeta.color"
              >
                <VCardText class="d-flex align-center gap-x-3">
                  <VAvatar
                    :color="certMeta.color"
                    variant="elevated"
                    size="40"
                  >
                    <VIcon icon="ri-shield-keyhole-line" />
                  </VAvatar>
                  <div>
                    <div class="font-weight-medium">
                      Validade: {{ app.currentCompany.certificateExpiry ? formatDate(app.currentCompany.certificateExpiry) : 'não informada' }}
                    </div>
                    <VChip
                      :color="certMeta.color"
                      size="small"
                      label
                      class="mt-1"
                    >
                      {{ certMeta.label }}
                    </VChip>
                  </div>
                </VCardText>
              </VCard>

              <VAlert
                class="mt-4"
                type="info"
                variant="tonal"
                text="O certificado A1 é configurado de forma segura nas variáveis do servidor; o arquivo e a senha não são enviados ao navegador."
              />
            </VForm>
          </VWindowItem>

          <!-- Aba: Armazenamento de arquivos -->
          <VWindowItem value="storage">
            <VAlert
              v-if="storageMessage || storageError"
              :type="storageError ? 'error' : 'success'"
              variant="tonal"
              class="mb-6"
              :text="storageError || storageMessage"
              closable
            />
            <VRow>
              <VCol
                cols="12"
                md="6"
              >
                <VCard
                  variant="outlined"
                  height="100%"
                  :color="storage.activeProvider === 'internal' ? 'primary' : undefined"
                >
                  <VCardTitle class="d-flex align-center gap-2">
                    <VIcon icon="ri-shield-check-line" />
                    Armazenamento interno
                  </VCardTitle>
                  <VCardText>
                    Bucket privado e persistente da aplicação. Os arquivos não ficam públicos e continuam disponíveis após redeploys.
                    <VChip
                      v-if="storage.activeProvider === 'internal'"
                      color="success"
                      size="small"
                      class="d-flex mt-4"
                    >
                      Ativo
                    </VChip>
                  </VCardText>
                  <VCardActions>
                    <VBtn
                      :disabled="!canManageStorage || storage.activeProvider === 'internal'"
                      :loading="storageLoading"
                      @click="setStorageProvider('internal')"
                    >
                      Usar armazenamento interno
                    </VBtn>
                  </VCardActions>
                </VCard>
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VCard
                  variant="outlined"
                  height="100%"
                  :color="storage.activeProvider === 'google_drive' ? 'primary' : undefined"
                >
                  <VCardTitle class="d-flex align-center gap-2">
                    <VIcon icon="ri-google-fill" />
                    Google Drive
                  </VCardTitle>
                  <VCardText>
                    Hospeda novos anexos em uma pasta privada “RE9 Finanças” da conta conectada.
                    <div
                      v-if="storage.googleConnected"
                      class="mt-4"
                    >
                      <div class="font-weight-medium">
                        {{ storage.googleAccountEmail }}
                      </div>
                      <div class="text-caption text-medium-emphasis">
                        Conectado em {{ storage.connectedAt ? formatDate(storage.connectedAt) : '—' }}
                      </div>
                    </div>
                    <VAlert
                      v-else-if="!storage.googleConfigured"
                      type="warning"
                      variant="tonal"
                      density="compact"
                      class="mt-4"
                      text="Configure as credenciais Google Drive nas variáveis de ambiente do servidor."
                    />
                    <VChip
                      v-if="storage.activeProvider === 'google_drive'"
                      color="success"
                      size="small"
                      class="d-flex mt-4"
                    >
                      Ativo
                    </VChip>
                  </VCardText>
                  <VCardActions class="flex-wrap">
                    <VBtn
                      v-if="!storage.googleConnected"
                      :disabled="!canManageStorage || !storage.googleConfigured"
                      prepend-icon="ri-link"
                      @click="connectGoogleDrive"
                    >
                      Conectar Google Drive
                    </VBtn>
                    <template v-else>
                      <VBtn
                        :disabled="!canManageStorage || storage.activeProvider === 'google_drive'"
                        :loading="storageLoading"
                        @click="setStorageProvider('google_drive')"
                      >
                        Usar Google Drive
                      </VBtn>
                      <VBtn
                        variant="text"
                        color="error"
                        :disabled="!canManageStorage"
                        :loading="storageLoading"
                        @click="disconnectGoogleDrive"
                      >
                        Desconectar
                      </VBtn>
                    </template>
                  </VCardActions>
                </VCard>
              </VCol>
            </VRow>
            <VAlert
              type="info"
              variant="tonal"
              class="mt-6"
              text="A alteração afeta apenas novos arquivos. Anexos existentes continuam acessíveis no provedor em que foram salvos. Limite: 10 MB por arquivo; formatos PDF, PNG e JPEG."
            />
            <div class="text-caption text-medium-emphasis mt-2">
              Para preservar o acesso, uma conta Google com anexos armazenados não pode ser desconectada; nesse caso, apenas ative o armazenamento interno.
            </div>
          </VWindowItem>

          <!-- Aba: Perfis & Acesso -->
          <VWindowItem value="access">
            <VCard
              v-if="app.currentRole === 'super_admin' || app.currentRole === 'admin'"
              variant="outlined"
              class="mb-6"
            >
              <VCardTitle>Convidar usuário</VCardTitle>
              <VCardText>
                <VAlert
                  v-if="inviteMessage || inviteError"
                  :type="inviteError ? 'error' : 'success'"
                  variant="tonal"
                  class="mb-4"
                  :text="inviteError || inviteMessage"
                />
                <VForm @submit.prevent="sendInvite">
                  <VRow>
                    <VCol
                      cols="12"
                      md="4"
                    >
                      <VTextField
                        v-model="invite.fullName"
                        label="Nome"
                        required
                      />
                    </VCol>
                    <VCol
                      cols="12"
                      md="4"
                    >
                      <VTextField
                        v-model="invite.email"
                        label="E-mail"
                        type="email"
                        required
                      />
                    </VCol>
                    <VCol
                      cols="12"
                      md="2"
                    >
                      <VSelect
                        v-model="invite.role"
                        :items="inviteRoles"
                        label="Perfil"
                      />
                    </VCol>
                    <VCol
                      cols="12"
                      md="2"
                    >
                      <VBtn
                        type="submit"
                        block
                        height="48"
                        :loading="inviteLoading"
                      >
                        Convidar
                      </VBtn>
                    </VCol>
                  </VRow>
                </VForm>
              </VCardText>
            </VCard>
            <VAlert
              type="info"
              variant="tonal"
              class="mb-4"
              text="Tabela informativa dos usuários e seus perfis por empresa."
            />
            <VDataTable
              :headers="userHeaders"
              :items="userRows"
              item-value="id"
              :items-per-page="10"
              class="text-no-wrap"
            >
              <template #item.roles="{ item }">
                <div class="d-flex flex-wrap gap-1 py-2">
                  <VChip
                    v-for="(r, i) in item.roles"
                    :key="i"
                    size="small"
                    label
                  >
                    {{ r.company }}: {{ r.label }}
                  </VChip>
                </div>
              </template>
            </VDataTable>
          </VWindowItem>
        </VWindow>
      </VCardText>
    </VCard>
  </div>
</template>
