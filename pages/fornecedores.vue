<script setup lang="ts">
import { useFinanceStore } from '@/stores/finance'
import { useAppStore } from '@/stores/app'
import type { Supplier } from '@/types/finance'

const finance = useFinanceStore()
const app = useAppStore()

useHead({ title: 'Fornecedores' })

const search = ref('')
const statusFilter = ref<'all' | 'active' | 'inactive'>('all')

const filtered = computed(() => {
  return finance.companySuppliers.filter(s => {
    const matchesSearch = !search.value
      || s.legalName.toLowerCase().includes(search.value.toLowerCase())
      || (s.tradeName ?? '').toLowerCase().includes(search.value.toLowerCase())
      || s.documentNumber.includes(search.value)

    const matchesStatus = statusFilter.value === 'all'
      || (statusFilter.value === 'active' && s.isActive)
      || (statusFilter.value === 'inactive' && !s.isActive)

    return matchesSearch && matchesStatus
  })
})

const headers = [
  { title: 'Fornecedor', key: 'legalName' },
  { title: 'Documento', key: 'documentNumber' },
  { title: 'Categoria', key: 'categoryId' },
  { title: 'Contato', key: 'contact', sortable: false },
  { title: 'Status', key: 'isActive' },
  { title: '', key: 'actions', sortable: false, align: 'end' as const },
]

// 👉 Dialog
const dialog = ref(false)
const formRef = ref()
const editing = ref<Partial<Supplier>>({})

const categoryOptions = computed(() =>
  finance.companyChartAccounts
    .filter(a => a.type === 'expense' && a.parentId)
    .map(a => ({ title: `${a.code} · ${a.name}`, value: a.id })),
)

function openNew() {
  editing.value = { documentType: 'cnpj', bankInfo: {}, isActive: true }
  dialog.value = true
}
function openEdit(s: Supplier) {
  editing.value = structuredClone(toRaw(s))

  // garante bankInfo para o v-model da chave PIX não lançar
  if (!editing.value.bankInfo)
    editing.value.bankInfo = {}
  dialog.value = true
}
async function save() {
  const { valid } = await formRef.value.validate()
  if (!valid)
    return
  finance.saveSupplier(editing.value)
  dialog.value = false
}

// 👉 Ativar/desativar
const confirm = ref(false)
const target = ref<Supplier | null>(null)
function askToggle(s: Supplier) {
  target.value = s
  confirm.value = true
}
function doToggle() {
  if (target.value)
    finance.toggleActive('suppliers', target.value.id)
}
</script>

