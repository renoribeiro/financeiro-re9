import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL(
    '../supabase/migrations/20260728211912_receivables_cash_basis_and_fiscal_modes.sql',
    import.meta.url,
  ),
  'utf8',
)

const legacySettlementMigration = readFileSync(
  new URL(
    '../supabase/migrations/20260728220427_backfill_legacy_receivable_settlements.sql',
    import.meta.url,
  ),
  'utf8',
)

const safeCrudMigration = readFileSync(
  new URL(
    '../supabase/migrations/20260728231840_financial_accounts_safe_crud.sql',
    import.meta.url,
  ),
  'utf8',
)

const hardenedDeleteMigration = readFileSync(
  new URL(
    '../supabase/migrations/20260728232004_harden_financial_account_deletion.sql',
    import.meta.url,
  ),
  'utf8',
)

const editableSettledMigration = readFileSync(
  new URL(
    '../supabase/migrations/20260729003400_editable_settled_financial_accounts.sql',
    import.meta.url,
  ),
  'utf8',
)

const reopenSettledMigration = readFileSync(
  new URL(
    '../supabase/migrations/20260729014818_reopen_settled_financial_accounts.sql',
    import.meta.url,
  ),
  'utf8',
)

const commercialHistoryMigration = readFileSync(
  new URL(
    '../supabase/migrations/20260809204545_commercial_crud_and_point_in_time_history.sql',
    import.meta.url,
  ),
  'utf8',
)

const developmentDefaultsMigration = readFileSync(
  new URL(
    '../supabase/migrations/20260810233332_default_development_commission_rates.sql',
    import.meta.url,
  ),
  'utf8',
)

const productionAuditMigration = readFileSync(
  new URL(
    '../supabase/migrations/20260811005921_production_audit_integrity_fixes.sql',
    import.meta.url,
  ),
  'utf8',
)

assert.match(
  migration,
  /select \* from public\.settle_receivable\([\s\S]+?\)\s+into r;/,
  'o recebimento inicial deve atribuir o retorno composto por meio de FROM',
)

assert.doesNotMatch(
  migration,
  /select public\.settle_receivable\([\s\S]+?\)\s+into r;/,
  'a forma escalar invalida nao pode voltar para a migracao base',
)

assert.match(
  migration,
  /Backfill automatico de recebimento legado/,
  'a migracao base deve completar a trilha de baixas de bancos novos',
)

assert.match(
  legacySettlementMigration,
  /insert into public\.settlements[\s\S]+update public\.transactions[\s\S]+set settlement_id = inserted\.id/,
  'o backfill incremental deve criar a baixa e associar a transacao existente',
)

assert.doesNotMatch(
  legacySettlementMigration,
  /insert into public\.transactions/,
  'o backfill nao pode duplicar movimentos de caixa',
)

assert.match(
  safeCrudMigration,
  /create or replace function public\.delete_payable_entry[\s\S]+?from public\.settlements[\s\S]+?from public\.transactions[\s\S]+?from public\.commission_splits/,
  'a exclusao de contas a pagar deve proteger baixas, transacoes e comissoes',
)

assert.match(
  safeCrudMigration,
  /create or replace function public\.delete_receivable_entry[\s\S]+?from public\.settlements[\s\S]+?from public\.transactions[\s\S]+?from public\.invoices[\s\S]+?from public\.commission_installments/,
  'a exclusao de contas a receber deve proteger caixa, fiscal e comissoes',
)

assert.match(
  safeCrudMigration,
  /revoke delete on public\.payables, public\.receivables from authenticated/,
  'o cliente nao pode contornar as funcoes seguras com DELETE direto',
)

assert.match(
  hardenedDeleteMigration,
  /create trigger guard_payable_delete[\s\S]+?create trigger guard_receivable_delete/,
  'triggers devem proteger toda exclusao, inclusive chamadas diretas',
)

assert.match(
  editableSettledMigration,
  /create or replace function public\.update_payable_entry[\s\S]+?requested_amount < p\.paid_amount[\s\S]+?update public\.transactions[\s\S]+?where payable_id = p\.id/,
  'a edição de conta paga deve preservar o caixa e recalcular apenas os metadados',
)

assert.match(
  editableSettledMigration,
  /create or replace function public\.update_receivable_entry[\s\S]+?requested_amount < r\.received_amount[\s\S]+?existing_invoice\.id is not null[\s\S]+?has_commission[\s\S]+?update public\.transactions/,
  'a edição de conta recebida deve proteger caixa, NFS-e e comissão',
)

assert.match(
  editableSettledMigration,
  /elsif requested_rule = 'manual'[\s\S]+?insert into public\.invoices/,
  'uma conta antiga sem nota deve aceitar o vínculo de uma NFS-e externa',
)

assert.match(
  hardenedDeleteMigration,
  /create or replace function public\.delete_payable_entry[\s\S]+?security invoker[\s\S]+?create or replace function public\.delete_receivable_entry[\s\S]+?security invoker/,
  'os RPCs expostos devem executar com as permissoes do usuario',
)

assert.match(
  hardenedDeleteMigration,
  /create policy payables_delete[\s\S]+?private\.can_manage_finance[\s\S]+?create policy receivables_delete[\s\S]+?private\.can_manage_finance/,
  'a RLS deve limitar exclusoes a perfis financeiros da empresa',
)

