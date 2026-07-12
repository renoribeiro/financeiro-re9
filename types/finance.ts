// ============================================================================
// RE9 Finanças — Modelo de dados (TypeScript)
// Reflete o design spec (2026-06-23-re9-financas-design.md). Camada in-memory
// (Pinia) simulando o backend multi-tenant Supabase + RLS.
// ============================================================================

// 👉 Multi-tenant / Core ------------------------------------------------------

export type CompanyType = 'real_estate' | 'agency'
export type TaxRegime = 'simples_nacional' | 'lucro_presumido' | 'lucro_real'

export interface Company {
  id: string
  name: string
  tradeName: string
  type: CompanyType
  cnpj: string
  stateRegistration?: string
  municipalRegistration?: string
  mainCnae?: string
  taxRegime: TaxRegime
  creci?: string
  city: string
  state: string
  logoColor: string
  certificateExpiry?: string
  invoiceConfig: {
    defaultCnae: string
    defaultIssRate: number
    defaultServiceDescription: string
  }
}

export type Role =
  | 'super_admin'
  | 'admin'
  | 'financial'
  | 'broker'
  | 'accountant'
  | 'viewer'

export interface UserProfile {
  id: string
  fullName: string
  email: string
  phone?: string
  avatarColor: string
  roles: { companyId: string; role: Role }[]
}

export interface AuditEntry {
  id: string
  companyId: string
  userId: string
  userName: string
  action: string
  entityType: string
  entityId?: string
  description: string
  createdAt: string
}

// 👉 Financeiro ---------------------------------------------------------------

export type AccountType = 'revenue' | 'expense' | 'asset' | 'liability'

export interface ChartAccount {
  id: string
  companyId: string
  parentId: string | null
  code: string
  name: string
  type: AccountType
  isActive: boolean
}

export interface CostCenter {
  id: string
  companyId: string
  name: string
  description?: string
  isActive: boolean
}

export type DocumentType = 'cpf' | 'cnpj'

export interface BankInfo {
  bank?: string
  agency?: string
  account?: string
  pix?: string
}

export interface Supplier {
  id: string
  companyId: string
  documentType: DocumentType
  documentNumber: string
  legalName: string
  tradeName?: string
  email?: string
  phone?: string
  bankInfo: BankInfo
  categoryId?: string
  notes?: string
  isActive: boolean
  createdAt: string
}

export type EmploymentType = 'clt' | 'pj' | 'freelancer' | 'commission_only'
export type EmployeeStatus = 'active' | 'inactive' | 'terminated'

export interface Employee {
  id: string
  companyId: string
  userId?: string
  fullName: string
  cpf: string
  email?: string
  phone?: string
  employmentType: EmploymentType
  pjCnpj?: string
  baseSalary?: number
  bankInfo: BankInfo
  hireDate?: string
  terminationDate?: string
  status: EmployeeStatus
  createdAt: string
}

export type Recurrence = 'once' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
export type PayableStatus = 'open' | 'paid' | 'overdue' | 'cancelled'

export interface Payable {
  id: string
  companyId: string
  supplierId?: string
  employeeId?: string
  description: string
  amount: number
  dueDate: string
  competenceDate?: string
  categoryId?: string
  costCenterId?: string
  recurrence: Recurrence
  installmentNumber?: number
  totalInstallments?: number
  parentPayableId?: string
  status: PayableStatus
  paidAt?: string
  paidAmount?: number
  proofUrl?: string
  notes?: string
  createdAt: string
}

export type InvoiceRule = 'immediate' | 'on_receive' | 'scheduled' | 'recurring'
export type ReceivableStatus = 'open' | 'received' | 'overdue' | 'cancelled'

export interface Receivable {
  id: string
  companyId: string
  clientName?: string
  clientDocument?: string
  saleId?: string
  commissionInstallmentId?: string
  description: string
  amount: number
  dueDate: string
  competenceDate?: string
  categoryId?: string
  costCenterId?: string
  invoiceRule: InvoiceRule
  invoiceScheduledDate?: string
  invoiceRecurrenceDay?: number
  recurrence: 'once' | 'monthly'
  status: ReceivableStatus
  receivedAt?: string
  receivedAmount?: number
  proofUrl?: string
  notes?: string
  createdAt: string
}

