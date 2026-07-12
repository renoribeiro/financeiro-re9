<script setup lang="ts">
import { useFinanceStore } from '@/stores/finance'
import { useAppStore } from '@/stores/app'
import type { Receivable } from '@/types/finance'

const finance = useFinanceStore()
const app = useAppStore()

useHead({ title: 'Contas a Receber' })

const search = ref('')
const statusFilter = ref('all')
const ruleFilter = ref<string | null>(null)

const filtered = computed(() => finance.companyReceivables.filter(r => {
  const text = `${r.description} ${r.clientName ?? ''}`.toLowerCase()
  const okSearch = !search.value || text.includes(search.value.toLowerCase())
  const okStatus = statusFilter.value === 'all' || r.status === statusFilter.value
  const okRule = !ruleFilter.value || r.invoiceRule === ruleFilter.value

  return okSearch && okStatus && okRule
}).sort((a, b) => a.dueDate.localeCompare(b.dueDate)))

const open = computed(() => finance.companyReceivables.filter(r => r.status === 'open'))
const overdue = computed(() => finance.companyReceivables.filter(r => r.status === 'overdue'))

// "Total cadastrado" desconsidera cancelados
const registered = computed(() => finance.companyReceivables.filter(r => r.status !== 'cancelled'))
const sum = (arr: Receivable[]) => arr.reduce((s, r) => s + r.amount, 0)

const receivedThisMonth = computed(() => {
  const ms = new Date()

  ms.setDate(1)
  ms.setHours(0, 0, 0, 0)

  return finance.companyReceivables.filter(r => r.status === 'received' && r.receivedAt && new Date(r.receivedAt) >= ms)
})

const headers = [
  { title: 'Descrição', key: 'description' },
  { title: 'Cliente', key: 'clientName' },
  { title: 'Vencimento', key: 'dueDate' },
  { title: 'Valor', key: 'amount', align: 'end' as const },
  { title: 'NFS-e', key: 'invoiceRule' },
  { title: 'Status', key: 'status' },
  { title: '', key: 'actions', sortable: false, align: 'end' as const },
]

const statusItems = [
  { title: 'Todos', value: 'all' },
  { title: 'Em aberto', value: 'open' },
  { title: 'Vencido', value: 'overdue' },
  { title: 'Recebido', value: 'received' },
  { title: 'Cancelado', value: 'cancelled' },
]

const ruleItems = Object.entries(invoiceRuleLabels).map(([value, title]) => ({ title, value }))
const categoryOptions = computed(() => finance.companyChartAccounts.filter(a => a.type === 'revenue' && a.parentId).map(a => ({ title: `${a.code} · ${a.name}`, value: a.id })))
const costCenterOptions = computed(() => finance.companyCostCenters.map(c => ({ title: c.name, value: c.id })))

const dialog = ref(false)
const formRef = ref()
const editing = ref<Partial<Receivable>>({})
function openNew() {
  editing.value = { invoiceRule: 'on_receive', recurrence: 'once', dueDate: todayISO(), status: 'open' }
  dialog.value = true
}
function openEdit(r: Receivable) {
  editing.value = structuredClone(toRaw(r))

  // "overdue" é status DERIVADO — não gravar de volta ao editar
  if (editing.value.status === 'overdue')
    editing.value.status = 'open'
  dialog.value = true
}
async function save() {
  const { valid } = await formRef.value.validate()
  if (!valid)
    return
  finance.saveReceivable(editing.value)
  dialog.value = false
}

const recvDialog = ref(false)
const recvTarget = ref<Receivable | null>(null)
const recvAmount = ref(0)
const recvProof = ref('')
function openReceive(r: Receivable) {
  recvTarget.value = r
  recvAmount.value = r.amount
  recvProof.value = ''
  recvDialog.value = true
}
function doReceive() {
  if (recvTarget.value)
    finance.receiveReceivable(recvTarget.value.id, { amount: recvAmount.value, proofUrl: recvProof.value || undefined })
  recvDialog.value = false
}

const cancelDialog = ref(false)
const cancelTarget = ref<Receivable | null>(null)
function askCancel(r: Receivable) {
  cancelTarget.value = r
  cancelDialog.value = true
}

const invoiceOf = (receivableId: string) => finance.companyInvoices.find(i => i.receivableId === receivableId)
</script>

