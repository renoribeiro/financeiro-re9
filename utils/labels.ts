// ============================================================================
// Rótulos PT-BR e cores Vuetify para enums do domínio.
// Auto-importado pelo Nuxt (utils/). Usado por StatusChip e telas.
// ============================================================================

export interface Meta { label: string; color: string }

const meta = <T extends string>(m: Record<T, Meta>) => m

export const payableStatusMeta = meta({
  open: { label: 'Em aberto', color: 'info' },
  paid: { label: 'Pago', color: 'success' },
  overdue: { label: 'Vencido', color: 'error' },
  cancelled: { label: 'Cancelado', color: 'secondary' },
})

export const receivableStatusMeta = meta({
  open: { label: 'Em aberto', color: 'info' },
  received: { label: 'Recebido', color: 'success' },
  overdue: { label: 'Vencido', color: 'error' },
  cancelled: { label: 'Cancelado', color: 'secondary' },
})

export const saleStatusMeta = meta({
  in_progress: { label: 'Em andamento', color: 'warning' },
  completed: { label: 'Concluída', color: 'success' },
  cancelled: { label: 'Distratada', color: 'error' },
})

export const commissionStatusMeta = meta({
  pending: { label: 'Pendente', color: 'warning' },
  partial: { label: 'Parcial', color: 'info' },
  received: { label: 'Recebida', color: 'success' },
  cancelled: { label: 'Cancelada', color: 'secondary' },
})

export const installmentStatusMeta = meta({
  pending: { label: 'Pendente', color: 'warning' },
  received: { label: 'Recebida', color: 'success' },
  overdue: { label: 'Vencida', color: 'error' },
  cancelled: { label: 'Cancelada', color: 'secondary' },
})

export const invoiceStatusMeta = meta({
  pending: { label: 'Pendente', color: 'warning' },
  processing: { label: 'Processando', color: 'info' },
  issued: { label: 'Emitida', color: 'success' },
  cancelled: { label: 'Cancelada', color: 'secondary' },
  error: { label: 'Com erro', color: 'error' },
})

export const employeeStatusMeta = meta({
  active: { label: 'Ativo', color: 'success' },
  inactive: { label: 'Inativo', color: 'secondary' },
  terminated: { label: 'Desligado', color: 'error' },
})

export const splitStatusMeta = meta({
  pending: { label: 'Pendente', color: 'warning' },
  paid: { label: 'Pago', color: 'success' },
  not_applicable: { label: 'N/A', color: 'secondary' },
})

// 👉 Rótulos simples (sem cor) -----------------------------------------------

export const roleLabels: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  financial: 'Financeiro',
  broker: 'Corretor',
  accountant: 'Contador',
  viewer: 'Visualizador',
}

export const accountTypeLabels: Record<string, string> = {
  revenue: 'Receita',
  expense: 'Despesa',
  asset: 'Ativo',
  liability: 'Passivo',
}

export const accountTypeMeta = meta({
  revenue: { label: 'Receita', color: 'success' },
  expense: { label: 'Despesa', color: 'error' },
  asset: { label: 'Ativo', color: 'info' },
  liability: { label: 'Passivo', color: 'warning' },
})

export const employmentTypeLabels: Record<string, string> = {
  clt: 'CLT',
  pj: 'PJ',
  freelancer: 'Freelancer',
  commission_only: 'Comissionado',
}

export const recurrenceLabels: Record<string, string> = {
  once: 'Única',
  weekly: 'Semanal',
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  yearly: 'Anual',
}

export const invoiceRuleLabels: Record<string, string> = {
  immediate: 'Antecipada',
  on_receive: 'Ao receber',
  scheduled: 'Agendada',
  recurring: 'Recorrente',
}

export const developmentTypeLabels: Record<string, string> = {
  launch: 'Lançamento',
  resale: 'Avulso',
}

export const paymentMethodLabels: Record<string, string> = {
  cash: 'À vista',
  financing: 'Financiamento',
  installments_developer: 'Parcelado c/ construtora',
}

export const receiptTypeLabels: Record<string, string> = {
  launch_passthrough: 'Lançamento c/ repasse',
  resale_consolidated: 'Avulso consolidado',
  resale_split: 'Avulso dividido',
}

export const beneficiaryTypeLabels: Record<string, string> = {
  brokerage: 'Imobiliária',
  broker: 'Corretor',
  manager: 'Gerente',
  captador: 'Captador',
}

export const funnelStageLabels: Record<string, string> = {
  lead: 'Lead',
  visit: 'Visita',
  proposal: 'Proposta',
  contract: 'Contrato',
  deed: 'Escritura',
}

export const funnelStages: { value: string; label: string; color: string }[] = [
  { value: 'lead', label: 'Lead', color: 'secondary' },
  { value: 'visit', label: 'Visita', color: 'info' },
  { value: 'proposal', label: 'Proposta', color: 'warning' },
  { value: 'contract', label: 'Contrato', color: 'primary' },
  { value: 'deed', label: 'Escritura', color: 'success' },
]

export const channelLabels: Record<string, string> = {
  dashboard: 'Painel',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
}

export const notificationTypeLabels: Record<string, string> = {
  payable_due: 'Conta a pagar vencendo',
  payable_due_today: 'Conta a pagar vence hoje',
  commission_late: 'Comissão da construtora atrasada',
  cashflow_alert: 'Fluxo de caixa projetado negativo',
  invoice_issued: 'NFS-e emitida com sucesso',
  invoice_error: 'NFS-e com erro de emissão',
  sale_registered: 'Venda registrada por corretor',
  commission_received: 'Comissão recebida',
}

export const taxRegimeLabels: Record<string, string> = {
  simples_nacional: 'Simples Nacional',
  lucro_presumido: 'Lucro Presumido',
  lucro_real: 'Lucro Real',
}
