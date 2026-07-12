// ============================================================================
// Seed inicial — dados realistas das duas empresas RE9.
// Tudo em memória (Pinia). Datas relativas a "hoje" para o dashboard fazer sentido.
// ============================================================================

import type {
  AppNotification,
  ChartAccount,
  Commission,
  CommissionInstallment,
  CommissionSplit,
  Company,
  CostCenter,
  Development,
  Employee,
  FunnelCard,
  Invoice,
  NotificationRule,
  NotificationType,
  Payable,
  Receivable,
  Sale,
  Supplier,
  Transaction,
  UserProfile,
} from '@/types/finance'

// 👉 Helpers de data ----------------------------------------------------------
const base = new Date()
base.setHours(0, 0, 0, 0)

/** Data ISO (yyyy-mm-dd) deslocada N dias a partir de hoje. */
function d(offsetDays: number): string {
  const dt = new Date(base)
  dt.setDate(dt.getDate() + offsetDays)

  return dt.toISOString().slice(0, 10)
}

/** Datetime ISO deslocado N dias. */
function dt(offsetDays: number): string {
  const x = new Date(base)
  x.setDate(x.getDate() + offsetDays)

  return x.toISOString()
}

// 👉 IDs estáveis -------------------------------------------------------------
export const C1 = 'company_re9imob' // RE9 Imóveis
export const C2 = 'company_re9online' // RE9 Online Branding

// ----------------------------------------------------------------------------
// Empresas
// ----------------------------------------------------------------------------
export const companies: Company[] = [
  {
    id: C1,
    name: 'RE9 Imóveis Ltda',
    tradeName: 'RE9 Imóveis',
    type: 'real_estate',
    cnpj: '32198745000110',
    stateRegistration: 'ISENTO',
    municipalRegistration: '987654-3',
    mainCnae: '6821-8/01',
    taxRegime: 'simples_nacional',
    creci: 'CRECI-CE 24868',
    city: 'Fortaleza',
    state: 'CE',
    logoColor: 'primary',
    certificateExpiry: d(210),
    invoiceConfig: {
      defaultCnae: '6821-8/01',
      defaultIssRate: 2,
      defaultServiceDescription: 'Intermediação imobiliária — comissão de corretagem',
    },
  },
  {
    id: C2,
    name: 'RE9 Online Branding Ltda',
    tradeName: 'RE9 Online',
    type: 'agency',
    cnpj: '44556677000188',
    stateRegistration: 'ISENTO',
    municipalRegistration: '123456-7',
    mainCnae: '7311-4/00',
    taxRegime: 'simples_nacional',
    city: 'Fortaleza',
    state: 'CE',
    logoColor: 'info',
    certificateExpiry: d(40), // certificado vencendo em breve (alerta)
    invoiceConfig: {
      defaultCnae: '7311-4/00',
      defaultIssRate: 5,
      defaultServiceDescription: 'Serviços de marketing digital e gestão de mídias',
    },
  },
]

// ----------------------------------------------------------------------------
// Usuários
// ----------------------------------------------------------------------------
export const users: UserProfile[] = [
  {
    id: 'user_reno',
    fullName: 'Reno Santiago',
    email: 'reno@re9.online',
    phone: '85996227722',
    avatarColor: 'primary',
    roles: [
      { companyId: C1, role: 'super_admin' },
      { companyId: C2, role: 'super_admin' },
    ],
  },
  {
    id: 'user_fin',
    fullName: 'Marina Costa',
    email: 'financeiro@re9imob.com.br',
    phone: '85998880011',
    avatarColor: 'success',
    roles: [{ companyId: C1, role: 'financial' }],
  },
  {
    id: 'user_broker',
    fullName: 'Lucas Andrade',
    email: 'lucas@re9imob.com.br',
    phone: '85997776655',
    avatarColor: 'warning',
    roles: [{ companyId: C1, role: 'broker' }],
  },
  {
    id: 'user_acc',
    fullName: 'Paulo Mendes',
    email: 'contador@re9.online',
    avatarColor: 'info',
    roles: [
      { companyId: C1, role: 'accountant' },
      { companyId: C2, role: 'accountant' },
    ],
  },
]

// ----------------------------------------------------------------------------
// Plano de contas
// ----------------------------------------------------------------------------
function coaFor(companyId: string, rows: [string, string, ChartAccount['type'], string | null][]): ChartAccount[] {
  return rows.map(([code, name, type, parentId]) => ({
    id: `coa_${companyId}_${code.replace(/\./g, '')}`,
    companyId,
    parentId: parentId ? `coa_${companyId}_${parentId.replace(/\./g, '')}` : null,
    code,
    name,
    type,
    isActive: true,
  }))
}

