<script setup lang="ts">
import { useFinanceStore } from '@/stores/finance'
import { useAppStore } from '@/stores/app'
import type { Client } from '@/types/finance'

const finance = useFinanceStore()
const app = useAppStore()

useHead({ title: 'Clientes' })

const search = ref('')

const filtered = computed(() => finance.companyClients.filter(c =>
  !search.value
  || c.name.toLowerCase().includes(search.value.toLowerCase())
  || (c.document ?? '').includes(search.value)
  || (c.email ?? '').toLowerCase().includes(search.value.toLowerCase()),
))

const headers = [
  { title: 'Nome', key: 'name' },
  { title: 'Documento', key: 'document' },
  { title: 'E-mail', key: 'email' },
  { title: 'Telefone', key: 'phone' },
  { title: 'Cidade', key: 'city' },
]

const dialog = ref(false)
const formRef = ref()
const loading = ref(false)
const errorMsg = ref<string | null>(null)
const form = ref<Partial<Client>>({})

function openNew() {
  form.value = {}
  errorMsg.value = null
  dialog.value = true
}

async function save() {
  const { valid } = await formRef.value.validate()
  if (!valid)
    return
  loading.value = true
  errorMsg.value = null
  try {
    await finance.saveClient(form.value)
    dialog.value = false
  }
  catch (e) {
    errorMsg.value = (e as Error).message || 'Falha ao salvar.'
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <AppPageHeader
      title="Clientes"
      subtitle="Cadastro de clientes / tomadores"
      icon="ri-user-3-line"
    >
      <template #actions>
        <VBtn
          v-if="app.canManageFinance"
          prepend-icon="ri-add-line"
          @click="openNew"
        >
          Novo cliente
        </VBtn>
      </template>
    </AppPageHeader>

    <VCard>
      <VCardText>
        <VTextField
          v-model="search"
          placeholder="Buscar por nome, documento ou e-mail"
          prepend-inner-icon="ri-search-line"
          density="compact"
          style="max-inline-size: 360px;"
          clearable
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
        <template #item.name="{ item }">
          <span class="font-weight-medium">{{ item.name }}</span>
        </template>
        <template #item.document="{ item }">
          {{ item.document ? formatDocument(item.document) : '—' }}
        </template>
        <template #item.email="{ item }">
          {{ item.email || '—' }}
        </template>
        <template #item.phone="{ item }">
          {{ item.phone ? formatPhone(item.phone) : '—' }}
        </template>
        <template #item.city="{ item }">
          {{ item.city || '—' }}
        </template>
        <template #no-data>
          <div class="text-center py-8 text-disabled">
            Nenhum cliente cadastrado
          </div>
        </template>
      </VDataTable>
    </VCard>

    <VDialog
      v-model="dialog"
      max-width="560"
      persistent
    >
      <VCard>
        <VCardItem>
          <VCardTitle>Novo cliente</VCardTitle>
        </VCardItem>
        <VCardText>
          <VForm
            ref="formRef"
            @submit.prevent="save"
          >
            <VAlert
              v-if="errorMsg"
              type="error"
              variant="tonal"
              density="compact"
              class="mb-4"
              :text="errorMsg"
            />
            <VRow>
              <VCol cols="12">
                <VTextField
                  v-model="form.name"
                  label="Nome / Razão social"
                  :rules="[requiredRule]"
                />
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VTextField
                  v-model="form.document"
                  label="CPF / CNPJ"
                />
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VTextField
                  v-model="form.phone"
                  label="Telefone"
                />
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VTextField
                  v-model="form.email"
                  label="E-mail"
                  type="email"
                />
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VTextField
                  v-model="form.city"
                  label="Cidade"
                />
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
        <VCardText class="d-flex justify-end gap-3 pt-0">
          <VBtn
            variant="tonal"
            color="secondary"
            @click="dialog = false"
          >
            Cancelar
          </VBtn>
          <VBtn
            :loading="loading"
            @click="save"
          >
            Salvar
          </VBtn>
        </VCardText>
      </VCard>
    </VDialog>
  </div>
</template>