<template>
  <div>
    <AppPageHeader
      title="Contas a Receber"
      subtitle="Recebíveis, regras de NFS-e e baixas"
      icon="ri-arrow-down-circle-line"
    >
      <template #actions>
        <VBtn
          v-if="!app.isReadOnly"
          prepend-icon="ri-add-line"
          @click="openNew"
        >
          Nova conta
        </VBtn>
      </template>
    </AppPageHeader>

    <VRow class="match-height mb-1">
      <VCol
        cols="12"
        sm="6"
        lg="3"
      >
        <KpiCard
          title="A receber (aberto)"
          :value="formatBRL(sum(open))"
          icon="ri-time-line"
          color="info"
          :subtitle="`${open.length} título(s)`"
        />
      </VCol>
      <VCol
        cols="12"
        sm="6"
        lg="3"
      >
        <KpiCard
          title="Inadimplência"
          :value="formatBRL(sum(overdue))"
          icon="ri-error-warning-line"
          color="error"
          :subtitle="`${overdue.length} vencido(s)`"
        />
      </VCol>
      <VCol
        cols="12"
        sm="6"
        lg="3"
      >
        <KpiCard
          title="Recebido no mês"
          :value="formatBRL(sum(receivedThisMonth))"
          icon="ri-checkbox-circle-line"
          color="success"
          :subtitle="`${receivedThisMonth.length} baixa(s)`"
        />
      </VCol>
      <VCol
        cols="12"
        sm="6"
        lg="3"
      >
        <KpiCard
          title="Total cadastrado"
          :value="formatBRL(sum(registered))"
          icon="ri-stack-line"
          color="primary"
          :subtitle="`${registered.length} lançamento(s)`"
        />
      </VCol>
    </VRow>

    <VCard>
      <VCardText class="d-flex flex-wrap gap-4 align-center">
        <VTextField
          v-model="search"
          aria-label="Buscar descrição ou cliente"
          placeholder="Buscar descrição/cliente"
          prepend-inner-icon="ri-search-line"
          density="compact"
          style="max-inline-size: 280px;"
          clearable
        />
        <VSelect
          v-model="statusFilter"
          :items="statusItems"
          density="compact"
          label="Status"
          style="max-inline-size: 180px;"
        />
        <VSelect
          v-model="ruleFilter"
          :items="ruleItems"
          density="compact"
          label="Regra NFS-e"
          style="max-inline-size: 200px;"
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
        <template #item.description="{ item }">
          <div class="py-2">
            <div class="font-weight-medium">
              {{ item.description }}
            </div>
            <div class="text-caption text-disabled">
              {{ finance.costCenterName(item.costCenterId) }}
              <template v-if="item.recurrence === 'monthly'">
                · recorrente
              </template>
            </div>
          </div>
        </template>
        <template #item.clientName="{ item }">
          <div>
            {{ item.clientName || '—' }}
            <div
              v-if="item.clientDocument"
              class="text-caption text-disabled"
            >
              {{ formatDocument(item.clientDocument) }}
            </div>
          </div>
        </template>
        <template #item.dueDate="{ item }">
          <div>
            {{ formatDate(item.dueDate) }}
            <div
              v-if="item.status === 'overdue'"
              class="text-caption text-error"
            >
              {{ Math.abs(daysUntil(item.dueDate)) }} dia(s) em atraso
            </div>
          </div>
        </template>
        <template #item.amount="{ item }">
          <span class="font-weight-medium">{{ formatBRL(item.amount) }}</span>
        </template>
        <template #item.invoiceRule="{ item }">
          <VChip
            size="small"
            label
            color="secondary"
          >
            {{ invoiceRuleLabels[item.invoiceRule] }}
          </VChip>
          <VIcon
            v-if="invoiceOf(item.id)"
            icon="ri-file-text-line"
            size="18"
            class="ms-1"
            color="success"
          >
            <VTooltip activator="parent">
              NFS-e gerada
            </VTooltip>
          </VIcon>
        </template>
        <template #item.status="{ item }">
          <StatusChip
            :value="item.status"
            :map="receivableStatusMeta"
          />
        </template>
        <template #item.actions="{ item }">
          <div class="d-flex justify-end">
            <IconBtn
              v-if="!app.isReadOnly && ['open', 'overdue'].includes(item.status)"
              color="success"
              @click="openReceive(item)"
            >
              <VIcon icon="ri-check-double-line" />
              <VTooltip activator="parent">
                Registrar recebimento
              </VTooltip>
            </IconBtn>
            <IconBtn
              v-if="!app.isReadOnly && item.status !== 'received'"
              aria-label="Editar lançamento"
              @click="openEdit(item)"
            >
              <VIcon icon="ri-pencil-line" />
              <VTooltip activator="parent">
                Editar
              </VTooltip>
            </IconBtn>
            <IconBtn
              v-if="!app.isReadOnly && ['open', 'overdue'].includes(item.status)"
              aria-label="Cancelar lançamento"
              @click="askCancel(item)"
            >
              <VIcon icon="ri-close-circle-line" />
              <VTooltip activator="parent">
                Cancelar
              </VTooltip>
            </IconBtn>
          </div>
        </template>
        <template #no-data>
          <div class="text-center py-8 text-disabled">
            Nenhuma conta encontrada
          </div>
        </template>
      </VDataTable>
    </VCard>

    <!-- Dialog cadastro -->
    <VDialog
      v-model="dialog"
      max-width="680"
      persistent
    >
      <VCard>
        <VCardItem>
          <VCardTitle>{{ editing.id ? 'Editar conta a receber' : 'Nova conta a receber' }}</VCardTitle>
        </VCardItem>
        <VCardText>
          <VForm
            ref="formRef"
            @submit.prevent="save"
          >
            <VRow>
              <VCol
                cols="12"
                md="6"
              >
                <VTextField
                  v-model="editing.clientName"
                  label="Cliente"
                  :rules="[requiredRule]"
                />
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VTextField
                  v-model="editing.clientDocument"
                  label="CPF/CNPJ do cliente"
                />
              </VCol>
              <VCol cols="12">
                <VTextField
                  v-model="editing.description"
                  label="Descrição"
                  :rules="[requiredRule]"
                />
              </VCol>
              <VCol
                cols="12"
                md="4"
              >
                <VTextField
                  v-model.number="editing.amount"
                  label="Valor (R$)"
                  type="number"
                  prefix="R$"
                  :rules="[requiredRule, positiveRule]"
                />
              </VCol>
              <VCol
                cols="12"
                md="4"
              >
                <VTextField
                  v-model="editing.dueDate"
                  label="Vencimento"
                  type="date"
                  :rules="[requiredRule]"
                />
              </VCol>
              <VCol
                cols="12"
                md="4"
              >
                <VTextField
                  v-model="editing.competenceDate"
                  label="Competência"
                  type="date"
                />
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VSelect
                  v-model="editing.categoryId"
                  label="Categoria"
                  :items="categoryOptions"
                  clearable
                />
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VSelect
                  v-model="editing.costCenterId"
                  label="Centro de custo"
                  :items="costCenterOptions"
                  clearable
                />
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VSelect
                  v-model="editing.invoiceRule"
                  label="Regra de emissão NFS-e"
                  :items="ruleItems"
                />
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VSelect
                  v-model="editing.recurrence"
                  label="Recorrência"
                  :items="[{ title: 'Única', value: 'once' }, { title: 'Mensal', value: 'monthly' }]"
                />
              </VCol>
              <VCol
                v-if="editing.invoiceRule === 'scheduled'"
                cols="12"
                md="6"
              >
                <VTextField
                  v-model="editing.invoiceScheduledDate"
                  label="Data de emissão agendada"
                  type="date"
                />
              </VCol>
              <VCol
                v-if="editing.invoiceRule === 'recurring'"
                cols="12"
                md="6"
              >
                <VTextField
                  v-model.number="editing.invoiceRecurrenceDay"
                  label="Dia do mês p/ emitir (1-28)"
                  type="number"
                />
              </VCol>
              <VCol cols="12">
                <VAlert
                  v-if="editing.invoiceRule === 'immediate'"
                  type="info"
                  variant="tonal"
                  density="compact"
                >
                  A NFS-e será emitida no ato do cadastro.
                </VAlert>
                <VAlert
                  v-else-if="editing.invoiceRule === 'on_receive'"
                  type="info"
                  variant="tonal"
                  density="compact"
                >
                  A NFS-e será emitida automaticamente quando a baixa for registrada.
                </VAlert>
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

    <!-- Dialog recebimento -->
    <VDialog
      v-model="recvDialog"
      max-width="460"
    >
      <VCard>
        <VCardItem>
          <VCardTitle>Registrar recebimento</VCardTitle>
        </VCardItem>
        <VCardText>
          <p class="mb-4">
            {{ recvTarget?.description }}
          </p>
          <VTextField
            v-model.number="recvAmount"
            label="Valor recebido"
            type="number"
            prefix="R$"
            class="mb-3"
          />
          <FileUpload
            v-model="recvProof"
            label="Comprovante do recebimento"
          />
          <VAlert
            v-if="recvTarget?.invoiceRule === 'on_receive'"
            type="info"
            variant="tonal"
            density="compact"
            class="mt-3"
          >
            Uma NFS-e será emitida automaticamente.
          </VAlert>
        </VCardText>
        <VCardText class="d-flex justify-end gap-3 pt-0">
          <VBtn
            variant="tonal"
            color="secondary"
            @click="recvDialog = false"
          >
            Cancelar
          </VBtn>
          <VBtn
            color="success"
            @click="doReceive"
          >
            Confirmar
          </VBtn>
        </VCardText>
      </VCard>
    </VDialog>

    <ConfirmDialog
      v-model="cancelDialog"
      title="Cancelar conta"
      :message="`Deseja cancelar '${cancelTarget?.description}'?`"
      confirm-text="Cancelar conta"
      confirm-color="error"
      @confirm="cancelTarget && finance.cancelReceivable(cancelTarget.id)"
    />
  </div>
</template>