export type TransactionType = 'income' | 'expense'

export interface Transaction {
  id: string
  companyId: string
  type: TransactionType
  amount: number
  date: string
  payableId?: string
  receivableId?: string
  description: string
  createdAt: string
}

// 👉 Comercial / Vendas -------------------------------------------------------

export type DevelopmentType = 'launch' | 'resale'

export interface Development {
  id: string
  companyId: string
  name: string
  developer: string
  address?: string
  type: DevelopmentType
  commissionPercentage: number
  brokerSplitPercentage: number
  notes?: string
  isActive: boolean
  createdAt: string
}

export type SaleStatus = 'in_progress' | 'completed' | 'cancelled'
export type PaymentMethod = 'cash' | 'financing' | 'installments_developer'

export interface Sale {
  id: string
  companyId: string
  developmentId: string
  unit?: string
  saleValue: number
  buyerName: string
  buyerDocument?: string
  buyerContact?: string
  paymentMethod: PaymentMethod
  brokerId: string
  saleDate: string
  status: SaleStatus
  notes?: string
  createdAt: string
}

export type FunnelStage = 'lead' | 'visit' | 'proposal' | 'contract' | 'deed'

export interface FunnelCard {
  id: string
  companyId: string
  developmentId?: string
  brokerId?: string
  contactName: string
  contactPhone?: string
  contactEmail?: string
  estimatedValue?: number
  currentStage: FunnelStage
  saleId?: string
  notes?: string
  stageEnteredAt: string
  createdAt: string
}

export interface FunnelHistory {
  id: string
  cardId: string
  fromStage: FunnelStage | null
  toStage: FunnelStage
  changedAt: string
}

export type CommissionReceiptType =
  | 'launch_passthrough'
  | 'resale_consolidated'
  | 'resale_split'

export type CommissionStatus = 'pending' | 'partial' | 'received' | 'cancelled'

export interface Commission {
  id: string
  companyId: string
  saleId: string
  totalAmount: number
  receiptType: CommissionReceiptType
  status: CommissionStatus
  notes?: string
  createdAt: string
}

export type InstallmentStatus = 'pending' | 'received' | 'overdue' | 'cancelled'

export interface CommissionInstallment {
  id: string
  commissionId: string
  installmentNumber: number
  amount: number
  expectedDate: string
  receivedDate?: string
  status: InstallmentStatus
  receivableId?: string
}

export type BeneficiaryType = 'brokerage' | 'broker' | 'manager' | 'captador'
export type SplitStatus = 'pending' | 'paid' | 'not_applicable'

export interface CommissionSplit {
  id: string
  commissionId: string
  beneficiaryType: BeneficiaryType
  beneficiaryId?: string
  percentage: number
  amount: number
  payableId?: string
  status: SplitStatus
}

// 👉 Notas Fiscais (NFS-e) ----------------------------------------------------

export type InvoiceStatus = 'pending' | 'issued' | 'cancelled' | 'error'

export interface Invoice {
  id: string
  companyId: string
  receivableId?: string
  invoiceNumber?: string
  series?: string
  verificationCode?: string
  cnae: string
  issRate: number
  serviceDescription: string
  amount: number
  takerName: string
  takerDocument: string
  takerEmail?: string
  status: InvoiceStatus
  errorMessage?: string
  issuedAt?: string
  cancelledAt?: string
  createdAt: string
}

// 👉 Notificações -------------------------------------------------------------

export type NotificationChannel = 'dashboard' | 'whatsapp' | 'email'
export type NotificationStatus = 'pending' | 'sent' | 'read' | 'failed'

export type NotificationType =
  | 'payable_due'
  | 'payable_due_today'
  | 'commission_late'
  | 'cashflow_alert'
  | 'invoice_issued'
  | 'invoice_error'
  | 'sale_registered'
  | 'commission_received'

export interface AppNotification {
  id: string
  companyId: string
  userId?: string
  type: NotificationType
  title: string
  message: string
  channel: NotificationChannel
  status: NotificationStatus
  severity: 'success' | 'warning' | 'error' | 'info'
  createdAt: string
  readAt?: string
}

export interface NotificationRule {
  id: string
  companyId: string
  type: NotificationType
  label: string
  isActive: boolean
  channels: NotificationChannel[]
  advanceDays?: number
}
