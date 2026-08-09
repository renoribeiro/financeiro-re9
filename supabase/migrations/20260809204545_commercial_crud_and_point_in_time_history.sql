-- Commercial CRUD, atomic sale -> commission -> receivable graph and
-- application-level point-in-time restoration.

-- ---------------------------------------------------------------------------
-- Authorization and graph helpers. SECURITY DEFINER is kept in the private
-- schema and every entry point validates auth.uid() and the company role.
-- ---------------------------------------------------------------------------

create or replace function private.can_operate_sale(target_company uuid, target_broker uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and (
      private.can_manage_finance(target_company)
      or exists (
        select 1
          from public.company_members cm
          join public.employees e
            on e.company_id = cm.company_id
           and e.user_id = cm.user_id
         where cm.company_id = target_company
           and cm.user_id = (select auth.uid())
           and cm.role = 'broker'
           and e.id = target_broker
      )
    );
$$;

create or replace function private.commission_has_financial_activity(target_commission uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with linked_receivables as (
    select ci.receivable_id as id
      from public.commission_installments ci
     where ci.commission_id = target_commission
       and ci.receivable_id is not null
  ), linked_payables as (
    select cs.payable_id as id
      from public.commission_splits cs
     where cs.commission_id = target_commission
       and cs.payable_id is not null
  )
  select
    exists (
      select 1 from public.commissions c
       where c.id = target_commission and c.status in ('partial', 'received')
    )
    or exists (
      select 1
        from public.commission_installments ci
       where ci.commission_id = target_commission
         and (ci.status = 'received' or ci.received_date is not null)
    )
    or exists (
      select 1 from public.receivables r
       where r.id in (select id from linked_receivables)
         and (r.status in ('partial', 'received') or r.received_at is not null)
    )
    or exists (
      select 1 from public.payables p
       where p.id in (select id from linked_payables)
         and (p.status = 'paid' or p.paid_at is not null)
    )
    or exists (
      select 1 from public.settlements s
       where s.receivable_id in (select id from linked_receivables)
          or s.payable_id in (select id from linked_payables)
    )
    or exists (
      select 1 from public.transactions t
       where t.receivable_id in (select id from linked_receivables)
          or t.payable_id in (select id from linked_payables)
    )
    or exists (
      select 1 from public.invoices i
       where i.receivable_id in (select id from linked_receivables)
         and i.status not in ('cancelled', 'error')
    );
$$;

create or replace function private.delete_commission_graph(target_commission uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  receivable_ids uuid[];
  payable_ids uuid[];
begin
  if private.commission_has_financial_activity(target_commission) then
    raise exception 'A comissão possui recebimento, pagamento, transação ou nota fiscal. Estorne/reabra os lançamentos antes de editar ou excluir.';
  end if;

  select coalesce(array_agg(ci.receivable_id) filter (where ci.receivable_id is not null), array[]::uuid[])
    into receivable_ids
    from public.commission_installments ci
   where ci.commission_id = target_commission;

  select coalesce(array_agg(cs.payable_id) filter (where cs.payable_id is not null), array[]::uuid[])
    into payable_ids
    from public.commission_splits cs
   where cs.commission_id = target_commission;

  -- Remove os vínculos comerciais antes de acionar as proteções de exclusão
  -- das contas financeiras. A trilha de auditoria registra cada etapa.
  update public.receivables
     set sale_id = null,
         commission_installment_id = null
   where id = any(receivable_ids);

  delete from public.commissions where id = target_commission;
  delete from public.payables where id = any(payable_ids);
  delete from public.receivables where id = any(receivable_ids);
end;
$$;

create or replace function private.create_commission_graph(
  target_sale uuid,
  installment_count integer default 1,
  manager_percentage numeric default 0,
  captador_percentage numeric default 0,
  total_override numeric default null,
  receipt_override text default null,
  first_due_date date default null,
  commission_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.sales;
  d public.developments;
  commission_id uuid;
  receivable_id uuid;
  installment_id uuid;
  payable_id uuid;
  total numeric(18,2);
  broker_pct numeric := 0;
  brokerage_pct numeric;
  receipt text;
  installment_amount numeric(18,2);
  allocated numeric(18,2) := 0;
  n integer;
  due_date date;
begin
  select * into s from public.sales where id = target_sale for update;
  if s.id is null then raise exception 'Venda não encontrada'; end if;
  if not private.can_operate_sale(s.company_id, s.broker_id) then raise exception 'Acesso negado'; end if;
  if exists (select 1 from public.commissions where sale_id = s.id) then
    raise exception 'A venda já possui comissão';
  end if;

  select * into d from public.developments where id = s.development_id;
  if d.id is null or d.company_id <> s.company_id then raise exception 'Empreendimento inválido'; end if;

  installment_count := greatest(1, least(120, coalesce(installment_count, 1)));
  manager_percentage := greatest(0, coalesce(manager_percentage, 0));
  captador_percentage := greatest(0, coalesce(captador_percentage, 0));
  broker_pct := coalesce(d.broker_split_percentage, 0);
  if broker_pct + manager_percentage + captador_percentage > 100 then
    raise exception 'A soma dos percentuais de comissão excede 100%%';
  end if;

  brokerage_pct := 100 - broker_pct - manager_percentage - captador_percentage;
  total := round(coalesce(total_override, s.sale_value * coalesce(d.commission_percentage, 0) / 100), 2);
  if total <= 0 then raise exception 'Comissão calculada deve ser positiva'; end if;
  receipt := coalesce(
    receipt_override,
    case when d.type = 'launch' then 'launch_passthrough' else 'resale_consolidated' end
  );
  if receipt not in ('launch_passthrough', 'resale_consolidated', 'resale_split') then
    raise exception 'Modelo de recebimento inválido';
  end if;

  insert into public.commissions(company_id, sale_id, total_amount, receipt_type, status, notes)
  values (s.company_id, s.id, total, receipt, 'pending', commission_notes)
  returning id into commission_id;

  for n in 1..installment_count loop
    due_date := coalesce(first_due_date, (coalesce(s.sale_date, current_date) + interval '1 month')::date)
      + make_interval(months => n - 1);
    installment_amount := case
      when n = installment_count then total - allocated
      else round(total / installment_count, 2)
    end;
    allocated := allocated + installment_amount;

    insert into public.receivables(
      company_id, client_name, client_document, sale_id, description, amount,
      due_date, competence_date, category_id, cost_center_id, invoice_rule,
      recurrence, status
    ) values (
      s.company_id,
      case when receipt = 'launch_passthrough' then d.developer else s.buyer_name end,
      s.buyer_document,
      s.id,
      'Comissão ' || d.name || ' — ' || coalesce(s.buyer_name, '') ||
        case when installment_count > 1 then format(' (%s/%s)', n, installment_count) else '' end,
      installment_amount,
      due_date,
      s.sale_date,
      (
        select id from public.chart_accounts
         where company_id = s.company_id and type = 'revenue'
         order by (name ilike '%comiss%') desc, code nulls last
         limit 1
      ),
      (select id from public.cost_centers where company_id = s.company_id order by created_at limit 1),
      'on_receive',
      'once',
      'open'
    ) returning id into receivable_id;

    insert into public.commission_installments(
      commission_id, installment_number, amount, expected_date, status, receivable_id
    ) values (commission_id, n, installment_amount, due_date, 'pending', receivable_id)
    returning id into installment_id;

    update public.receivables
       set commission_installment_id = installment_id
     where id = receivable_id;
  end loop;

  insert into public.commission_splits(commission_id, beneficiary_type, percentage, amount, status)
  values (commission_id, 'brokerage', brokerage_pct, round(total * brokerage_pct / 100, 2), 'not_applicable');

  if broker_pct > 0 then
    insert into public.payables(
      company_id, employee_id, description, amount, due_date, category_id,
      cost_center_id, recurrence, status, notes
    ) values (
      s.company_id,
      s.broker_id,
      'Repasse comissão — ' || coalesce(s.buyer_name, ''),
      round(total * broker_pct / 100, 2),
      coalesce(first_due_date, (coalesce(s.sale_date, current_date) + interval '1 month')::date),
      (
        select id from public.chart_accounts
         where company_id = s.company_id and type = 'expense' and name ilike '%repasse%'
         order by code nulls last limit 1
      ),
      (select id from public.cost_centers where company_id = s.company_id order by created_at limit 1),
      'once',
      'open',
      'Executar após recebimento da comissão.'
    ) returning id into payable_id;
  end if;

  insert into public.commission_splits(
    commission_id, beneficiary_type, beneficiary_id, percentage, amount, payable_id, status
  ) values (
    commission_id,
    'broker',
    s.broker_id,
    broker_pct,
    round(total * broker_pct / 100, 2),
    payable_id,
    case when payable_id is null then 'not_applicable' else 'pending' end
  );

  if manager_percentage > 0 then
    insert into public.commission_splits(commission_id, beneficiary_type, percentage, amount, status)
    values (commission_id, 'manager', manager_percentage, round(total * manager_percentage / 100, 2), 'pending');
  end if;
  if captador_percentage > 0 then
    insert into public.commission_splits(commission_id, beneficiary_type, percentage, amount, status)
    values (commission_id, 'captador', captador_percentage, round(total * captador_percentage / 100, 2), 'pending');
  end if;

  return commission_id;
end;
$$;

-- The existing RPC keeps its public signature, but delegates to the checked
-- private implementation so a broker can create the graph only for own sales.
create or replace function public.generate_commission_for_sale(
  target_sale uuid,
  installment_count integer default 1,
  manager_percentage numeric default 0,
  captador_percentage numeric default 0
) returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_commission_graph(
    target_sale,
    installment_count,
    manager_percentage,
    captador_percentage,
    null,
    null,
    null,
    null
  );
$$;

create or replace function private.save_sale_graph(
  target_id uuid,
  payload jsonb,
  generate_commission boolean,
  installment_count integer,
  manager_percentage numeric,
  captador_percentage numeric
) returns public.sales
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_sale public.sales;
  saved public.sales;
  current_commission public.commissions;
  target_company uuid;
  target_broker uuid;
  target_development uuid;
  target_value numeric;
  target_buyer text;
  target_buyer_document text;
  target_buyer_contact text;
  target_unit text;
  target_payment_method text;
  target_sale_date date;
  target_status text;
  target_notes text;
  current_installments integer := 0;
  current_manager numeric := 0;
  current_captador numeric := 0;
  graph_changed boolean := false;
begin
  if target_id is not null then
    select * into current_sale from public.sales where id = target_id for update;
    if current_sale.id is null then raise exception 'Venda não encontrada'; end if;
  end if;

  target_company := coalesce(nullif(payload->>'companyId', '')::uuid, current_sale.company_id);
  target_broker := coalesce(nullif(payload->>'brokerId', '')::uuid, current_sale.broker_id);
  target_development := coalesce(nullif(payload->>'developmentId', '')::uuid, current_sale.development_id);
  target_value := coalesce(nullif(payload->>'saleValue', '')::numeric, current_sale.sale_value);
  target_buyer := coalesce(payload->>'buyerName', current_sale.buyer_name);
  target_buyer_document := coalesce(payload->>'buyerDocument', current_sale.buyer_document);
  target_buyer_contact := coalesce(payload->>'buyerContact', current_sale.buyer_contact);
  target_unit := coalesce(payload->>'unit', current_sale.unit);
  target_payment_method := coalesce(payload->>'paymentMethod', current_sale.payment_method, 'cash');
  target_sale_date := coalesce(nullif(payload->>'saleDate', '')::date, current_sale.sale_date, current_date);
  target_status := coalesce(payload->>'status', current_sale.status, 'in_progress');
  target_notes := coalesce(payload->>'notes', current_sale.notes);

  if target_company is null or target_broker is null or target_development is null
     or target_value is null or target_value <= 0 or nullif(trim(target_buyer), '') is null then
    raise exception 'Dados obrigatórios da venda não foram informados';
  end if;
  if target_status not in ('in_progress', 'completed', 'cancelled') then
    raise exception 'Status da venda inválido';
  end if;
  if not exists (
    select 1 from public.developments d
     where d.id = target_development and d.company_id = target_company
  ) then
    raise exception 'Empreendimento não pertence à empresa selecionada';
  end if;
  if not exists (
    select 1 from public.employees e
     where e.id = target_broker and e.company_id = target_company
  ) then
    raise exception 'Corretor não pertence à empresa selecionada';
  end if;
  if not private.can_operate_sale(target_company, target_broker) then raise exception 'Acesso negado'; end if;
  if target_id is not null and not private.can_manage_finance(target_company)
     and target_broker is distinct from current_sale.broker_id then
    raise exception 'O corretor não pode reatribuir a venda';
  end if;

  if target_id is null then
    insert into public.sales(
      company_id, development_id, unit, sale_value, buyer_name, buyer_document,
      buyer_contact, payment_method, broker_id, sale_date, status, notes
    ) values (
      target_company, target_development, target_unit, target_value, target_buyer,
      target_buyer_document, target_buyer_contact, target_payment_method,
      target_broker, target_sale_date, target_status, target_notes
    ) returning * into saved;

    if generate_commission and target_status <> 'cancelled' then
      perform private.create_commission_graph(
        saved.id, installment_count, manager_percentage, captador_percentage,
        null, null, null, null
      );
    end if;
    return saved;
  end if;

  select * into current_commission from public.commissions where sale_id = current_sale.id;
  if current_commission.id is not null then
    select count(*) into current_installments
      from public.commission_installments where commission_id = current_commission.id;
    select coalesce(max(percentage), 0) into current_manager
      from public.commission_splits
     where commission_id = current_commission.id and beneficiary_type = 'manager';
    select coalesce(max(percentage), 0) into current_captador
      from public.commission_splits
     where commission_id = current_commission.id and beneficiary_type = 'captador';

    graph_changed :=
      target_development is distinct from current_sale.development_id
      or target_value is distinct from current_sale.sale_value
      or target_buyer is distinct from current_sale.buyer_name
      or target_buyer_document is distinct from current_sale.buyer_document
      or target_broker is distinct from current_sale.broker_id
      or target_sale_date is distinct from current_sale.sale_date
      or greatest(1, coalesce(installment_count, 1)) is distinct from current_installments
      or greatest(0, coalesce(manager_percentage, 0)) is distinct from current_manager
      or greatest(0, coalesce(captador_percentage, 0)) is distinct from current_captador
      or target_status = 'cancelled';

    if graph_changed then
      perform private.delete_commission_graph(current_commission.id);
    end if;
  end if;

  update public.sales
     set development_id = target_development,
         unit = target_unit,
         sale_value = target_value,
         buyer_name = target_buyer,
         buyer_document = target_buyer_document,
         buyer_contact = target_buyer_contact,
         payment_method = target_payment_method,
         broker_id = target_broker,
         sale_date = target_sale_date,
         status = target_status,
         notes = target_notes
   where id = current_sale.id
   returning * into saved;

  if generate_commission and target_status <> 'cancelled'
     and (current_commission.id is null or graph_changed) then
    perform private.create_commission_graph(
      saved.id, installment_count, manager_percentage, captador_percentage,
      null, null, null, null
    );
  end if;

  return saved;
end;
$$;

create or replace function public.save_sale_with_commission(
  target_id uuid,
  payload jsonb,
  generate_commission boolean default true,
  installment_count integer default 1,
  manager_percentage numeric default 0,
  captador_percentage numeric default 0
) returns public.sales
language sql
security invoker
set search_path = ''
as $$
  select private.save_sale_graph(
    target_id,
    payload,
    generate_commission,
    installment_count,
    manager_percentage,
    captador_percentage
  );
$$;

create or replace function private.update_commission_graph_authorized(
  target_id uuid,
  total_amount numeric,
  receipt_type text,
  installment_count integer,
  first_due_date date,
  manager_percentage numeric default 0,
  captador_percentage numeric default 0,
  commission_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare c public.commissions;
begin
  select * into c from public.commissions where id = target_id;
  if c.id is null then raise exception 'Comissão não encontrada'; end if;
  if not private.can_manage_finance(c.company_id) then raise exception 'Acesso negado'; end if;
  if total_amount <= 0 then raise exception 'O valor da comissão deve ser positivo'; end if;
  if installment_count < 1 or installment_count > 120 then raise exception 'Quantidade de parcelas inválida'; end if;

  perform private.delete_commission_graph(c.id);
  return private.create_commission_graph(
    c.sale_id,
    installment_count,
    manager_percentage,
    captador_percentage,
    total_amount,
    receipt_type,
    first_due_date,
    commission_notes
  );
end;
$$;

create or replace function public.update_commission_entry(
  target_id uuid,
  total_amount numeric,
  receipt_type text,
  installment_count integer,
  first_due_date date,
  manager_percentage numeric default 0,
  captador_percentage numeric default 0,
  commission_notes text default null
) returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.update_commission_graph_authorized(
    target_id,
    total_amount,
    receipt_type,
    installment_count,
    first_due_date,
    manager_percentage,
    captador_percentage,
    commission_notes
  );
$$;

create or replace function private.delete_commission_graph_authorized(target_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare c public.commissions;
begin
  select * into c from public.commissions where id = target_id;
  if c.id is null then raise exception 'Comissão não encontrada'; end if;
  if not private.can_admin_company(c.company_id) then raise exception 'Apenas administradores podem excluir comissões'; end if;
  perform private.delete_commission_graph(c.id);
  return target_id;
end;
$$;

create or replace function public.delete_commission_entry(target_id uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.delete_commission_graph_authorized(target_id);
$$;

create or replace function private.delete_sale_graph_authorized(target_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare s public.sales;
declare c public.commissions;
begin
  select * into s from public.sales where id = target_id for update;
  if s.id is null then raise exception 'Venda não encontrada'; end if;
  if not private.can_admin_company(s.company_id) then raise exception 'Apenas administradores podem excluir vendas'; end if;

  select * into c from public.commissions where sale_id = s.id;
  if c.id is not null then perform private.delete_commission_graph(c.id); end if;
  if exists (select 1 from public.receivables where sale_id = s.id) then
    raise exception 'A venda ainda possui contas a receber não vinculadas à comissão';
  end if;

  update public.funnel_cards set sale_id = null where sale_id = s.id;
  delete from public.sales where id = s.id;
  return target_id;
end;
$$;

create or replace function public.delete_sale_entry(target_id uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.delete_sale_graph_authorized(target_id);
$$;

-- ---------------------------------------------------------------------------
-- Complete audit trail: resolve company for child rows and allow finance users
-- to inspect history. The trigger remains the only writer to audit_log.
-- ---------------------------------------------------------------------------

create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_row jsonb;
  new_row jsonb;
  cid uuid;
  eid text;
  parent_commission text;
begin
  old_row := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  new_row := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  eid := coalesce(new_row->>'id', old_row->>'id');
  cid := coalesce(
    nullif(new_row->>'company_id', '')::uuid,
    nullif(old_row->>'company_id', '')::uuid,
    case when tg_table_name = 'companies'
      then coalesce(nullif(new_row->>'id', '')::uuid, nullif(old_row->>'id', '')::uuid)
    end
  );

  if cid is null and tg_table_name in ('commission_installments', 'commission_splits') then
    parent_commission := coalesce(new_row->>'commission_id', old_row->>'commission_id');
    select c.company_id into cid
      from public.commissions c
     where c.id::text = parent_commission;
    if cid is null then
      select coalesce(
               nullif(a.new_data->>'company_id', '')::uuid,
               nullif(a.old_data->>'company_id', '')::uuid
             )
        into cid
        from public.audit_log a
       where a.entity_type = 'commissions'
         and a.entity_id = parent_commission
       order by a.id desc
       limit 1;
    end if;
  end if;

  if cid is null and tg_table_name = 'funnel_history' then
    select fc.company_id into cid
      from public.funnel_cards fc
     where fc.id::text = coalesce(new_row->>'card_id', old_row->>'card_id');
  end if;

  insert into public.audit_log(
    company_id, actor_id, action, entity_type, entity_id,
    old_data, new_data, request_id
  ) values (
    cid,
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    eid,
    old_row,
    new_row,
    nullif(nullif(current_setting('request.headers', true), '')::jsonb->>'x-request-id', '')
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Backfill company_id for historical commission child events whenever the
-- parent commission can be resolved from the durable audit trail.
update public.audit_log child
   set company_id = (
     select coalesce(
              nullif(a.new_data->>'company_id', '')::uuid,
              nullif(a.old_data->>'company_id', '')::uuid
            )
       from public.audit_log a
      where a.entity_type = 'commissions'
        and a.entity_id = coalesce(child.new_data->>'commission_id', child.old_data->>'commission_id')
      order by a.id desc
      limit 1
   )
 where child.company_id is null
   and child.entity_type in ('commission_installments', 'commission_splits')
   and exists (
     select 1
       from public.audit_log a
      where a.entity_type = 'commissions'
        and a.entity_id = coalesce(child.new_data->>'commission_id', child.old_data->>'commission_id')
        and coalesce(a.new_data->>'company_id', a.old_data->>'company_id') is not null
   );

drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated
  using (private.has_company_role(company_id, array['super_admin', 'admin', 'financial', 'accountant']));

-- During an authorized history restore, linked financial rows may need to be
-- removed together with their commercial parents. The custom transaction flag
-- is accepted only for company administrators; normal deletes keep every
-- existing protection from the hardened CRUD migration.
create or replace function private.guard_financial_account_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_setting('re9.history_restore', true) = 'on' then
    if not private.can_admin_company(old.company_id) then
      raise exception 'Apenas administradores podem restaurar contas financeiras';
    end if;
    return old;
  end if;

  if tg_table_name = 'payables' then
    if old.paid_amount > 0
       or old.status in ('partial', 'paid')
       or exists (select 1 from public.settlements s where s.payable_id = old.id)
       or exists (select 1 from public.transactions t where t.payable_id = old.id) then
      raise exception 'Conta com pagamento não pode ser excluída; estorne ou preserve o histórico';
    end if;
    if exists (select 1 from public.commission_splits cs where cs.payable_id = old.id) then
      raise exception 'Conta vinculada a comissão não pode ser excluída';
    end if;
    if exists (select 1 from public.payables child where child.parent_payable_id = old.id) then
      raise exception 'Conta com parcelas vinculadas não pode ser excluída individualmente';
    end if;
  elsif tg_table_name = 'receivables' then
    if old.received_amount > 0
       or old.status in ('partial', 'received')
       or exists (select 1 from public.settlements s where s.receivable_id = old.id)
       or exists (select 1 from public.transactions t where t.receivable_id = old.id) then
      raise exception 'Conta com recebimento não pode ser excluída; estorne ou preserve o histórico';
    end if;
    if exists (select 1 from public.invoices i where i.receivable_id = old.id) then
      raise exception 'Conta com NFS-e vinculada não pode ser excluída';
    end if;
    if old.sale_id is not null
       or old.commission_installment_id is not null
       or exists (
         select 1 from public.commission_installments ci where ci.receivable_id = old.id
       ) then
      raise exception 'Conta vinculada a venda ou comissão não pode ser excluída';
    end if;
  else
    raise exception 'Tabela financeira não suportada';
  end if;

  return old;
end;
$$;

create or replace function private.record_history_restore(
  target_company uuid,
  target_audit_id bigint,
  restore_reason text,
  affected_rows integer
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_admin_company(target_company) then
    raise exception 'Apenas administradores podem restaurar o histórico';
  end if;
  insert into public.audit_log(
    company_id, actor_id, action, entity_type, entity_id, new_data
  ) values (
    target_company,
    (select auth.uid()),
    'restore',
    'history',
    target_audit_id::text,
    jsonb_build_object(
      'targetAuditId', target_audit_id,
      'reason', trim(restore_reason),
      'affectedRows', affected_rows
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Point-in-time restore. The selected audit id means "state immediately after
-- this event". All later changes are inverted from the earliest old_data for
-- each affected row. Restorations are audited like any other change, so they
-- can themselves be reversed later.
-- ---------------------------------------------------------------------------

create or replace function public.restore_company_to_history_point(
  target_audit_id bigint,
  restore_reason text
) returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_company uuid;
  affected integer := 0;
  table_name text;
  row_data record;
  column_list text;
  update_list text;
  supported_tables constant text[] := array[
    'chart_accounts', 'cost_centers', 'suppliers', 'clients', 'employees',
    'developments', 'sales', 'commissions', 'payables', 'receivables',
    'commission_installments', 'commission_splits', 'transactions',
    'funnel_cards', 'funnel_history', 'invoices', 'notification_rules',
    'settlements'
  ];
  delete_order constant text[] := array[
    'settlements', 'transactions', 'invoices', 'commission_splits',
    'commission_installments', 'receivables', 'payables', 'commissions',
    'funnel_history', 'funnel_cards', 'sales', 'developments', 'employees',
    'clients', 'suppliers', 'cost_centers', 'chart_accounts', 'notification_rules'
  ];
  upsert_order constant text[] := array[
    'chart_accounts', 'cost_centers', 'suppliers', 'clients', 'employees',
    'developments', 'sales', 'commissions', 'payables', 'receivables',
    'commission_installments', 'commission_splits', 'transactions',
    'funnel_cards', 'funnel_history', 'invoices', 'notification_rules',
    'settlements'
  ];
begin
  if nullif(trim(restore_reason), '') is null then
    raise exception 'Informe o motivo da restauração';
  end if;

  select company_id into target_company
    from public.audit_log
   where id = target_audit_id;
  if target_company is null then raise exception 'Ponto do histórico não encontrado'; end if;
  if not private.can_admin_company(target_company) then
    raise exception 'Apenas administradores podem restaurar o histórico';
  end if;
  perform set_config('re9.history_restore', 'on', true);

  if exists (
    select 1
      from public.audit_log a
     where a.company_id = target_company
       and a.id > target_audit_id
       and a.entity_type <> all(supported_tables)
       and a.entity_type <> 'history'
  ) then
    raise exception 'Existem alterações posteriores que não podem ser restauradas com segurança';
  end if;

  create temporary table if not exists re9_restore_rows (
    entity_type text not null,
    entity_id text not null,
    target_data jsonb,
    primary key (entity_type, entity_id)
  ) on commit drop;
  truncate re9_restore_rows;

  insert into re9_restore_rows(entity_type, entity_id, target_data)
  select distinct on (a.entity_type, a.entity_id)
         a.entity_type,
         a.entity_id,
         a.old_data
    from public.audit_log a
   where a.company_id = target_company
     and a.id > target_audit_id
     and a.entity_type = any(supported_tables)
     and a.entity_id is not null
   order by a.entity_type, a.entity_id, a.id asc;

  -- Rows absent at the selected point were inserted later: remove child-first.
  foreach table_name in array delete_order loop
    for row_data in
      select entity_id from re9_restore_rows
       where entity_type = table_name and target_data is null
    loop
      execute format('delete from public.%I where id::text = $1', table_name)
        using row_data.entity_id;
      affected := affected + 1;
    end loop;
  end loop;

  -- Rows present at the selected point are reinserted or fully updated.
  foreach table_name in array upsert_order loop
    select
      string_agg(format('%I', a.attname), ', ' order by a.attnum),
      string_agg(format('%1$I = excluded.%1$I', a.attname), ', ' order by a.attnum)
        filter (where a.attname <> 'id')
      into column_list, update_list
      from pg_catalog.pg_attribute a
     where a.attrelid = format('public.%I', table_name)::regclass
       and a.attnum > 0
       and not a.attisdropped
       and a.attgenerated = '';

    for row_data in
      select entity_id, target_data from re9_restore_rows
       where entity_type = table_name and target_data is not null
    loop
      execute format(
        'insert into public.%1$I (%2$s) '
        || 'select %2$s from jsonb_populate_record(null::public.%1$I, $1) '
        || 'on conflict (id) do update set %3$s',
        table_name,
        column_list,
        update_list
      ) using row_data.target_data;
      affected := affected + 1;
    end loop;
  end loop;

  perform private.record_history_restore(
    target_company,
    target_audit_id,
    restore_reason,
    affected
  );

  return affected;
end;
$$;

revoke all on function private.can_operate_sale(uuid, uuid) from public, anon, authenticated;
revoke all on function private.commission_has_financial_activity(uuid) from public, anon, authenticated;
revoke all on function private.delete_commission_graph(uuid) from public, anon, authenticated;
revoke all on function private.create_commission_graph(uuid, integer, numeric, numeric, numeric, text, date, text) from public, anon, authenticated;
revoke all on function private.save_sale_graph(uuid, jsonb, boolean, integer, numeric, numeric) from public, anon, authenticated;
revoke all on function private.update_commission_graph_authorized(uuid, numeric, text, integer, date, numeric, numeric, text) from public, anon, authenticated;
revoke all on function private.delete_commission_graph_authorized(uuid) from public, anon, authenticated;
revoke all on function private.delete_sale_graph_authorized(uuid) from public, anon, authenticated;
revoke all on function private.record_history_restore(uuid, bigint, text, integer) from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.create_commission_graph(uuid, integer, numeric, numeric, numeric, text, date, text) to authenticated;
grant execute on function private.save_sale_graph(uuid, jsonb, boolean, integer, numeric, numeric) to authenticated;
grant execute on function private.update_commission_graph_authorized(uuid, numeric, text, integer, date, numeric, numeric, text) to authenticated;
grant execute on function private.delete_commission_graph_authorized(uuid) to authenticated;
grant execute on function private.delete_sale_graph_authorized(uuid) to authenticated;
grant execute on function private.record_history_restore(uuid, bigint, text, integer) to authenticated;

revoke all on function public.generate_commission_for_sale(uuid, integer, numeric, numeric) from public, anon;
revoke all on function public.save_sale_with_commission(uuid, jsonb, boolean, integer, numeric, numeric) from public, anon;
revoke all on function public.update_commission_entry(uuid, numeric, text, integer, date, numeric, numeric, text) from public, anon;
revoke all on function public.delete_commission_entry(uuid) from public, anon;
revoke all on function public.delete_sale_entry(uuid) from public, anon;
revoke all on function public.restore_company_to_history_point(bigint, text) from public, anon;

grant execute on function public.generate_commission_for_sale(uuid, integer, numeric, numeric) to authenticated;
grant execute on function public.save_sale_with_commission(uuid, jsonb, boolean, integer, numeric, numeric) to authenticated;
grant execute on function public.update_commission_entry(uuid, numeric, text, integer, date, numeric, numeric, text) to authenticated;
grant execute on function public.delete_commission_entry(uuid) to authenticated;
grant execute on function public.delete_sale_entry(uuid) to authenticated;
grant execute on function public.restore_company_to_history_point(bigint, text) to authenticated;
