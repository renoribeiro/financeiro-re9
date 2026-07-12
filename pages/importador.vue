<script setup lang="ts">
import { useFinanceStore } from '@/stores/finance'
import { useAppStore } from '@/stores/app'

const finance = useFinanceStore()
const app = useAppStore()

useHead({ title: 'Importador inteligente' })

const step = ref(1)

// ---- Definição de campos por módulo ----------------------------------------
interface FieldDef { value: string; title: string; required?: boolean; type?: 'text' | 'number' | 'date' | 'document' | 'cpf' }

const moduleFields: Record<string, FieldDef[]> = {
  suppliers: [
    { value: 'legalName', title: 'Razão social / Nome', required: true },
    { value: 'tradeName', title: 'Nome fantasia' },
    { value: 'documentNumber', title: 'Documento (CPF/CNPJ)', required: true, type: 'document' },
    { value: 'email', title: 'E-mail' },
    { value: 'phone', title: 'Telefone' },
    { value: 'pix', title: 'Chave PIX' },
  ],
  employees: [
    { value: 'fullName', title: 'Nome completo', required: true },
    { value: 'cpf', title: 'CPF', required: true, type: 'cpf' },
    { value: 'email', title: 'E-mail' },
    { value: 'phone', title: 'Telefone' },
    { value: 'baseSalary', title: 'Salário base', type: 'number' },
  ],
  payables: [
    { value: 'description', title: 'Descrição', required: true },
    { value: 'amount', title: 'Valor', required: true, type: 'number' },
    { value: 'dueDate', title: 'Vencimento', required: true, type: 'date' },
    { value: 'supplierName', title: 'Fornecedor (nome)' },
  ],
  receivables: [
    { value: 'description', title: 'Descrição', required: true },
    { value: 'clientName', title: 'Cliente' },
    { value: 'amount', title: 'Valor', required: true, type: 'number' },
    { value: 'dueDate', title: 'Vencimento', required: true, type: 'date' },
  ],
  sales: [
    { value: 'developmentName', title: 'Empreendimento (nome)' },
    { value: 'buyerName', title: 'Comprador', required: true },
    { value: 'saleValue', title: 'Valor da venda', required: true, type: 'number' },
    { value: 'brokerName', title: 'Corretor (nome)' },
    { value: 'saleDate', title: 'Data da venda', required: true, type: 'date' },
  ],
}

const moduleOptions = [
  { title: 'Fornecedores', value: 'suppliers' },
  { title: 'Colaboradores', value: 'employees' },
  { title: 'Contas a pagar', value: 'payables' },
  { title: 'Contas a receber', value: 'receivables' },
  { title: 'Vendas', value: 'sales' },
]

const targetModule = ref('suppliers')
const fieldOptions = computed(() => [{ title: '— Ignorar —', value: '' }, ...moduleFields[targetModule.value]])
const moduleLabel = computed(() => moduleOptions.find(m => m.value === targetModule.value)?.title ?? '')

// ---- Estado do arquivo / parsing -------------------------------------------
const file = ref<File | File[] | null>(null)
const headers = ref<string[]>([])
const rows = ref<string[][]>([])
const parseError = ref<string | null>(null)

/** Parser CSV mínimo com suporte a aspas e detecção de delimitador (; ou ,). */
function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const firstLine = clean.slice(0, !clean.includes('\n') ? clean.length : clean.indexOf('\n'))
  const delim = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ','
  const out: string[][] = []
  let field = ''
  let record: string[] = []
  let inQuotes = false

  const pushField = () => {
    record.push(field)
    field = ''
  }

  const pushRecord = () => {
    record.push(field)
    out.push(record)
    record = []
    field = ''
  }

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]
    if (inQuotes) {
      if (c === '"' && clean[i + 1] === '"') {
        field += '"'
        i++
      }
      else if (c === '"') {
        inQuotes = false
      }
      else {
        field += c
      }
    }
    else if (c === '"') {
      inQuotes = true
    }
    else if (c === delim) {
      pushField()
    }
    else if (c === '\n') {
      pushRecord()
    }
    else {
      field += c
    }
  }
  if (field.length || record.length)
    pushRecord()
  const nonEmpty = out.filter(r => r.some(c => c.trim() !== ''))
  const hdr = (nonEmpty.shift() ?? []).map(h => h.trim())

  return { headers: hdr, rows: nonEmpty }
}