export const chartAccounts: ChartAccount[] = [
  // RE9 Imóveis
  ...coaFor(C1, [
    ['1', 'Receitas', 'revenue', null],
    ['1.1', 'Comissões de vendas', 'revenue', '1'],
    ['1.1.01', 'Comissão lançamento', 'revenue', '1.1'],
    ['1.1.02', 'Comissão avulsa', 'revenue', '1.1'],
    ['1.2', 'Outras receitas', 'revenue', null],
    ['2', 'Despesas', 'expense', null],
    ['2.1', 'Repasse de comissões', 'expense', '2'],
    ['2.2', 'Marketing', 'expense', '2'],
    ['2.3', 'CRECI e anuidades', 'expense', '2'],
    ['2.4', 'Cartório', 'expense', '2'],
    ['2.5', 'Aluguel', 'expense', '2'],
    ['2.6', 'Impostos', 'expense', '2'],
    ['2.7', 'Salários', 'expense', '2'],
  ]),
  // RE9 Online
  ...coaFor(C2, [
    ['1', 'Receitas', 'revenue', null],
    ['1.1', 'Contratos mensais', 'revenue', '1'],
    ['1.2', 'Serviços avulsos', 'revenue', '1'],
    ['1.3', 'Reembolso Meta Ads', 'revenue', '1'],
    ['2', 'Despesas', 'expense', null],
    ['2.1', 'Salários', 'expense', '2'],
    ['2.2', 'Ferramentas SaaS', 'expense', '2'],
    ['2.3', 'Freelancers', 'expense', '2'],
    ['2.4', 'Aluguel', 'expense', '2'],
    ['2.5', 'Impostos', 'expense', '2'],
    ['2.6', 'Meta Ads (repasse)', 'expense', '2'],
  ]),
]

const coa = (companyId: string, code: string) => `coa_${companyId}_${code.replace(/\./g, '')}`

// ----------------------------------------------------------------------------
// Centros de custo
// ----------------------------------------------------------------------------
export const costCenters: CostCenter[] = [
  { id: 'cc_vert', companyId: C1, name: 'Empreendimento VERT Macêdo', description: 'Lançamento vertical — Aldeota', isActive: true },
  { id: 'cc_green', companyId: C1, name: 'Empreendimento Inc Green', description: 'Avulso — Cocó', isActive: true },
  { id: 'cc_geral_imob', companyId: C1, name: 'Administrativo', description: 'Custos gerais da imobiliária', isActive: true },
  { id: 'cc_mega', companyId: C2, name: 'Cliente Mega Imóveis', isActive: true },
  { id: 'cc_direcional', companyId: C2, name: 'Cliente Direcional', isActive: true },
  { id: 'cc_geral_ag', companyId: C2, name: 'Administrativo', description: 'Custos gerais da agência', isActive: true },
]

// ----------------------------------------------------------------------------
// Fornecedores
// ----------------------------------------------------------------------------
export const suppliers: Supplier[] = [
  { id: 'sup_cartorio', companyId: C1, documentType: 'cnpj', documentNumber: '07654321000133', legalName: '2º Cartório de Registro de Imóveis', email: 'contato@cartorio2.com.br', phone: '8532330000', bankInfo: { bank: 'Banco do Brasil', pix: '07654321000133' }, categoryId: coa(C1, '2.4'), isActive: true, createdAt: dt(-300) },
  { id: 'sup_imob_aluguel', companyId: C1, documentType: 'cnpj', documentNumber: '11222333000144', legalName: 'Imobiliária Predial Aldeota', tradeName: 'Predial Aldeota', phone: '8533445566', bankInfo: { bank: 'Bradesco', agency: '1234', account: '56789-0' }, categoryId: coa(C1, '2.5'), isActive: true, createdAt: dt(-280) },
  { id: 'sup_grafica', companyId: C1, documentType: 'cnpj', documentNumber: '55666777000122', legalName: 'Gráfica Forte Print', tradeName: 'Forte Print', email: 'vendas@forteprint.com.br', bankInfo: { pix: 'vendas@forteprint.com.br' }, categoryId: coa(C1, '2.2'), isActive: true, createdAt: dt(-150) },
  { id: 'sup_creci', companyId: C1, documentType: 'cnpj', documentNumber: '63025000100', legalName: 'CRECI-CE', bankInfo: {}, categoryId: coa(C1, '2.3'), isActive: true, createdAt: dt(-365) },

  { id: 'sup_google', companyId: C2, documentType: 'cnpj', documentNumber: '06990590000123', legalName: 'Google Brasil Internet Ltda', tradeName: 'Google', bankInfo: {}, categoryId: coa(C2, '2.2'), isActive: true, createdAt: dt(-400) },
  { id: 'sup_adobe', companyId: C2, documentType: 'cnpj', documentNumber: '04559090000180', legalName: 'Adobe Systems Brasil', tradeName: 'Adobe', bankInfo: {}, categoryId: coa(C2, '2.2'), isActive: true, createdAt: dt(-400) },
  { id: 'sup_freela', companyId: C2, documentType: 'cpf', documentNumber: '52998224725', legalName: 'Bruno Editor de Vídeo', email: 'bruno.video@gmail.com', bankInfo: { pix: '52998224725' }, categoryId: coa(C2, '2.3'), isActive: true, createdAt: dt(-120) },
  { id: 'sup_coworking', companyId: C2, documentType: 'cnpj', documentNumber: '77888999000111', legalName: 'Coworking Praia de Iracema', tradeName: 'Cowork Iracema', bankInfo: { bank: 'Itaú' }, categoryId: coa(C2, '2.4'), isActive: true, createdAt: dt(-200) },
]

