-- Históricos anteriores à migração são restaurados com a coluna ausente (NULL).
alter table public.commission_splits
  add column paid_by_builder boolean default false,
  add constraint commission_splits_builder_payment_check
    check (not paid_by_builder or (beneficiary_type = 'broker' and status = 'not_applicable'));

create table private.commission_receipt_requests (
  id uuid primary key,
  actor_id uuid not null,
  receivable_id uuid not null,
  input jsonb not null
);
revoke all on table private.commission_receipt_requests from public, anon, authenticated;

create function private.record_commission_receipt(
  p_installment uuid,
  p_amount numeric,
  p_remaining numeric,
  p_date date,
  p_method text,
  p_account text,
  p_existing uuid,
  p_paid_by_builder boolean,
  p_reason text,
  p_request uuid,
  p_expected_updated_at timestamptz
) returns public.receivables
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  args jsonb := jsonb_build_array(p_installment, p_amount, p_remaining, p_date,
    p_method, p_account, p_existing, p_paid_by_builder, p_reason, p_expected_updated_at);
  request_row private.commission_receipt_requests;
  installment public.commission_installments;
  commission public.commissions;
  target public.receivables;
  source public.receivables;
  receipt public.settlements;
  original_receivable_id uuid;
  broker public.commission_splits;
  payable public.payables;
  actual numeric;
  received_before numeric;
  new_total numeric;
  last_receipt_at timestamptz;
  reason text := nullif(btrim(p_reason), '');