// mapeamento coluna(index) -> campo do sistema
const mapping = ref<{ column: string; index: number; field: string }[]>([])

/**
 * Auto-mapeia por similaridade do nome da coluna com os campos (o passo que
 *  a Claude API fará de forma inteligente quando conectada — ver docs).
 */
function autoMap() {
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036F]/g, '').replace(/[^a-z0-9]/g, '')
  const fields = moduleFields[targetModule.value]

  const synonyms: Record<string, string[]> = {
    legalName: ['razaosocial', 'nome', 'razao', 'fornecedor', 'name'],
    tradeName: ['nomefantasia', 'fantasia'],
    documentNumber: ['documento', 'cnpj', 'cpf', 'cpfcnpj', 'doc'],
    cpf: ['cpf', 'documento'],
    fullName: ['nome', 'nomecompleto', 'colaborador', 'name'],
    email: ['email', 'mail'],
    phone: ['telefone', 'fone', 'celular', 'whatsapp'],
    pix: ['pix', 'chavepix'],
    baseSalary: ['salario', 'salariobase', 'valor'],
    description: ['descricao', 'historico', 'descr'],
    amount: ['valor', 'total', 'montante'],
    saleValue: ['valor', 'vgv', 'valordavenda'],
    dueDate: ['vencimento', 'datavencimento', 'data'],
    saleDate: ['data', 'datavenda'],
    clientName: ['cliente', 'tomador'],
    supplierName: ['fornecedor'],
    developmentName: ['empreendimento', 'imovel'],
    brokerName: ['corretor'],
    buyerName: ['comprador', 'cliente'],
  }

  mapping.value = headers.value.map((h, index) => {
    const nh = norm(h)
    const match = fields.find(f => norm(f.title) === nh || (synonyms[f.value] ?? []).some(s => nh.includes(s)))

    return { column: h, index, field: match?.value ?? '' }
  })
}

function onFileChange() {
  parseError.value = null
  headers.value = []
  rows.value = []

  const f = Array.isArray(file.value) ? file.value[0] : file.value
  if (!f)
    return
  const reader = new FileReader()

  reader.onload = () => {
    try {
      const parsed = parseCSV(String(reader.result ?? ''))
      if (!parsed.headers.length)
        throw new Error('Arquivo vazio ou sem cabeçalho.')
      headers.value = parsed.headers
      rows.value = parsed.rows
    }
    catch (e) {
      parseError.value = (e as Error).message
    }
  }
  reader.onerror = () => {
    parseError.value = 'Falha ao ler o arquivo.'
  }
  reader.readAsText(f, 'utf-8')
}

watch(step, () => {
  if (step.value === 2)
    autoMap()
})
watch(targetModule, () => {
  if (step.value === 2)
    autoMap()
})

// ---- Validação --------------------------------------------------------------
interface RowResult { data: Record<string, string>; errors: string[] }

const validated = computed<RowResult[]>(() => {
  const fields = moduleFields[targetModule.value]
  const active = mapping.value.filter(m => m.field)

  return rows.value.map(r => {
    const data: Record<string, string> = {}

    active.forEach(mp => {
      data[mp.field] = (r[mp.index] ?? '').trim()
    })

    const errors: string[] = []

    fields.forEach(f => {
      const v = data[f.value] ?? ''
      if (f.required && !v) {
        errors.push(`${f.title} obrigatório`)

        return
      }
      if (!v)
        return
      if (f.type === 'document' && documentRule(v) !== true)
        errors.push(`${f.title} inválido`)
      if (f.type === 'cpf' && !isValidCPF(v))
        errors.push(`${f.title} inválido`)
      if (f.type === 'number' && Number.isNaN(Number(v.replace(/\./g, '').replace(',', '.'))))
        errors.push(`${f.title} não numérico`)
      if (f.type === 'date' && Number.isNaN(new Date(v).getTime()))
        errors.push(`${f.title} data inválida`)
    })

    return { data, errors }
  })
})