// ----------------------------------------------------------------------------
// Colaboradores
// ----------------------------------------------------------------------------
export const employees: Employee[] = [
  { id: 'emp_lucas', companyId: C1, userId: 'user_broker', fullName: 'Lucas Andrade', cpf: '11122233344', email: 'lucas@re9imob.com.br', phone: '85997776655', employmentType: 'commission_only', bankInfo: { pix: '11122233344' }, hireDate: d(-400), status: 'active', createdAt: dt(-400) },
  { id: 'emp_carla', companyId: C1, fullName: 'Carla Beatriz', cpf: '22233344455', email: 'carla@re9imob.com.br', phone: '85988887777', employmentType: 'commission_only', bankInfo: { pix: 'carla@re9imob.com.br' }, hireDate: d(-300), status: 'active', createdAt: dt(-300) },
  { id: 'emp_marina', companyId: C1, userId: 'user_fin', fullName: 'Marina Costa', cpf: '33344455566', email: 'financeiro@re9imob.com.br', employmentType: 'clt', baseSalary: 3200, bankInfo: { bank: 'Caixa' }, hireDate: d(-500), status: 'active', createdAt: dt(-500) },
  { id: 'emp_gerente', companyId: C1, fullName: 'Roberto Nunes', cpf: '44455566677', email: 'roberto@re9imob.com.br', employmentType: 'clt', baseSalary: 5000, bankInfo: {}, hireDate: d(-600), status: 'active', createdAt: dt(-600) },

  { id: 'emp_designer', companyId: C2, fullName: 'Aline Ferreira', cpf: '55566677788', email: 'aline@re9.online', employmentType: 'clt', baseSalary: 4000, bankInfo: { bank: 'Nubank' }, hireDate: d(-350), status: 'active', createdAt: dt(-350) },
  { id: 'emp_traf', companyId: C2, fullName: 'Diego Martins', cpf: '66677788899', email: 'diego@re9.online', employmentType: 'pj', pjCnpj: '99888777000166', baseSalary: 6500, bankInfo: { pix: '99888777000166' }, hireDate: d(-250), status: 'active', createdAt: dt(-250) },
  { id: 'emp_social', companyId: C2, fullName: 'Júlia Rocha', cpf: '77788899900', email: 'julia@re9.online', employmentType: 'freelancer', bankInfo: { pix: 'julia@re9.online' }, status: 'active', createdAt: dt(-90) },
]

// ----------------------------------------------------------------------------
// Empreendimentos (RE9 Imob)
// ----------------------------------------------------------------------------
export const developments: Development[] = [
  { id: 'dev_vert', companyId: C1, name: 'VERT Macêdo', developer: 'Construtora Colmeia', address: 'Rua Tibúrcio Cavalcante, Aldeota', type: 'launch', commissionPercentage: 5, brokerSplitPercentage: 60, notes: 'Construtora paga comissão total à RE9, que repassa 60% ao corretor.', isActive: true, createdAt: dt(-200) },
  { id: 'dev_green', companyId: C1, name: 'Inc Green Residence', developer: 'Incorporadora Verdes Mares', address: 'Av. Eng. Santana Jr., Cocó', type: 'resale', commissionPercentage: 6, brokerSplitPercentage: 50, notes: 'Avulso — RE9 recebe do comprador e repassa 50%.', isActive: true, createdAt: dt(-150) },
]

