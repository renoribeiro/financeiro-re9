<script setup lang="ts">
import { useFinanceStore } from '@/stores/finance'

// Botão "+" global (cabeçalho) com atalhos de criação, salvando no Supabase.
const finance = useFinanceStore()

type QuickType = 'payable' | 'receivable' | 'supplier' | 'employee' | 'client'

const options: { type: QuickType; label: string; icon: string }[] = [
  { type: 'payable', label: 'Nova conta a pagar', icon: 'ri-arrow-up-circle-line' },
  { type: 'receivable', label: 'Nova conta a receber', icon: 'ri-arrow-down-circle-line' },
  { type: 'supplier', label: 'Novo fornecedor', icon: 'ri-store-2-line' },
  { type: 'employee', label: 'Novo colaborador', icon: 'ri-team-line' },
  { type: 'client', label: 'Novo cliente', icon: 'ri-user-3-line' },
]

const dialog = ref(false)
const type = ref<QuickType>('payable')
const formRef = ref()
const loading = ref(false)
const snackbar = ref(false)
const snackText = ref('')
const errorMsg = ref<string | null>(null)

const form = ref<Record<string, any>>({})

const titles: Record<QuickType, string> = {
  payable: 'Nova conta a pagar',
  receivable: 'Nova conta a receber',
  supplier: 'Novo fornecedor',
  employee: 'Novo colaborador',
  client: 'Novo cliente',
}

function open(t: QuickType) {
  type.value = t
  errorMsg.value = null
  form.value = t === 'payable' || t === 'receivable'
    ? { dueDate: todayISO(), amount: undefined }
    : {}
  dialog.value = true
}

// Opções de selects
const expenseAccounts = computed(() => finance.companyChartAccounts.filter(a => a.type === 'expense' && a.parentId).map(a => ({ title: `${a.code} · ${a.name}`, value: a.id })))
const revenueAccounts = computed(() => finance.companyChartAccounts.filter(a => a.type === 'revenue' && a.parentId).map(a => ({ title: `${a.code} · ${a.name}`, value: a.id })))
const costCenters = computed(() => finance.companyCostCenters.map(c => ({ title: c.name, value: c.id })))
const suppliers = computed(() => finance.companySuppliers.filter(s => s.isActive !== false).map(s => ({ title: s.tradeName || s.legalName, value: s.id })))
const clients = computed(() => finance.companyClients.map(c => ({ title: c.name, value: c.name })))

const employmentTypes = [
  { title: 'CLT', value: 'clt' },
  { title: 'PJ', value: 'pj' },
  { title: 'Comissionado', value: 'commission_only' },
  { title: 'Estágio', value: 'intern' },
]

