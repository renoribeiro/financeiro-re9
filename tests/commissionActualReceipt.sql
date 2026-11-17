-- Executar em uma cópia local, na mesma transação que aplica a migração.
do $$
declare
  company_id_for_test uuid;
  manager_id uuid;
  sale_id_for_test uuid := gen_random_uuid();
  commission_id_for_test uuid := gen_random_uuid();
  first_installment uuid := gen_random_uuid();
  second_installment uuid := gen_random_uuid();
  first_account uuid := gen_random_uuid();
  second_account uuid := gen_random_uuid();
  source_account uuid := gen_random_uuid();
  broker_payable uuid := gen_random_uuid();
  receipt_request uuid := gen_random_uuid();
  link_request uuid := gen_random_uuid();
  source_receipt public.settlements;
  original_cash public.transactions;
  cash_after public.transactions;
  result public.receivables;
  old_updated_at timestamptz;
  failed boolean;
  income_before bigint;
begin
  select m.company_id, m.user_id into strict company_id_for_test, manager_id
    from public.company_members m where m.role = 'super_admin' limit 1;
  insert into public.sales(id, company_id, sale_value, buyer_name, commission_calculation_mode, commission_amount_override)
    values (sale_id_for_test, company_id_for_test, 20000, 'Teste de conciliação', 'manual_amount', 2000);
  insert into public.commissions(id, company_id, sale_id, total_amount, receipt_type, status)
    values (commission_id_for_test, company_id_for_test, sale_id_for_test, 2000, 'launch_passthrough', 'pending');
  insert into public.payables(id, company_id, description, amount, due_date)
    values (broker_payable, company_id_for_test, 'Repasse de teste', 1000, current_date);
  insert into public.commission_splits(commission_id, beneficiary_type, amount, payable_id, status)
    values (commission_id_for_test, 'broker', 1000, broker_payable, 'pending');
  insert into public.receivables(id, company_id, sale_id, description, amount, due_date, invoice_rule)
    values
      (first_account, company_id_for_test, sale_id_for_test, 'Parcela 1', 1000, current_date, 'none'),
      (second_account, company_id_for_test, sale_id_for_test, 'Parcela 2', 1000, current_date, 'none'),
      (source_account, company_id_for_test, null, 'Depósito já lançado', 1200, current_date, 'none');
  insert into public.commission_installments(id, commission_id, installment_number, amount, status, receivable_id)
    values
      (first_installment, commission_id_for_test, 1, 1000, 'pending', first_account),
      (second_installment, commission_id_for_test, 2, 1000, 'pending', second_account);
  update public.receivables set commission_installment_id = first_installment where id = first_account;
  update public.receivables set commission_installment_id = second_installment where id = second_account;

  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  execute 'set local role authenticated';
  failed := false;
  begin
    perform public.record_commission_receipt(first_installment, 400, 0, current_date, 'pix',
      null, null, false, 'Teste de permissão', gen_random_uuid(), null);
  exception when raise_exception then
    failed := sqlerrm = 'Parcela indisponível ou acesso negado';
  end;
  assert failed, 'usuário de outra empresa não pode registrar a baixa';
  perform set_config('request.jwt.claim.sub', manager_id::text, true);

  failed := false;
  begin
    perform public.record_commission_receipt(first_installment, 400, 0, current_date, 'pix',
      null, null, true, '', gen_random_uuid(), null);
  exception when raise_exception then
    failed := sqlerrm = 'Informe o motivo da diferença ou do vínculo com o depósito existente';
  end;
  assert failed, 'quitações com valor diferente exigem justificativa';

  select * into result from public.record_commission_receipt(first_installment, 400, 100,
    current_date, 'transfer', 'Conta da RE9', null, true, 'O corretor recebeu direto', receipt_request, null);
  assert result.status = 'partial' and result.received_amount = 400 and result.amount = 500,
    'baixa parcial deve deixar apenas o saldo informado';
  assert (select status from public.payables where id = broker_payable) = 'cancelled',
    'repasse aberto deve ser cancelado';
  assert (select paid_by_builder from public.commission_splits where commission_id = commission_id_for_test),
    'repasse externo deve aparecer no histórico da comissão';
  assert not exists (select 1 from public.settlements where payable_id = broker_payable),
    'repasse externo não deve criar baixa de saída';
  perform public.record_commission_receipt(first_installment, 400, 100,
    current_date, 'transfer', 'Conta da RE9', null, true, 'O corretor recebeu direto', receipt_request, null);
  assert (select count(*) from public.settlements where receivable_id = first_account) = 1,
    'repetir a solicitação deve manter um único depósito';
  assert exists (select 1 from public.settlements s join public.transactions t on t.settlement_id = s.id
    where s.request_id = receipt_request and t.date = current_date
      and (s.settled_at at time zone 'America/Sao_Paulo')::date = current_date),
    'a data informada deve aparecer no caixa e no recebimento em horário de Brasília';
  select updated_at into old_updated_at from public.receivables where id = first_account;
  failed := false;
  begin
    perform public.record_commission_receipt(first_installment, 75, 0, current_date, 'pix',
      null, null, true, 'Ajuste simultâneo', gen_random_uuid(), old_updated_at - interval '1 second');
  exception when raise_exception then
    failed := sqlerrm like 'A parcela mudou%';
  end;
  assert failed, 'alterações concorrentes devem exigir nova conferência';

  select * into result from public.record_commission_receipt(first_installment, 75, 0,
    current_date, 'transfer', null, null, true, 'Quitação com diferença de R$ 25', gen_random_uuid(), old_updated_at);
  assert result.status = 'received' and result.amount = 475 and result.received_amount = 475,
    'quitação deve aceitar depósito abaixo do saldo esperado';
  assert (select status from public.commissions where id = commission_id_for_test) = 'partial',
    'a segunda parcela mantém a comissão parcial';
  assert (select status from public.commission_installments where id = second_installment) = 'pending',
    'a quitação não deve modificar a outra parcela';
  assert exists (select 1 from public.audit_log where entity_type = 'receivables'
    and entity_id = first_account::text and new_data->>'_adjustment_reason' like '%Quitação com diferença%'),
    'a justificativa deve aparecer no histórico';
  select * into source_receipt from public.settlements where request_id = receipt_request;
  perform public.record_commission_receipt(first_installment, null, 0, null, null, null,
    source_receipt.id, true, 'Conferir baixa já vinculada', gen_random_uuid(), null);
  assert (select count(*) from public.settlements where receivable_id = first_account) = 2
    and (select received_amount from public.receivables where id = first_account) = 475,
    'vincular uma baixa que já pertence à parcela não deve somá-la novamente';

  perform public.settle_receivable(source_account, 1200, now(), 'transfer', 'Conta da RE9');
  select * into source_receipt from public.settlements where receivable_id = source_account;
  select * into original_cash from public.transactions where settlement_id = source_receipt.id;
  select count(*) into income_before from public.transactions where company_id = company_id_for_test;
  select * into result from public.record_commission_receipt(second_installment, null, 0,
    null, null, null, source_receipt.id, true, 'Conciliar depósito registrado', link_request, null);
  assert result.status = 'received' and result.amount = 1200 and result.received_amount = 1200,
    'quitação por vínculo deve aceitar valor acima do previsto';
  perform public.record_commission_receipt(second_installment, null, 0,
    null, null, null, source_receipt.id, true, 'Conciliar depósito registrado', link_request, null);
  select * into cash_after from public.transactions where settlement_id = source_receipt.id;
  assert cash_after.receivable_id = second_account
    and (to_jsonb(cash_after) - 'receivable_id') = (to_jsonb(original_cash) - 'receivable_id'),
    'vincular deve manter o ID, valor, data e classificação da entrada original';
  assert (select count(*) from public.transactions where company_id = company_id_for_test) = income_before,
    'vincular não deve criar lançamento';
  assert (select status from public.receivables where id = source_account) = 'cancelled',
    'o título avulso original deve ficar encerrado';
  assert (select status from public.commissions where id = commission_id_for_test) = 'received',
    'a comissão deve fechar depois da última parcela';
  assert (select total_amount from public.commissions where id = commission_id_for_test) = 2000
    and (select commission_amount_override from public.sales where id = sale_id_for_test) = 2000
    and (select sum(amount) from public.commission_installments where commission_id = commission_id_for_test) = 2000,
    'a previsão original deve ser preservada';

  perform public.reverse_receivable_settlement(source_receipt.id, now(), 'Teste de estorno');
  assert (select status from public.receivables where id = second_account) = 'open',
    'estorno do depósito vinculado deve reabrir a parcela de destino';
  assert (select status from public.commissions where id = commission_id_for_test) = 'partial',
    'estorno deve reabrir a comissão sem afetar outra parcela';

  execute 'reset role';
  update public.commission_splits set paid_by_builder = false, status = 'paid', payable_id = broker_payable
    where commission_id = commission_id_for_test;
  update public.payables set status = 'paid', paid_amount = amount where id = broker_payable;
  execute 'set local role authenticated';
  failed := false;
  begin
    perform public.record_commission_receipt(second_installment, 1200, 0, current_date, 'pix',
      null, null, true, 'Repasse externo', gen_random_uuid(), null);
  exception when raise_exception then
    failed := sqlerrm like '%histórico de pagamento pela RE9%';
  end;
  assert failed, 'repasse com pagamento lançado deve exigir revisão manual';
  assert (select received_amount from public.receivables where id = second_account) = 0,
    'a baixa deve ser desfeita integralmente quando o repasse bloquear a operação';
  execute 'reset role';
end;
$$;