// ----------------------------------------------------------------------------
// Vendas
// ----------------------------------------------------------------------------
export const sales: Sale[] = [
  { id: 'sale_1', companyId: C1, developmentId: 'dev_vert', unit: 'Torre 1 — Apto 1203', saleValue: 850000, buyerName: 'Fernando Almeida', buyerDocument: '12345678901', buyerContact: '85991112222', paymentMethod: 'financing', brokerId: 'emp_lucas', saleDate: d(-45), status: 'completed', createdAt: dt(-45) },
  { id: 'sale_2', companyId: C1, developmentId: 'dev_vert', unit: 'Torre 2 — Apto 805', saleValue: 720000, buyerName: 'Patrícia Gomes', buyerDocument: '23456789012', buyerContact: '85992223333', paymentMethod: 'installments_developer', brokerId: 'emp_carla', saleDate: d(-20), status: 'completed', createdAt: dt(-20) },
  { id: 'sale_3', companyId: C1, developmentId: 'dev_green', unit: 'Bloco A — Apto 304', saleValue: 480000, buyerName: 'Marcos Vinícius', buyerDocument: '34567890123', buyerContact: '85993334444', paymentMethod: 'cash', brokerId: 'emp_lucas', saleDate: d(-8), status: 'completed', createdAt: dt(-8) },
  { id: 'sale_4', companyId: C1, developmentId: 'dev_vert', unit: 'Torre 1 — Apto 1504', saleValue: 910000, buyerName: 'Helena Dias', buyerDocument: '45678901234', buyerContact: '85994445555', paymentMethod: 'financing', brokerId: 'emp_carla', saleDate: d(-2), status: 'in_progress', createdAt: dt(-2) },
]

// ----------------------------------------------------------------------------
// Funil de vendas (RE9 Imob)
// ----------------------------------------------------------------------------
export const funnelCards: FunnelCard[] = [
  { id: 'fn_1', companyId: C1, developmentId: 'dev_vert', brokerId: 'emp_lucas', contactName: 'João Pereira', contactPhone: '85990001111', estimatedValue: 800000, currentStage: 'lead', stageEnteredAt: dt(-3), createdAt: dt(-3) },
  { id: 'fn_2', companyId: C1, developmentId: 'dev_green', brokerId: 'emp_carla', contactName: 'Sandra Lima', contactPhone: '85990002222', estimatedValue: 500000, currentStage: 'lead', stageEnteredAt: dt(-1), createdAt: dt(-1) },
  { id: 'fn_3', companyId: C1, developmentId: 'dev_vert', brokerId: 'emp_lucas', contactName: 'Ricardo Souza', contactPhone: '85990003333', estimatedValue: 720000, currentStage: 'visit', stageEnteredAt: dt(-5), createdAt: dt(-9) },
  { id: 'fn_4', companyId: C1, developmentId: 'dev_green', brokerId: 'emp_carla', contactName: 'Beatriz Castro', contactPhone: '85990004444', estimatedValue: 460000, currentStage: 'visit', stageEnteredAt: dt(-4), createdAt: dt(-12) },
  { id: 'fn_5', companyId: C1, developmentId: 'dev_vert', brokerId: 'emp_lucas', contactName: 'Anderson Melo', contactPhone: '85990005555', estimatedValue: 880000, currentStage: 'proposal', stageEnteredAt: dt(-6), createdAt: dt(-18) },
  { id: 'fn_6', companyId: C1, developmentId: 'dev_green', brokerId: 'emp_carla', contactName: 'Tatiane Rocha', contactPhone: '85990006666', estimatedValue: 510000, currentStage: 'proposal', stageEnteredAt: dt(-2), createdAt: dt(-15) },
  { id: 'fn_7', companyId: C1, developmentId: 'dev_vert', brokerId: 'emp_lucas', contactName: 'Helena Dias', contactPhone: '85994445555', estimatedValue: 910000, currentStage: 'contract', saleId: 'sale_4', stageEnteredAt: dt(-2), createdAt: dt(-22) },
  { id: 'fn_8', companyId: C1, developmentId: 'dev_green', brokerId: 'emp_carla', contactName: 'Marcos Vinícius', contactPhone: '85993334444', estimatedValue: 480000, currentStage: 'deed', saleId: 'sale_3', stageEnteredAt: dt(-8), createdAt: dt(-30) },
]

// ----------------------------------------------------------------------------
// Comissões + parcelas + splits
// ----------------------------------------------------------------------------
export const commissions: Commission[] = [
  { id: 'com_1', companyId: C1, saleId: 'sale_1', totalAmount: 42500, receiptType: 'launch_passthrough', status: 'partial', createdAt: dt(-45) },
  { id: 'com_2', companyId: C1, saleId: 'sale_2', totalAmount: 36000, receiptType: 'launch_passthrough', status: 'pending', createdAt: dt(-20) },
  { id: 'com_3', companyId: C1, saleId: 'sale_3', totalAmount: 28800, receiptType: 'resale_consolidated', status: 'received', createdAt: dt(-8) },
]