async function save() {
  const { valid } = await formRef.value.validate()
  if (!valid)
    return
  loading.value = true
  errorMsg.value = null
  try {
    const i = form.value
    if (type.value === 'payable') {
      await finance.savePayable({ ...i, status: 'open', recurrence: 'once' })
    }
    else if (type.value === 'receivable') {
      await finance.saveReceivable({
        ...i,
        invoiceRule: 'on_receive',
        recurrence: 'once',
      })
    }
    else if (type.value === 'supplier') {
      await finance.saveSupplier({
        ...i,
        documentNumber: i.document,
        documentType: String(i.document ?? '').replace(/\D/g, '').length === 11 ? 'cpf' : 'cnpj',
        bankInfo: {},
        isActive: true,
      })
    }
    else if (type.value === 'employee') {
      await finance.saveEmployee({
        ...i,
        cpf: i.document ?? '',
        baseSalary: i.salary,
        bankInfo: {},
        status: 'active',
      })
    }
    else if (type.value === 'client') {
      await finance.saveClient(i)
    }

    snackText.value = `${titles[type.value]} salvo com sucesso.`
    snackbar.value = true
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
    <VBtn
      icon
      color="primary"
      variant="tonal"
      size="small"
      aria-label="Adicionar rápido"
    >
      <VIcon icon="ri-add-line" />
      <VTooltip
        activator="parent"
        location="bottom"
      >
        Adicionar
      </VTooltip>
      <VMenu
        activator="parent"
        location="bottom end"
        offset="10"
      >
        <VList
          width="240"
          density="comfortable"
        >
          <VListSubheader>Adicionar</VListSubheader>
          <VListItem
            v-for="o in options"
            :key="o.type"
            @click="open(o.type)"
          >
            <template #prepend>
              <VIcon
                :icon="o.icon"
                class="me-2"
              />
            </template>
            <VListItemTitle>{{ o.label }}</VListItemTitle>
          </VListItem>
        </VList>
      </VMenu>
    </VBtn>

    <!-- Dialog de criação -->
    <VDialog
      v-model="dialog"
      max-width="560"
      persistent
    >
      <VCard>
        <VCardItem>
          <VCardTitle>{{ titles[type] }}</VCardTitle>
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
              <!-- CONTA A PAGAR -->
              <template v-if="type === 'payable'">
                <VCol cols="12">
                  <VTextField
                    v-model="form.description"
                    label="Descrição"
                    :rules="[requiredRule]"
                  />
                </VCol>
                <VCol
                  cols="12"
                  md="6"
                >
                  <VTextField
                    v-model.number="form.amount"
                    label="Valor"
                    type="number"
                    prefix="R$"
                    :rules="[requiredRule, positiveRule]"
                  />
                </VCol>
                <VCol
                  cols="12"
                  md="6"
                >
                  <VTextField
                    v-model="form.dueDate"
                    label="Vencimento"
                    type="date"
                    :rules="[requiredRule]"
                  />
                </VCol>
                <VCol
                  cols="12"
                  md="6"
                >
                  <VSelect
                    v-model="form.categoryId"
                    label="Categoria"
                    :items="expenseAccounts"
                    clearable
                  />
                </VCol>
                <VCol
                  cols="12"
                  md="6"
                >
                  <VSelect
                    v-model="form.costCenterId"
                    label="Centro de custo"
                    :items="costCenters"
                    clearable
                  />
                </VCol>
                <VCol cols="12">
                  <VSelect
                    v-model="form.supplierId"
                    label="Fornecedor (opcional)"
                    :items="suppliers"
                    clearable
                  />
                </VCol>
              </template>

              <!-- CONTA A RECEBER -->
              <template v-else-if="type === 'receivable'">
                <VCol cols="12">
                  <VTextField
                    v-model="form.description"
                    label="Descrição"
                    :rules="[requiredRule]"
                  />
                </VCol>
                <VCol
                  cols="12"
                  md="6"
                >
                  <VTextField
                    v-model.number="form.amount"
                    label="Valor"
                    type="number"
                    prefix="R$"
                    :rules="[requiredRule, positiveRule]"
                  />
                </VCol>
                <VCol
                  cols="12"
                  md="6"
                >
                  <VTextField
                    v-model="form.dueDate"
                    label="Vencimento"
                    type="date"
                    :rules="[requiredRule]"
                  />
                </VCol>
                <VCol
                  cols="12"
                  md="6"
                >
                  <VCombobox
                    v-model="form.clientName"
                    label="Cliente"
                    :items="clients"
                    item-title="title"
                    item-value="value"
                    :return-object="false"
                  />
                </VCol>
                <VCol
                  cols="12"
                  md="6"
                >
                  <VSelect
                    v-model="form.categoryId"
                    label="Categoria"
                    :items="revenueAccounts"
                    clearable
                  />
                </VCol>
              </template>

              <!-- FORNECEDOR -->
              <template v-else-if="type === 'supplier'">
                <VCol cols="12">
                  <VTextField
                    v-model="form.legalName"
                    label="Razão social / Nome"
                    :rules="[requiredRule]"
                  />
                </VCol>
                <VCol
                  cols="12"
                  md="6"
                >
                  <VTextField
                    v-model="form.tradeName"
                    label="Nome fantasia"
                  />
                </VCol>
                <VCol
                  cols="12"
                  md="6"
                >
                  <VTextField
                    v-model="form.document"
                    label="CNPJ / CPF"
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
                    v-model="form.phone"
                    label="Telefone"
                  />
                </VCol>
              </template>

              <!-- COLABORADOR -->
              <template v-else-if="type === 'employee'">
                <VCol cols="12">
                  <VTextField
                    v-model="form.fullName"
                    label="Nome completo"
                    :rules="[requiredRule]"
                  />
                </VCol>
                <VCol
                  cols="12"
                  md="6"
                >
                  <VSelect
                    v-model="form.employmentType"
                    label="Vínculo"
                    :items="employmentTypes"
                  />
                </VCol>
                <VCol
                  cols="12"
                  md="6"
                >
                  <VTextField
                    v-model.number="form.salary"
                    label="Salário / valor"
                    type="number"
                    prefix="R$"
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
                    v-model="form.phone"
                    label="Telefone"
                  />
                </VCol>
              </template>

              <!-- CLIENTE -->
              <template v-else>
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
              </template>
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

    <VSnackbar
      v-model="snackbar"
      :timeout="3000"
      location="top end"
      color="success"
    >
      {{ snackText }}
    </VSnackbar>
  </div>
</template>