begin
  if actor is null or p_request is null then
    raise exception 'Acesso negado ou operação inválida';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  select * into request_row from private.commission_receipt_requests where id = p_request;
  if found then
    if request_row.actor_id <> actor or request_row.input is distinct from args then
      raise exception 'Esta chave já foi usada em outro recebimento';
    end if;
    select * into target from public.receivables where id = request_row.receivable_id;
    if not coalesce(private.can_manage_finance(target.company_id), false) then
      raise exception 'Acesso negado';
    end if;
    return target;
  end if;

  select * into installment from public.commission_installments where id = p_installment;
  select * into commission from public.commissions where id = installment.commission_id;
  if commission.id is null or not coalesce(private.can_manage_finance(commission.company_id), false) then
    raise exception 'Parcela indisponível ou acesso negado';
  end if;
  if p_remaining is null or p_remaining not between 0 and 999999999999.99
     or p_remaining <> round(p_remaining, 2) then
    raise exception 'Informe um saldo em aberto válido';
  end if;

  if p_existing is not null then
    select * into receipt from public.settlements where id = p_existing
      and company_id = commission.company_id and type = 'receipt';
    if receipt.id is null or receipt.receivable_id is null then
      raise exception 'Selecione um recebimento da empresa';
    end if;
    original_receivable_id := receipt.receivable_id;
  end if;
  perform 1 from public.receivables
    where company_id = commission.company_id
      and id in (installment.receivable_id, receipt.receivable_id)
    order by id for update;
  select * into target from public.receivables where id = installment.receivable_id
    and company_id = commission.company_id;
  select * into installment from public.commission_installments where id = p_installment for update;
  select * into commission from public.commissions where id = installment.commission_id for update;
  if target.id is null or commission.company_id is distinct from target.company_id
     or target.commission_installment_id is distinct from installment.id
     or installment.receivable_id is distinct from target.id
     or target.sale_id is distinct from commission.sale_id
     or target.status = 'cancelled' or installment.status = 'cancelled'
     or commission.status = 'cancelled' then
    raise exception 'A parcela está cancelada ou o vínculo mudou. Atualize e confira a comissão.';
  end if;
  if p_expected_updated_at is not null and target.updated_at is distinct from p_expected_updated_at then
    raise exception 'A parcela mudou desde que foi aberta. Atualize os dados e confira o saldo.';
  end if;

  received_before := target.received_amount;
  if p_existing is null then
    if target.status = 'received' then
      raise exception 'Esta parcela já está quitada. Selecione um recebimento existente para conferir a baixa.';
    end if;
    if p_amount is null or p_amount not between 0.01 and 999999999999.99
       or p_amount <> round(p_amount, 2) or p_date is null or not isfinite(p_date)
       or p_date > (now() at time zone 'America/Sao_Paulo')::date or p_method is null then
      raise exception 'Informe um valor positivo, a data do depósito e a forma de recebimento';
    end if;
    actual := p_amount;
  else
    select * into receipt from public.settlements where id = p_existing and type = 'receipt'
      and company_id = commission.company_id for update;
    if receipt.id is null or receipt.receivable_id is distinct from original_receivable_id
       or exists (select 1 from public.settlements where reversal_of = receipt.id)
       or (select count(*) from public.transactions t where t.settlement_id = receipt.id) <> 1
       or not exists (
         select 1 from public.transactions t where t.settlement_id = receipt.id
           and t.company_id = target.company_id and t.type = 'income' and not coalesce(t.is_reversal, false)
           and t.amount = receipt.amount and t.receivable_id = receipt.receivable_id
       ) then
      raise exception 'O recebimento foi estornado ou precisa de conciliação manual';
    end if;
    actual := receipt.amount;
    if receipt.receivable_id = target.id then
      received_before := received_before - actual;
    else
      select * into source from public.receivables where id = receipt.receivable_id and company_id = target.company_id;
      if source.id is null or source.status <> 'received' or source.sale_id is not null
         or source.commission_installment_id is not null or source.received_amount <> actual or source.amount <> actual
         or exists (select 1 from public.commission_installments where receivable_id = source.id)
         or exists (select 1 from public.settlements s where s.receivable_id = source.id and s.id <> receipt.id)
         or exists (select 1 from public.transactions t where t.receivable_id = source.id and t.settlement_id is distinct from receipt.id)
         or exists (select 1 from public.invoices i where i.receivable_id = source.id and i.status <> 'cancelled')
         or target.status = 'received' then
        raise exception 'Este lançamento já tem vínculo ou histórico que exige conciliação manual';
      end if;
    end if;
  end if;

  new_total := received_before + actual + p_remaining;
  if received_before < 0 or new_total > 999999999999.99 then
    raise exception 'O valor total está fora do limite permitido';
  end if;
  if (new_total <> target.amount or actual <> target.amount - received_before or p_existing is not null)
     and reason is null then
    raise exception 'Informe o motivo da diferença ou do vínculo com o depósito existente';
  end if;
  if new_total <> target.amount and exists (
    select 1 from public.invoices i where i.receivable_id = target.id and i.status not in ('cancelled', 'error')
  ) then
    raise exception 'Ajuste o valor com o responsável fiscal. Há uma NFS-e vinculada à parcela.';
  end if;
  if target.status = 'received' and p_remaining > 0 then
    raise exception 'Reabra a conta antes de registrar novo saldo em aberto';
  end if;
  if p_paid_by_builder then
    select * into broker from public.commission_splits
      where commission_id = commission.id and beneficiary_type = 'broker' for update;
    if broker.id is null then
      raise exception 'Esta comissão não tem repasse de corretor cadastrado';
    end if;
    if broker.payable_id is not null then
      select * into payable from public.payables
        where id = broker.payable_id and company_id = target.company_id for update;
      if payable.id is null or payable.status = 'paid' or payable.paid_amount > 0
         or exists (select 1 from public.settlements where payable_id = payable.id) then
        raise exception 'O repasse tem histórico de pagamento pela RE9. Encaminhe para revisão manual.';
      end if;
    end if;
    if broker.status = 'paid' then
      raise exception 'O repasse está marcado como pago pela RE9. Encaminhe para revisão manual.';
    end if;
  end if;

  perform set_config('re9.adjustment_reason', concat_ws(' — ', 'Conciliação de comissão', reason), true);
  if p_paid_by_builder then
    update public.payables set status = 'cancelled', updated_at = now(),
      notes = concat_ws(E'\n', nullif(notes, ''),
        'Repasse pago diretamente pela construtora. Comissão ' || commission.id::text)
      where id = payable.id and status <> 'cancelled';
    update public.commission_splits
      set paid_by_builder = true, status = 'not_applicable', payable_id = null
      where id = broker.id and paid_by_builder is not true;
  end if;

  if p_existing is null then
    -- A baixa padrão grava a movimentação e protege contra repetição.
    update public.receivables set amount = new_total where id = target.id;
    perform public.settle_receivable(target.id, actual, p_date::timestamp at time zone 'America/Sao_Paulo',
      p_method, nullif(btrim(p_account), ''), null, p_request, reason);
  elsif source.id is not null then
    -- Conserva os IDs, o valor, a data e a classificação da entrada já no caixa.
    update public.settlements set receivable_id = target.id where id = receipt.id;
    update public.transactions set receivable_id = target.id where settlement_id = receipt.id;
    update public.receivables set received_amount = 0, received_at = null,
      status = 'cancelled', updated_at = now(),
      notes = concat_ws(E'\n', nullif(notes, ''), 'Recebimento vinculado à parcela ' || installment.id::text)
      where id = source.id;
  end if;

  select max(s.settled_at) into last_receipt_at from public.settlements s
    where s.receivable_id = target.id and s.type = 'receipt'
      and not exists (select 1 from public.settlements reversal where reversal.reversal_of = s.id);
  update public.receivables set amount = new_total, received_amount = received_before + actual,
    status = case when p_remaining = 0 then 'received' else 'partial' end,
    received_at = case when p_remaining = 0 then last_receipt_at else null end,
    updated_at = now()
    where id = target.id returning * into target;
  update public.commission_installments set status = case when p_remaining = 0 then 'received' else 'pending' end,
    received_date = case when p_remaining = 0 then (last_receipt_at at time zone 'UTC')::date else null end
    where id = installment.id;
  update public.commissions set status = case
    when not exists (select 1 from public.commission_installments where commission_id = commission.id
      and status <> 'received') then 'received'
    else 'partial'
  end where id = commission.id;
  insert into private.commission_receipt_requests values (p_request, actor, target.id, args);
  return target;
end;
$$;

create function public.record_commission_receipt(
  p_installment uuid, p_amount numeric, p_remaining numeric, p_date date, p_method text,
  p_account text, p_existing uuid, p_paid_by_builder boolean, p_reason text, p_request uuid,
  p_expected_updated_at timestamptz
) returns public.receivables
language sql
security invoker
set search_path = ''
as $$
  select private.record_commission_receipt(p_installment, p_amount, p_remaining, p_date,
    p_method, p_account, p_existing, p_paid_by_builder, p_reason, p_request, p_expected_updated_at);
$$;

revoke all on function private.record_commission_receipt(uuid,numeric,numeric,date,text,text,uuid,boolean,text,uuid,timestamptz) from public, anon;
revoke all on function public.record_commission_receipt(uuid,numeric,numeric,date,text,text,uuid,boolean,text,uuid,timestamptz) from public, anon;
grant execute on function private.record_commission_receipt(uuid,numeric,numeric,date,text,text,uuid,boolean,text,uuid,timestamptz) to authenticated;
grant execute on function public.record_commission_receipt(uuid,numeric,numeric,date,text,text,uuid,boolean,text,uuid,timestamptz) to authenticated;