assert.match(
  reopenSettledMigration,
  /legacy_payments as materialized[\s\S]+?insert into public\.settlements[\s\S]+?set settlement_id = legacy\.settlement_id/,
  'pagamentos legados devem receber settlement sem duplicar o caixa',
)

assert.match(
  reopenSettledMigration,
  /create or replace function public\.reverse_payable_settlement[\s\S]+?insert into public\.transactions[\s\S]+?is_reversal[\s\S]+?update public\.payables/,
  'estorno de pagamento deve gerar contrapartida e recalcular a conta',
)

assert.match(
  reopenSettledMigration,
  /create or replace function public\.reopen_payable[\s\S]+?reverse_payable_settlement[\s\S]+?create or replace function public\.reopen_receivable[\s\S]+?reverse_receivable_settlement/,
  'reaberturas completas devem neutralizar todas as baixas ativas',
)

assert.match(
  reopenSettledMigration,
  /revoke all on function public\.reopen_payable[\s\S]+?from public, anon[\s\S]+?grant execute on function public\.reopen_receivable[\s\S]+?to authenticated/,
  'RPCs de reabertura devem ser restritos a usuarios autenticados',
)

assert.match(
  commercialHistoryMigration,
  /create or replace function public\.save_sale_with_commission[\s\S]+?private\.save_sale_graph/,
  'a venda e o grafo de comissão devem ser persistidos por uma única operação transacional',
)

assert.match(
  commercialHistoryMigration,
  /private\.create_commission_graph[\s\S]+?insert into public\.commissions[\s\S]+?insert into public\.receivables[\s\S]+?insert into public\.commission_installments/,
  'a geração deve criar comissão, contas a receber e parcelas na mesma transação',
)

assert.match(
  commercialHistoryMigration,
  /commission_has_financial_activity[\s\S]+?public\.settlements[\s\S]+?public\.transactions[\s\S]+?public\.invoices/,
  'edições e exclusões comerciais devem proteger baixas, caixa e documentos fiscais',
)

assert.match(
  commercialHistoryMigration,
  /create or replace function public\.restore_company_to_history_point[\s\S]+?private\.can_admin_company[\s\S]+?distinct on \(a\.entity_type, a\.entity_id\)[\s\S]+?jsonb_populate_record/,
  'a restauração deve ser administrativa e reconstruir o estado anterior por entidade',
)

assert.match(
  commercialHistoryMigration,
  /create or replace function private\.audit_row_change[\s\S]+?commission_installments[\s\S]+?commission_splits[\s\S]+?actor_id/,
  'a auditoria deve atribuir empresa às filhas de comissão e preservar o autor',
)

assert.match(
  commercialHistoryMigration,
  /private\.record_history_restore[\s\S]+?'restore'[\s\S]+?'affectedRows'/,
  'cada restauração deve registrar motivo, ponto escolhido e quantidade afetada',
)

assert.match(
  commercialHistoryMigration,
  /current_setting\('re9\.history_restore'[\s\S]+?private\.can_admin_company[\s\S]+?set_config\('re9\.history_restore', 'on', true\)/,
  'a exceção às proteções de exclusão deve existir apenas na restauração administrativa',
)

assert.match(
  developmentDefaultsMigration,
  /alter column commission_percentage set default 4/,
  'o banco deve aplicar 4% quando a comissão de um novo empreendimento for omitida',
)

assert.match(
  developmentDefaultsMigration,
  /alter column broker_split_percentage set default 2/,
  'o banco deve aplicar 2% quando o repasse de um novo empreendimento for omitido',
)

assert.doesNotMatch(
  developmentDefaultsMigration,
  /update public\.developments/,
  'a migration não deve sobrescrever percentuais históricos',
)

assert.match(
  productionAuditMigration,
  /alter table public\.suppliers[\s\S]+?bank_info[\s\S]+?alter table public\.employees[\s\S]+?hire_date/,
  'campos exibidos nos cadastros devem existir no schema persistido',
)

assert.match(
  productionAuditMigration,
  /alter table public\.invoices[\s\S]+?cnae_code[\s\S]+?taker_address[\s\S]+?cancel_reason/,
  'todos os dados usados na emissão fiscal devem sobreviver à hidratação',
)

assert.match(
  productionAuditMigration,
  /where status = 'simulated'[\s\S]+?invoices_status_check[\s\S]+?'processing'[\s\S]+?'error'/,
  'notas simuladas legadas devem voltar a pendente e o status fictício deve ser removido',
)

assert.match(
  productionAuditMigration,
  /create policy sales_select[\s\S]+?private\.can_read_sale[\s\S]+?create policy commission_installments_select[\s\S]+?private\.can_read_commission/,
  'o RLS deve limitar vendas e o grafo de comissão do corretor ao próprio cadastro',
)

assert.match(
  productionAuditMigration,
  /create policy notifications_insert[\s\S]+?private\.can_manage_finance[\s\S]+?create policy notifications_update[\s\S]+?private\.is_company_member[\s\S]+?grant insert, update on public\.notifications/,
  'notificações do painel devem ser persistíveis por perfis financeiros e marcáveis como lidas',
)

console.log('Migrations: 33 passaram, 0 falharam.')
