<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import type { Company } from '@/types/finance'

const app = useAppStore()

useHead({ title: 'Configurações' })

const tab = ref('company')

// 👉 cópia local editável da empresa atual; re-sincroniza ao trocar de empresa
const form = ref<Company>(structuredClone(toRaw(app.currentCompany)))

watch(
  () => app.currentCompany.id,
  () => {
    form.value = structuredClone(toRaw(app.currentCompany))
  },
)

const taxRegimeOptions = computed(() =>
  Object.entries(taxRegimeLabels).map(([value, title]) => ({ title, value })),
)

function saveCompany() {
  app.updateCompany(app.currentCompany.id, {
    name: form.value.name,
    tradeName: form.value.tradeName,
    cnpj: form.value.cnpj,
    creci: form.value.creci,
    city: form.value.city,
    state: form.value.state,
    taxRegime: form.value.taxRegime,
  })
}

function saveInvoiceConfig() {
  app.updateCompany(app.currentCompany.id, {
    invoiceConfig: { ...form.value.invoiceConfig },
  })
}

// 👉 Certificado A1
const certDays = computed(() => daysUntil(app.currentCompany.certificateExpiry))

const certMeta = computed(() => {
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
                      Validade: {{ formatDate(app.currentCompany.certificateExpiry) }}
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

              <VFileInput
                class="mt-4"
                label="Substituir certificado (.pfx)"
                accept=".pfx"
                prepend-icon="ri-key-2-line"
                disabled
                hint="Funcionalidade simulada — upload de certificado será conectado ao backend."
                persistent-hint
              />
            </VForm>
          </VWindowItem>

          <!-- Aba: Perfis & Acesso -->
          <VWindowItem value="access">
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