export const commissionInstallments: CommissionInstallment[] = [
  // com_1 — 850k * 5% = 42.5k em 2 parcelas
  { id: 'ci_1a', commissionId: 'com_1', installmentNumber: 1, amount: 21250, expectedDate: d(-15), receivedDate: d(-14), status: 'received', receivableId: 'rec_com1_1' },
  { id: 'ci_1b', commissionId: 'com_1', installmentNumber: 2, amount: 21250, expectedDate: d(15), status: 'pending', receivableId: 'rec_com1_2' },
  // com_2 — 720k * 5% = 36k em 1 parcela (atrasada → alerta)
  { id: 'ci_2a', commissionId: 'com_2', installmentNumber: 1, amount: 36000, expectedDate: d(-12), status: 'overdue', receivableId: 'rec_com2_1' },
  // com_3 — 480k * 6% = 28.8k recebida
  { id: 'ci_3a', commissionId: 'com_3', installmentNumber: 1, amount: 28800, expectedDate: d(-5), receivedDate: d(-5), status: 'received', receivableId: 'rec_com3_1' },
]

export const commissionSplits: CommissionSplit[] = [
  // com_1: 60% corretor / 40% imobiliária
  { id: 'cs_1a', commissionId: 'com_1', beneficiaryType: 'brokerage', percentage: 40, amount: 17000, status: 'not_applicable' },
  { id: 'cs_1b', commissionId: 'com_1', beneficiaryType: 'broker', beneficiaryId: 'emp_lucas', percentage: 60, amount: 25500, payableId: 'pay_com1_broker', status: 'pending' },
  // com_2
  { id: 'cs_2a', commissionId: 'com_2', beneficiaryType: 'brokerage', percentage: 40, amount: 14400, status: 'not_applicable' },
  { id: 'cs_2b', commissionId: 'com_2', beneficiaryType: 'broker', beneficiaryId: 'emp_carla', percentage: 60, amount: 21600, status: 'pending' },
  // com_3: avulso consolidado 50/50
  { id: 'cs_3a', commissionId: 'com_3', beneficiaryType: 'brokerage', percentage: 50, amount: 14400, status: 'not_applicable' },
  { id: 'cs_3b', commissionId: 'com_3', beneficiaryType: 'broker', beneficiaryId: 'emp_lucas', percentage: 50, amount: 14400, payableId: 'pay_com3_broker', status: 'paid' },
]

