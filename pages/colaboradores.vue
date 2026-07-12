<script setup lang="ts">
import { useFinanceStore } from '@/stores/finance'
import { useAppStore } from '@/stores/app'
import type { Employee } from '@/types/finance'

const finance = useFinanceStore()
const app = useAppStore()

useHead({ title: 'Colaboradores' })

const search = ref('')
const statusFilter = ref<'all' | 'active' | 'inactive'>('all')

const filtered = computed(() => {
  return finance.companyEmployees.filter(e => {
    const matchesSearch = !search.value
      || e.fullName.toLowerCase().includes(search.value.toLowerCase())
      || (e.email ?? '').toLowerCase().includes(search.value.toLowerCase())

    const matchesStatus = statusFilter.value === 'all'
      || (statusFilter.value === 'active' && e.status === 'active')
      || (statusFilter.value === 'inactive' && e.status !== 'active')

    return matchesSearch && matchesStatus
  })
})

// 👉 KPIs
const totalActive = computed(() =>
  finance.companyEmployees.filter(e => e.status === 'active').length,
)

const payrollClt = computed(() =>
  finance.companyEmployees
    .filter(e => e.status === 'active' && e.employmentType === 'clt')
    .reduce((sum, e) => sum + (e.baseSalary ?? 0), 0),
)

const payrollPj = computed(() =>
  finance.companyEmployees
    .filter(e => e.status === 'active' && e.employmentType === 'pj')
    .reduce((sum, e) => sum + (e.baseSalary ?? 0), 0),
)

const headers = [
  { title: 'Colaborador', key: 'fullName' },
  { title: 'CPF', key: 'cpf' },
  { title: 'Vínculo', key: 'employmentType' },
  { title: 'Salário / Valor', key: 'baseSalary' },
  { title: 'Status', key: 'status' },
  { title: '', key: 'actions', sortable: false, align: 'end' as const },
]

const employmentTypeOptions = Object.entries(employmentTypeLabels)
  .map(([value, title]) => ({ title, value }))

const statusOptions = [
  { title: 'Ativo', value: 'active' },
  { title: 'Inativo', value: 'inactive' },
  { title: 'Desligado', value: 'terminated' },
]

// 👉 Dialog
const dialog = ref(false)
const formRef = ref()
const editing = ref<Partial<Employee>>({})

const showSalary = computed(() =>
  editing.value.employmentType === 'clt' || editing.value.employmentType === 'pj',
)

function openNew() {
  editing.value = { employmentType: 'clt', status: 'active', bankInfo: {} }
  dialog.value = true
}
function openEdit(e: Employee) {
  editing.value = structuredClone(toRaw(e))
  if (!editing.value.bankInfo)
    editing.value.bankInfo = {}
  dialog.value = true
}
async function save() {
  const { valid } = await formRef.value.validate()
  if (!valid)
    return
  finance.saveEmployee(editing.value)
  dialog.value = false
}
</script>

<template>
  <div>
    <AppPageHeader
      title="Colaboradores"
      subtitle="Equipe, corretores e prestadores"
      icon="ri-team-line"
    >
      <template #actions>
        <VBtn
          v-if="!app.isReadOnly"
          prepend-icon="ri-add-line"
          @click="openNew"
        >
          Novo colaborador
        </VBtn>
      </template>
    </AppPageHeader>

    <VRow class="mb-2">
      <VCol
        cols="12"
        md="4"
      >
        <KpiCard
          title="Colaboradores ativos"
          :value="String(totalActive)"
          icon="ri-user-follow-line"
          color="success"
        />
      </VCol>
      <VCol
        cols="12"
        md="4"
      >
        <KpiCard
          title="Folha CLT (ativos)"
          :value="formatBRL(payrollClt)"
          icon="ri-bank-card-line"
          color="info"
        />
      </VCol>
      <VCol
        cols="12"
        md="4"
      >
        <KpiCard
          title="Folha PJ (ativos)"
          :value="formatBRL(payrollPj)"
          icon="ri-briefcase-line"
          color="warning"
        />
      </VCol>
    </VRow>

    <VCard>
      <VCardText class="d-flex flex-wrap gap-4">
        <VTextField
          v-model="search"
          placeholder="Buscar por nome ou e-mail"
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
        <template #item.fullName="{ item }">
          <div class="py-2">
            <div class="font-weight-medium">
              {{ item.fullName }}
            </div>
            <div
              v-if="item.email"
              class="text-caption text-disabled"
            >
              {{ item.email }}
            </div>
          </div>
        </template>

        <template #item.cpf="{ item }">
          {{ formatDocument(item.cpf) }}
        </template>

        <template #item.employmentType="{ item }">
          <VChip
            size="small"
            label
          >
            {{ employmentTypeLabels[item.employmentType] }}
          </VChip>
        </template>

        <template #item.baseSalary="{ item }">
          {{ item.baseSalary ? formatBRL(item.baseSalary) : '—' }}
        </template>

        <template #item.status="{ item }">
          <StatusChip
            :value="item.status"
            :map="employeeStatusMeta"
          />
        </template>

        <template #item.actions="{ item }">
          <div class="d-flex justify-end">
            <IconBtn
              v-if="!app.isReadOnly"
              aria-label="Editar colaborador"
              @click="openEdit(item)"
            >
              <VIcon icon="ri-pencil-line" />
              <VTooltip activator="parent">
                Editar
              </VTooltip>
            </IconBtn>
          </div>
        </template>

        <template #no-data>
          <div class="text-center py-8 text-disabled">
            Nenhum colaborador encontrado
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
          <VCardTitle>{{ editing.id ? 'Editar colaborador' : 'Novo colaborador' }}</VCardTitle>
        </VCardItem>
        <VCardText>
          <VForm
            ref="formRef"
            @submit.prevent="save"
          >
            <VRow>
              <VCol
                cols="12"
                md="8"
              >
                <VTextField
                  v-model="editing.fullName"
                  label="Nome completo"
                  :rules="[requiredRule]"
                />
              </VCol>
              <VCol
                cols="12"
                md="4"
              >
                <VTextField
                  v-model="editing.cpf"
                  label="CPF"
                  :rules="editing.id ? [requiredRule] : [requiredRule, cpfRule]"
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
                  v-model="editing.employmentType"
                  label="Vínculo"
                  :items="employmentTypeOptions"
                />
              </VCol>
              <VCol
                v-if="editing.employmentType === 'pj'"
                cols="12"
                md="6"
              >
                <VTextField
                  v-model="editing.pjCnpj"
                  label="CNPJ (PJ)"
                />
              </VCol>
              <VCol
                v-if="showSalary"
                cols="12"
                md="6"
              >
                <VTextField
                  v-model.number="editing.baseSalary"
                  label="Salário / Valor base"
                  type="number"
                  prefix="R$"
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
              <VCol
                cols="12"
                md="6"
              >
                <VTextField
                  v-model="editing.hireDate"
                  label="Data de admissão"
                  type="date"
                />
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VSelect
                  v-model="editing.status"
                  label="Status"
                  :items="statusOptions"
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
  </div>
</template>