<template>
  <div>
    <AppPageHeader
      title="Fornecedores"
      subtitle="Cadastro de fornecedores e prestadores"
      icon="ri-store-2-line"
    >
      <template #actions>
        <VBtn
          v-if="!app.isReadOnly"
          prepend-icon="ri-add-line"
          @click="openNew"
        >
          Novo fornecedor
        </VBtn>
      </template>
    </AppPageHeader>

    <VCard>
      <VCardText class="d-flex flex-wrap gap-4">
        <VTextField
          v-model="search"
          placeholder="Buscar por nome ou documento"
          prepend-inner-icon="ri-search-line"
          density="compact"
          style="max-inline-size: 320px;"
          clearable
        />
        <VSpacer />
        <VBtnToggle
          v-model="statusFilter"
          density="compact"
          color="primary"
          mandatory
          variant="outlined"
        >
          <VBtn value="all">
            Todos
          </VBtn>
          <VBtn value="active">
            Ativos
          </VBtn>
          <VBtn value="inactive">
            Inativos
          </VBtn>
        </VBtnToggle>
      </VCardText>

      <VDivider />

      <VDataTable
        :headers="headers"
        :items="filtered"
        :items-per-page="10"
        item-value="id"
        class="text-no-wrap"
      >
        <template #item.legalName="{ item }">
          <div class="py-2">
            <div class="font-weight-medium">
              {{ item.tradeName || item.legalName }}
            </div>
            <div
              v-if="item.tradeName"
              class="text-caption text-disabled"
            >
              {{ item.legalName }}
            </div>
          </div>
        </template>

        <template #item.documentNumber="{ item }">
          <div>
            <VChip
              size="x-small"
              label
              class="me-1"
            >
              {{ item.documentType.toUpperCase() }}
            </VChip>
            {{ formatDocument(item.documentNumber) }}
          </div>
        </template>

        <template #item.categoryId="{ item }">
          {{ finance.accountName(item.categoryId) }}
        </template>

        <template #item.contact="{ item }">
          <div class="text-body-2">
            <div v-if="item.email">
              <VIcon
                icon="ri-mail-line"
                size="14"
              /> {{ item.email }}
            </div>
            <div v-if="item.phone">
              <VIcon
                icon="ri-phone-line"
                size="14"
              /> {{ formatPhone(item.phone) }}
            </div>
            <span
              v-if="!item.email && !item.phone"
              class="text-disabled"
            >—</span>
          </div>
        </template>

        <template #item.isActive="{ item }">
          <VChip
            :color="item.isActive ? 'success' : 'secondary'"
            size="small"
            label
          >
            {{ item.isActive ? 'Ativo' : 'Inativo' }}
          </VChip>
        </template>

        <template #item.actions="{ item }">
          <div class="d-flex justify-end">
            <IconBtn
              v-if="!app.isReadOnly"
              aria-label="Editar fornecedor"
              @click="openEdit(item)"
            >
              <VIcon icon="ri-pencil-line" />
              <VTooltip activator="parent">
                Editar
              </VTooltip>
            </IconBtn>
            <IconBtn
              v-if="!app.isReadOnly"
              :aria-label="item.isActive ? 'Desativar fornecedor' : 'Ativar fornecedor'"
              @click="askToggle(item)"
            >
              <VIcon :icon="item.isActive ? 'ri-forbid-line' : 'ri-check-line'" />
              <VTooltip activator="parent">
                {{ item.isActive ? 'Desativar' : 'Ativar' }}
              </VTooltip>
            </IconBtn>
          </div>
        </template>

        <template #no-data>
          <div class="text-center py-8 text-disabled">
            Nenhum fornecedor encontrado
          </div>
        </template>
      </VDataTable>
    </VCard>

    <!-- Dialog de cadastro/edição -->
    <VDialog
      v-model="dialog"
      max-width="640"
      persistent
    >
      <VCard>
        <VCardItem>
          <VCardTitle>{{ editing.id ? 'Editar fornecedor' : 'Novo fornecedor' }}</VCardTitle>
        </VCardItem>
        <VCardText>
          <VForm
            ref="formRef"
            @submit.prevent="save"
          >
            <VRow>
              <VCol
                cols="12"
                md="4"
              >
                <VSelect
                  v-model="editing.documentType"
                  label="Tipo"
                  :items="[{ title: 'CNPJ', value: 'cnpj' }, { title: 'CPF', value: 'cpf' }]"
                />
              </VCol>
              <VCol
                cols="12"
                md="8"
              >
                <VTextField
                  v-model="editing.documentNumber"
                  label="Documento"
                  :rules="editing.id ? [requiredRule] : [requiredRule, documentRule]"
                />
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VTextField
                  v-model="editing.legalName"
                  label="Razão social / Nome"
                  :rules="[requiredRule]"
                />
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VTextField
                  v-model="editing.tradeName"
                  label="Nome fantasia"
                />
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VTextField
                  v-model="editing.email"
                  label="E-mail"
                />
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VTextField
                  v-model="editing.phone"
                  label="Telefone"
                />
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VSelect
                  v-model="editing.categoryId"
                  label="Categoria (plano de contas)"
                  :items="categoryOptions"
                  clearable
                />
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VTextField
                  v-model="editing.bankInfo!.pix"
                  label="Chave PIX"
                />
              </VCol>
              <VCol cols="12">
                <VTextarea
                  v-model="editing.notes"
                  label="Observações"
                  rows="2"
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
          <VBtn @click="save">
            Salvar
          </VBtn>
        </VCardText>
      </VCard>
    </VDialog>

    <ConfirmDialog
      v-model="confirm"
      :title="target?.isActive ? 'Desativar fornecedor' : 'Ativar fornecedor'"
      :message="`Deseja ${target?.isActive ? 'desativar' : 'ativar'} ${target?.tradeName || target?.legalName}?`"
      @confirm="doToggle"
    />
  </div>
</template>