// ----------------------------------------------------------------------------
// Contas a pagar
// ----------------------------------------------------------------------------
export const payables: Payable[] = [
  { id: 'pay_aluguel_imob', companyId: C1, supplierId: 'sup_imob_aluguel', description: 'Aluguel sede — Aldeota', amount: 4500, dueDate: d(5), competenceDate: d(0), categoryId: coa(C1, '2.5'), costCenterId: 'cc_geral_imob', recurrence: 'monthly', status: 'open', createdAt: dt(-30) },
  { id: 'pay_creci', companyId: C1, supplierId: 'sup_creci', description: 'Anuidade CRECI-CE', amount: 1200, dueDate: d(2), categoryId: coa(C1, '2.3'), costCenterId: 'cc_geral_imob', recurrence: 'yearly', status: 'open', createdAt: dt(-20) },
  { id: 'pay_grafica', companyId: C1, supplierId: 'sup_grafica', description: 'Material gráfico — stand VERT', amount: 2300, dueDate: d(-3), categoryId: coa(C1, '2.2'), costCenterId: 'cc_vert', recurrence: 'once', status: 'overdue', createdAt: dt(-15) },
  { id: 'pay_com1_broker', companyId: C1, employeeId: 'emp_lucas', description: 'Repasse comissão — venda Fernando Almeida (1ª parcela)', amount: 25500, dueDate: d(18), categoryId: coa(C1, '2.1'), costCenterId: 'cc_vert', recurrence: 'once', status: 'open', notes: 'Executar após recebimento da comissão da construtora.', createdAt: dt(-14) },
  { id: 'pay_com3_broker', companyId: C1, employeeId: 'emp_lucas', description: 'Repasse comissão — venda Marcos Vinícius', amount: 14400, dueDate: d(-3), categoryId: coa(C1, '2.1'), costCenterId: 'cc_green', recurrence: 'once', status: 'paid', paidAt: dt(-3), paidAmount: 14400, createdAt: dt(-8) },
  { id: 'pay_cartorio', companyId: C1, supplierId: 'sup_cartorio', description: 'Registro de escritura — Inc Green', amount: 1850, dueDate: d(10), categoryId: coa(C1, '2.4'), costCenterId: 'cc_green', recurrence: 'once', status: 'open', createdAt: dt(-5) },

  { id: 'pay_aluguel_ag', companyId: C2, supplierId: 'sup_coworking', description: 'Coworking — mensalidade', amount: 1800, dueDate: d(4), categoryId: coa(C2, '2.4'), costCenterId: 'cc_geral_ag', recurrence: 'monthly', status: 'open', createdAt: dt(-30) },
  { id: 'pay_adobe', companyId: C2, supplierId: 'sup_adobe', description: 'Adobe Creative Cloud (equipe)', amount: 980, dueDate: d(1), categoryId: coa(C2, '2.2'), costCenterId: 'cc_geral_ag', recurrence: 'monthly', status: 'open', createdAt: dt(-30) },
  { id: 'pay_freela_video', companyId: C2, supplierId: 'sup_freela', description: 'Edição de vídeos — campanha Mega Imóveis', amount: 2500, dueDate: d(-2), categoryId: coa(C2, '2.3'), costCenterId: 'cc_mega', recurrence: 'once', status: 'overdue', createdAt: dt(-12) },
  { id: 'pay_traf_pj', companyId: C2, employeeId: 'emp_traf', description: 'Pró-labore PJ — Diego (gestão de tráfego)', amount: 6500, dueDate: d(6), categoryId: coa(C2, '2.1'), costCenterId: 'cc_geral_ag', recurrence: 'monthly', status: 'open', createdAt: dt(-30) },
  { id: 'pay_meta_mega', companyId: C2, supplierId: 'sup_google', description: 'Meta Ads — verba Mega Imóveis (repasse)', amount: 5000, dueDate: d(-6), categoryId: coa(C2, '2.6'), costCenterId: 'cc_mega', recurrence: 'monthly', status: 'paid', paidAt: dt(-6), paidAmount: 5000, createdAt: dt(-20) },

  // Parcelas (parcelamento de uma compra de mobília de stand)
  { id: 'pay_mob_1', companyId: C1, supplierId: 'sup_grafica', description: 'Mobília stand VERT (1/3)', amount: 1500, dueDate: d(-1), categoryId: coa(C1, '2.2'), costCenterId: 'cc_vert', recurrence: 'once', installmentNumber: 1, totalInstallments: 3, status: 'overdue', createdAt: dt(-10) },
  { id: 'pay_mob_2', companyId: C1, supplierId: 'sup_grafica', description: 'Mobília stand VERT (2/3)', amount: 1500, dueDate: d(29), categoryId: coa(C1, '2.2'), costCenterId: 'cc_vert', recurrence: 'once', installmentNumber: 2, totalInstallments: 3, parentPayableId: 'pay_mob_1', status: 'open', createdAt: dt(-10) },
  { id: 'pay_mob_3', companyId: C1, supplierId: 'sup_grafica', description: 'Mobília stand VERT (3/3)', amount: 1500, dueDate: d(59), categoryId: coa(C1, '2.2'), costCenterId: 'cc_vert', recurrence: 'once', installmentNumber: 3, totalInstallments: 3, parentPayableId: 'pay_mob_1', status: 'open', createdAt: dt(-10) },
]