const validRows = computed(() => validated.value.filter(r => !r.errors.length))
const errorRows = computed(() => validated.value.filter(r => r.errors.length))

const parseNumber = (v: string) => Number(String(v).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0

const parseDateISO = (v: string) => {
  const d = new Date(v)

  return Number.isNaN(d.getTime()) ? todayISO() : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ---- Importação -------------------------------------------------------------
const imported = ref(0)

function resolveByName(list: { id: string; name?: string; fullName?: string; legalName?: string; tradeName?: string }[], name?: string) {
  if (!name)
    return undefined
  const n = name.toLowerCase()

  return list.find(x => [x.name, x.fullName, x.legalName, x.tradeName].some(v => v?.toLowerCase() === n))?.id
}

type RowData = Record<string, string>

const importers: Record<string, (d: RowData) => void> = {
  suppliers: d => finance.saveSupplier({ legalName: d.legalName, tradeName: d.tradeName, documentNumber: (d.documentNumber ?? '').replace(/\D/g, ''), documentType: (d.documentNumber ?? '').replace(/\D/g, '').length === 11 ? 'cpf' : 'cnpj', email: d.email, phone: d.phone, bankInfo: d.pix ? { pix: d.pix } : {} }),
  employees: d => finance.saveEmployee({ fullName: d.fullName, cpf: (d.cpf ?? '').replace(/\D/g, ''), email: d.email, phone: d.phone, baseSalary: d.baseSalary ? parseNumber(d.baseSalary) : undefined, employmentType: 'clt' }),
  payables: d => finance.savePayable({ description: d.description, amount: parseNumber(d.amount), dueDate: parseDateISO(d.dueDate), supplierId: resolveByName(finance.companySuppliers, d.supplierName), recurrence: 'once' }),
  receivables: d => finance.saveReceivable({ description: d.description, clientName: d.clientName, amount: parseNumber(d.amount), dueDate: parseDateISO(d.dueDate), invoiceRule: 'on_receive', recurrence: 'once' }),
  sales: d => finance.saveSale({ buyerName: d.buyerName, saleValue: parseNumber(d.saleValue), saleDate: parseDateISO(d.saleDate), developmentId: resolveByName(finance.companyDevelopments, d.developmentName) ?? '', brokerId: resolveByName(finance.companyEmployees, d.brokerName) ?? '' }, false),
}

function doImport() {
  const run = importers[targetModule.value]
  let count = 0
  if (run) {
    for (const { data } of validRows.value) {
      run(data)
      count++
    }
  }
  imported.value = count
}

const items = [
  { title: 'Upload', value: 1 },
  { title: 'Mapeamento', value: 2 },
  { title: 'Validação', value: 3 },
  { title: 'Resultado', value: 4 },
]

function next() {
  if (step.value === 3)
    doImport()
  if (step.value < 4)
    step.value++
}
function prev() {
  if (step.value > 1)
    step.value--
}

const canAdvance = computed(() => {
  if (app.isReadOnly)
    return false
  if (step.value === 1)
    return headers.value.length > 0
  if (step.value === 3)
    return validRows.value.length > 0

  return true
})
</script>

<template>
  <div>
    <AppPageHeader
      title="Importador inteligente"
      subtitle="Migração assistida de dados de outros sistemas (CSV)"
      icon="ri-magic-line"
    />

    <VAlert
      type="info"
      variant="tonal"
      class="mb-6"
      icon="ri-robot-2-line"
    >
      Parsing, validação e importação reais para o app (em memória). O auto-mapeamento é heurístico;
      ao conectar a Claude API ele passa a sugerir o mapeamento de forma inteligente (ver docs/MELHORIAS).
    </VAlert>

    <VCard>
      <VStepper
        v-model="step"
        :items="items"
        flat
      >
        <!-- Passo 1 -->
        <template #item.1>
          <VCardText>
            <h6 class="text-h6 mb-4">
              1. Selecione o arquivo CSV e o módulo de destino
            </h6>
            <VRow>
              <VCol
                cols="12"
                md="7"
              >
                <VFileInput
                  v-model="file"
                  label="Arquivo .csv"
                  accept=".csv,text/csv"
                  prepend-icon="ri-file-excel-2-line"
                  show-size
                  clearable
                  @update:model-value="onFileChange"
                />
              </VCol>
              <VCol
                cols="12"
                md="5"
              >
                <VSelect
                  v-model="targetModule"
                  label="Módulo de destino"
                  :items="moduleOptions"
                />
              </VCol>
            </VRow>
            <VAlert
              v-if="parseError"
              type="error"
              variant="tonal"
              density="compact"
              :text="parseError"
            />
            <VAlert
              v-else-if="headers.length"
              type="success"
              variant="tonal"
              density="compact"
              :text="`${headers.length} coluna(s) e ${rows.length} registro(s) detectado(s).`"
            />
          </VCardText>
        </template>

        <!-- Passo 2 -->
        <template #item.2>
          <VCardText>
            <h6 class="text-h6 mb-4">
              2. Mapeamento de colunas — {{ moduleLabel }}
            </h6>
            <VTable density="comfortable">
              <thead>
                <tr>
                  <th>Coluna do arquivo</th>
                  <th style="inline-size: 48px;" />
                  <th>Campo do sistema</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(row, i) in mapping"
                  :key="i"
                >
                  <td class="font-weight-medium">
                    {{ row.column }}
                  </td>
                  <td class="text-center text-disabled">
                    <VIcon icon="ri-arrow-right-line" />
                  </td>
                  <td>
                    <VSelect
                      v-model="row.field"
                      :items="fieldOptions"
                      density="compact"
                      hide-details
                    />
                  </td>
                </tr>
              </tbody>
            </VTable>
          </VCardText>
        </template>

        <!-- Passo 3 -->
        <template #item.3>
          <VCardText>
            <h6 class="text-h6 mb-4">
              3. Validação dos registros
            </h6>
            <VRow class="mb-2">
              <VCol
                cols="12"
                md="6"
              >
                <VAlert
                  type="success"
                  variant="tonal"
                  :text="`${validRows.length} registro(s) válido(s) prontos para importar.`"
                />
              </VCol>
              <VCol
                cols="12"
                md="6"
              >
                <VAlert
                  :type="errorRows.length ? 'error' : 'info'"
                  variant="tonal"
                  :text="`${errorRows.length} registro(s) com erro serão ignorados.`"
                />
              </VCol>
            </VRow>
            <VTable
              v-if="errorRows.length"
              density="compact"
            >
              <thead>
                <tr><th>#</th><th>Erros</th></tr>
              </thead>
              <tbody>
                <tr
                  v-for="(r, i) in errorRows.slice(0, 20)"
                  :key="i"
                >
                  <td>{{ i + 1 }}</td>
                  <td class="text-error">
                    {{ r.errors.join(' · ') }}
                  </td>
                </tr>
              </tbody>
            </VTable>
          </VCardText>
        </template>

        <template #actions />

        <!-- Passo 4 -->
        <template #item.4>
          <VCardText>
            <h6 class="text-h6 mb-4">
              4. Importação concluída
            </h6>
            <VAlert
              type="success"
              variant="tonal"
              icon="ri-checkbox-circle-line"
              :text="`${imported} registro(s) importado(s) para ${moduleLabel}. ${errorRows.length} ignorado(s) por erro.`"
            />
          </VCardText>
        </template>
      </VStepper>

      <VDivider />

      <VCardText class="d-flex justify-space-between">
        <VBtn
          variant="tonal"
          color="secondary"
          :disabled="step === 1"
          prepend-icon="ri-arrow-left-line"
          @click="prev"
        >
          Voltar
        </VBtn>
        <VBtn
          v-if="step < 4"
          append-icon="ri-arrow-right-line"
          :disabled="!canAdvance"
          @click="next"
        >
          {{ step === 3 ? 'Importar' : 'Avançar' }}
        </VBtn>
        <VBtn
          v-else
          color="success"
          prepend-icon="ri-restart-line"
          @click="step = 1"
        >
          Nova importação
        </VBtn>
      </VCardText>
    </VCard>
  </div>
</template>