// ----------------------------------------------------------------------------
// Contas a receber
// ----------------------------------------------------------------------------
export const receivables: Receivable[] = [
  { id: 'rec_com1_1', companyId: C1, clientName: 'Construtora Colmeia', clientDocument: '10101010000110', saleId: 'sale_1', commissionInstallmentId: 'ci_1a', description: 'Comissão VERT — Fernando Almeida (1/2)', amount: 21250, dueDate: d(-15), competenceDate: d(-45), categoryId: coa(C1, '1.1.01'), costCenterId: 'cc_vert', invoiceRule: 'on_receive', recurrence: 'once', status: 'received', receivedAt: dt(-14), receivedAmount: 21250, createdAt: dt(-45) },
  { id: 'rec_com1_2', companyId: C1, clientName: 'Construtora Colmeia', clientDocument: '10101010000110', saleId: 'sale_1', commissionInstallmentId: 'ci_1b', description: 'Comissão VERT — Fernando Almeida (2/2)', amount: 21250, dueDate: d(15), competenceDate: d(-45), categoryId: coa(C1, '1.1.01'), costCenterId: 'cc_vert', invoiceRule: 'on_receive', recurrence: 'once', status: 'open', createdAt: dt(-45) },
  { id: 'rec_com2_1', companyId: C1, clientName: 'Construtora Colmeia', clientDocument: '10101010000110', saleId: 'sale_2', commissionInstallmentId: 'ci_2a', description: 'Comissão VERT — Patrícia Gomes', amount: 36000, dueDate: d(-12), competenceDate: d(-20), categoryId: coa(C1, '1.1.01'), costCenterId: 'cc_vert', invoiceRule: 'on_receive', recurrence: 'once', status: 'overdue', createdAt: dt(-20) },
  { id: 'rec_com3_1', companyId: C1, clientName: 'Marcos Vinícius', clientDocument: '34567890123', saleId: 'sale_3', commissionInstallmentId: 'ci_3a', description: 'Comissão Inc Green — Marcos Vinícius', amount: 28800, dueDate: d(-5), competenceDate: d(-8), categoryId: coa(C1, '1.1.02'), costCenterId: 'cc_green', invoiceRule: 'on_receive', recurrence: 'once', status: 'received', receivedAt: dt(-5), receivedAmount: 28800, createdAt: dt(-8) },

  { id: 'rec_mega', companyId: C2, clientName: 'Mega Imóveis', clientDocument: '20202020000120', description: 'Contrato mensal — gestão de mídias', amount: 7500, dueDate: d(3), competenceDate: d(0), categoryId: coa(C2, '1.1'), costCenterId: 'cc_mega', invoiceRule: 'recurring', invoiceRecurrenceDay: 5, recurrence: 'monthly', status: 'open', createdAt: dt(-60) },
  { id: 'rec_direcional', companyId: C2, clientName: 'Direcional Engenharia', clientDocument: '30303030000130', description: 'Contrato mensal — tráfego pago + social', amount: 12000, dueDate: d(-4), competenceDate: d(-4), categoryId: coa(C2, '1.1'), costCenterId: 'cc_direcional', invoiceRule: 'recurring', invoiceRecurrenceDay: 20, recurrence: 'monthly', status: 'overdue', createdAt: dt(-90) },
  { id: 'rec_avulso', companyId: C2, clientName: 'Construtora Sereia', clientDocument: '40404040000140', description: 'Identidade visual — projeto avulso', amount: 9800, dueDate: d(12), categoryId: coa(C2, '1.2'), costCenterId: 'cc_geral_ag', invoiceRule: 'scheduled', invoiceScheduledDate: d(12), recurrence: 'once', status: 'open', createdAt: dt(-10) },
  { id: 'rec_meta_reemb', companyId: C2, clientName: 'Mega Imóveis', clientDocument: '20202020000120', description: 'Reembolso verba Meta Ads', amount: 5000, dueDate: d(-1), categoryId: coa(C2, '1.3'), costCenterId: 'cc_mega', invoiceRule: 'immediate', recurrence: 'once', status: 'received', receivedAt: dt(-1), receivedAmount: 5000, createdAt: dt(-8) },
]

// ----------------------------------------------------------------------------
// Transações realizadas (derivadas das baixas)
// ----------------------------------------------------------------------------
export const transactions: Transaction[] = [
  { id: 'tx_1', companyId: C1, type: 'income', amount: 21250, date: dt(-14), receivableId: 'rec_com1_1', description: 'Recebimento comissão VERT (1/2)', createdAt: dt(-14) },
  { id: 'tx_2', companyId: C1, type: 'income', amount: 28800, date: dt(-5), receivableId: 'rec_com3_1', description: 'Recebimento comissão Inc Green', createdAt: dt(-5) },
  { id: 'tx_3', companyId: C1, type: 'expense', amount: 14400, date: dt(-3), payableId: 'pay_com3_broker', description: 'Repasse comissão Lucas', createdAt: dt(-3) },
  { id: 'tx_4', companyId: C2, type: 'income', amount: 5000, date: dt(-1), receivableId: 'rec_meta_reemb', description: 'Reembolso Meta Ads Mega', createdAt: dt(-1) },
  { id: 'tx_5', companyId: C2, type: 'expense', amount: 5000, date: dt(-6), payableId: 'pay_meta_mega', description: 'Repasse Meta Ads Mega', createdAt: dt(-6) },
]

// ----------------------------------------------------------------------------
// Notas Fiscais (NFS-e)
// ----------------------------------------------------------------------------
export const invoices: Invoice[] = [
  { id: 'inv_1', companyId: C1, receivableId: 'rec_com1_1', invoiceNumber: '000142', series: '1', verificationCode: 'A1B2-C3D4', cnae: '6821-8/01', issRate: 2, serviceDescription: 'Comissão de corretagem — VERT Macêdo', amount: 21250, takerName: 'Construtora Colmeia', takerDocument: '10101010000110', takerEmail: 'fiscal@colmeia.com.br', status: 'issued', issuedAt: dt(-14), createdAt: dt(-14) },
  { id: 'inv_2', companyId: C1, receivableId: 'rec_com3_1', invoiceNumber: '000143', series: '1', verificationCode: 'E5F6-G7H8', cnae: '6821-8/01', issRate: 2, serviceDescription: 'Comissão de corretagem — Inc Green', amount: 28800, takerName: 'Marcos Vinícius', takerDocument: '34567890123', status: 'issued', issuedAt: dt(-5), createdAt: dt(-5) },
  { id: 'inv_3', companyId: C2, receivableId: 'rec_meta_reemb', invoiceNumber: '000311', series: '1', verificationCode: 'I9J0-K1L2', cnae: '7311-4/00', issRate: 5, serviceDescription: 'Serviços de marketing digital', amount: 5000, takerName: 'Mega Imóveis', takerDocument: '20202020000120', takerEmail: 'financeiro@megaimoveis.com.br', status: 'issued', issuedAt: dt(-1), createdAt: dt(-1) },
  { id: 'inv_4', companyId: C2, receivableId: 'rec_direcional', cnae: '7311-4/00', issRate: 5, serviceDescription: 'Gestão de tráfego pago + social', amount: 12000, takerName: 'Direcional Engenharia', takerDocument: '30303030000130', takerEmail: 'nf@direcional.com.br', status: 'error', errorMessage: 'SEFIN: certificado A1 próximo do vencimento — rejeição L045.', createdAt: dt(-4) },
  { id: 'inv_5', companyId: C2, receivableId: 'rec_mega', cnae: '7311-4/00', issRate: 5, serviceDescription: 'Serviços de marketing digital', amount: 7500, takerName: 'Mega Imóveis', takerDocument: '20202020000120', status: 'pending', createdAt: dt(0) },
]

// ----------------------------------------------------------------------------
// Notificações + regras
// ----------------------------------------------------------------------------
export const notifications: AppNotification[] = [
  { id: 'ntf_1', companyId: C1, type: 'commission_late', title: 'Comissão da construtora atrasada', message: 'Comissão da venda de Patrícia Gomes (VERT) está 12 dias atrasada — R$ 36.000,00.', channel: 'dashboard', status: 'sent', severity: 'error', createdAt: dt(-1) },
  { id: 'ntf_2', companyId: C1, type: 'payable_due', title: 'Contas vencendo', message: '2 contas a pagar vencem nos próximos 3 dias.', channel: 'dashboard', status: 'sent', severity: 'warning', createdAt: dt(0) },
  { id: 'ntf_3', companyId: C1, type: 'invoice_issued', title: 'NFS-e emitida', message: 'NFS-e 000143 emitida com sucesso para Marcos Vinícius.', channel: 'email', status: 'sent', severity: 'success', createdAt: dt(-5) },
  { id: 'ntf_4', companyId: C2, type: 'invoice_error', title: 'NFS-e com erro', message: 'Falha ao emitir NFS-e para Direcional Engenharia — verificar certificado A1.', channel: 'whatsapp', status: 'sent', severity: 'error', createdAt: dt(-4) },
  { id: 'ntf_5', companyId: C2, type: 'payable_due_today', title: 'Conta vence hoje', message: 'Adobe Creative Cloud — R$ 980,00 vence amanhã.', channel: 'dashboard', status: 'sent', severity: 'warning', createdAt: dt(0) },
  { id: 'ntf_6', companyId: C2, type: 'cashflow_alert', title: 'Atenção ao fluxo de caixa', message: 'Direcional inadimplente (R$ 12.000,00) impacta o caixa previsto.', channel: 'dashboard', status: 'sent', severity: 'warning', createdAt: dt(0) },
]

const ruleDefs: { type: NotificationType; advanceDays?: number }[] = [
  { type: 'payable_due', advanceDays: 3 },
  { type: 'payable_due_today' },
  { type: 'commission_late', advanceDays: 10 },
  { type: 'cashflow_alert', advanceDays: 7 },
  { type: 'invoice_issued' },
  { type: 'invoice_error' },
  { type: 'sale_registered' },
  { type: 'commission_received' },
]

export const notificationRules: NotificationRule[] = [C1, C2].flatMap(companyId =>
  ruleDefs.map(r => ({
    id: `rule_${companyId}_${r.type}`,
    companyId,
    type: r.type,
    label: notificationTypeLabels[r.type],
    isActive: true,
    channels: ['dashboard'] as NotificationRule['channels'],
    advanceDays: r.advanceDays,
  })),
)
