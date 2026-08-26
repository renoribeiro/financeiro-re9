-- Keep sale commission graphs stable across edits and define the broker rate
-- as a percentage of the sale value (VGV), not of the total commission.

create unique index if not exists commission_installments_commission_number_uidx
  on public.commission_installments(commission_id, installment_number);

create unique index if not exists commission_splits_commission_beneficiary_uidx
  on public.commission_splits(commission_id, beneficiary_type);

create or replace function private.sync_commission_graph(
  target_sale uuid,
  target_commission uuid default null,
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
  c public.commissions;
  ci public.commission_installments;
  sp public.commission_splits;
  r public.receivables;
  p public.payables;
  broker_name text;
  linked_receivable_id uuid;
  linked_installment_id uuid;
  linked_payable_id uuid;
  extra_receivable_ids uuid[] := array[]::uuid[];
  total numeric(18,2);
  broker_pct numeric := 0;
  manager_pct numeric := 0;
  captador_pct numeric := 0;
  brokerage_pct numeric := 0;
  broker_amount numeric(18,2) := 0;
  manager_amount numeric(18,2) := 0;
  captador_amount numeric(18,2) := 0;
  brokerage_amount numeric(18,2) := 0;
  receipt text;
  effective_first_due_date date;
  installment_amount numeric(18,2);
  allocated numeric(18,2) := 0;
  n integer;
  calculated_due_date date;
  receivable_description text;
  payable_description text;
begin
  select * into s
    from public.sales
   where id = target_sale
   for update;

  if s.id is null then
    raise exception using message = U&'Venda n\00E3o encontrada';
  end if;

  select * into d
    from public.developments
   where id = s.development_id;

  if d.id is null or d.company_id <> s.company_id then
    raise exception using message = U&'Empreendimento inv\00E1lido';
  end if;

  select full_name into broker_name
    from public.employees
   where id = s.broker_id;

  installment_count := greatest(1, least(120, coalesce(installment_count, 1)));
  manager_pct := greatest(0, coalesce(manager_percentage, 0));
  captador_pct := greatest(0, coalesce(captador_percentage, 0));
  broker_pct := greatest(0, coalesce(d.broker_split_percentage, 0));

  if manager_pct > 100 or captador_pct > 100 or broker_pct > 100 then
    raise exception using message = U&'Percentual de comiss\00E3o inv\00E1lido';
  end if;

  total := round(
    coalesce(total_override, s.sale_value * coalesce(d.commission_percentage, 0) / 100),
    2
  );

  if total <= 0 then
    raise exception using message = U&'Comiss\00E3o calculada deve ser positiva';
  end if;

  if total < installment_count * 0.01 then
    raise exception using message = U&'O valor da comiss\00E3o n\00E3o comporta a quantidade de parcelas';
  end if;

  -- The development broker rate is expressed over the sale value (VGV).
  broker_amount := round(s.sale_value * broker_pct / 100, 2);
  manager_amount := round(total * manager_pct / 100, 2);
  captador_amount := round(total * captador_pct / 100, 2);

  if broker_amount + manager_amount + captador_amount > total then
    raise exception using message = U&'Os repasses excedem a comiss\00E3o total da venda';
  end if;

  brokerage_amount := total - broker_amount - manager_amount - captador_amount;
  brokerage_pct := case
    when total = 0 then 0
    else round(brokerage_amount * 100 / total, 6)
  end;

  receipt := coalesce(
    receipt_override,
    case when d.type = 'launch' then 'launch_passthrough' else 'resale_consolidated' end
  );

  if receipt not in ('launch_passthrough', 'resale_consolidated', 'resale_split') then
    raise exception using message = U&'Modelo de recebimento inv\00E1lido';
  end if;

  if target_commission is null then
    select * into c
      from public.commissions
     where sale_id = s.id
     for update;

    if c.id is not null then
      raise exception using message = U&'A venda j\00E1 possui comiss\00E3o';
    end if;

    insert into public.commissions(
      company_id, sale_id, total_amount, receipt_type, status, notes
    ) values (
      s.company_id, s.id, total, receipt, 'pending', commission_notes
    ) returning * into c;
  else
    select * into c
      from public.commissions
     where id = target_commission
       and sale_id = s.id
     for update;

    if c.id is null then
      raise exception using message = U&'Comiss\00E3o n\00E3o encontrada para a venda';
    end if;

    if private.commission_has_financial_activity(c.id) then
      raise exception using message = U&'A comiss\00E3o possui recebimento, pagamento, transa\00E7\00E3o ou nota fiscal. Estorne/reabra os lan\00E7amentos antes de alterar valores ou parcelas.';
    end if;

    perform 1
      from public.commission_installments
     where commission_id = c.id
     order by id
     for update;

    perform 1
      from public.commission_splits
     where commission_id = c.id
     order by id
     for update;

    perform 1
      from public.receivables r_lock
      join public.commission_installments ci_lock
        on ci_lock.receivable_id = r_lock.id
     where ci_lock.commission_id = c.id
     order by r_lock.id
     for update of r_lock;

    perform 1
      from public.payables p_lock
      join public.commission_splits cs_lock
        on cs_lock.payable_id = p_lock.id
     where cs_lock.commission_id = c.id
     order by p_lock.id
     for update of p_lock;

    update public.commissions
       set company_id = s.company_id,
           total_amount = total,
           receipt_type = receipt,
           status = 'pending',
           notes = commission_notes
     where id = c.id
     returning * into c;
  end if;

  select coalesce(
           first_due_date,
           min(expected_date),
           (coalesce(s.sale_date, current_date) + interval '1 month')::date
         )
    into effective_first_due_date
    from public.commission_installments
   where commission_id = c.id;

  for n in 1..installment_count loop
    calculated_due_date := effective_first_due_date + make_interval(months => n - 1);
    installment_amount := case
      when n = installment_count then total - allocated
      else trunc(total / installment_count, 2)
    end;
    allocated := allocated + installment_amount;

    receivable_description := concat_ws(
      U&' \2014 ',
      U&'Comiss\00E3o de venda',
      case when nullif(broker_name, '') is not null then 'Corretor ' || broker_name end,
      nullif(d.name, ''),
      case when nullif(s.unit, '') is not null then 'Unidade ' || s.unit end,
      case when nullif(s.buyer_name, '') is not null then 'Comprador ' || s.buyer_name end,
      case when installment_count > 1 then 'Parcela ' || n || '/' || installment_count end,
      case when s.sale_date is not null then U&'Compet\00EAncia ' || to_char(s.sale_date, 'MM/YYYY') end
    );

    select * into ci
      from public.commission_installments
     where commission_id = c.id
       and installment_number = n
     for update;

    if ci.id is not null and ci.receivable_id is not null then
      select * into r
        from public.receivables
       where id = ci.receivable_id
       for update;
    else
      r.id := null;
    end if;

    if r.id is null then
      insert into public.receivables(
        company_id, client_name, client_document, sale_id, description, amount,
        due_date, competence_date, category_id, cost_center_id, invoice_rule,
        recurrence, status
      ) values (
        s.company_id,
        case when receipt = 'launch_passthrough' then d.developer else s.buyer_name end,
        s.buyer_document,
        s.id,
        receivable_description,
        installment_amount,
        calculated_due_date,
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
      ) returning id into linked_receivable_id;
    else
      linked_receivable_id := r.id;

      update public.receivables
         set company_id = s.company_id,
             client_name = case when receipt = 'launch_passthrough' then d.developer else s.buyer_name end,
             client_document = s.buyer_document,
             sale_id = s.id,
             description = receivable_description,
             amount = installment_amount,
             due_date = calculated_due_date,
             competence_date = s.sale_date,
             status = case when status = 'cancelled' then 'open' else status end,
             updated_at = now()
       where id = r.id;
    end if;

    if ci.id is null then
      insert into public.commission_installments(
        commission_id, installment_number, amount, expected_date, status, receivable_id
      ) values (
        c.id, n, installment_amount, calculated_due_date, 'pending', linked_receivable_id
      ) returning id into linked_installment_id;
    else
      linked_installment_id := ci.id;

      update public.commission_installments
         set amount = installment_amount,
             expected_date = calculated_due_date,
             received_date = null,
             status = 'pending',
             receivable_id = linked_receivable_id
       where id = ci.id;
    end if;

    update public.receivables
       set commission_installment_id = linked_installment_id
     where id = linked_receivable_id;

    ci.id := null;
    r.id := null;
  end loop;

  select coalesce(
           array_agg(ci_extra.receivable_id) filter (where ci_extra.receivable_id is not null),
           array[]::uuid[]
         )
    into extra_receivable_ids
    from public.commission_installments ci_extra
   where ci_extra.commission_id = c.id
     and ci_extra.installment_number > installment_count;

  update public.receivables
     set sale_id = null,
         commission_installment_id = null
   where id = any(extra_receivable_ids);

  delete from public.commission_installments
   where commission_id = c.id
     and installment_number > installment_count;

  delete from public.receivables
   where id = any(extra_receivable_ids);

  select * into sp
    from public.commission_splits
   where commission_id = c.id
     and beneficiary_type = 'brokerage'
   for update;

  if sp.id is null then
    insert into public.commission_splits(
      commission_id, beneficiary_type, percentage, amount, status
    ) values (
      c.id, 'brokerage', brokerage_pct, brokerage_amount, 'not_applicable'
    );
  else
    update public.commission_splits
       set beneficiary_id = null,
           percentage = brokerage_pct,
           amount = brokerage_amount,
           payable_id = null,
           status = 'not_applicable'
     where id = sp.id;
  end if;

  payable_description := concat_ws(
    U&' \2014 ',
    U&'Repasse de comiss\00E3o',
    nullif(d.name, ''),
    case when nullif(s.unit, '') is not null then 'Unidade ' || s.unit end,
    case when nullif(s.buyer_name, '') is not null then 'Venda de ' || s.buyer_name end
  );

  sp.id := null;
  select * into sp
    from public.commission_splits
   where commission_id = c.id
     and beneficiary_type = 'broker'
   for update;

  if sp.id is not null and sp.payable_id is not null then
    select * into p
      from public.payables
     where id = sp.payable_id
     for update;
  else
    p.id := null;
  end if;

  if broker_amount > 0 then
    if p.id is null then
      insert into public.payables(
        company_id, employee_id, description, amount, due_date, category_id,
        cost_center_id, recurrence, status, notes
      ) values (
        s.company_id,
        s.broker_id,
        payable_description,
        broker_amount,
        effective_first_due_date,
        (
          select id from public.chart_accounts
           where company_id = s.company_id and type = 'expense' and name ilike '%repasse%'
           order by code nulls last limit 1
        ),
        (select id from public.cost_centers where company_id = s.company_id order by created_at limit 1),
        'once',
        'open',
        U&'Executar ap\00F3s recebimento da comiss\00E3o.'
      ) returning id into linked_payable_id;
    else
      linked_payable_id := p.id;

      update public.payables
         set company_id = s.company_id,
             supplier_id = null,
             employee_id = s.broker_id,
             description = payable_description,
             amount = broker_amount,
             due_date = effective_first_due_date,
             status = case when status = 'cancelled' then 'open' else status end,
             notes = U&'Executar ap\00F3s recebimento da comiss\00E3o.',
             updated_at = now()
       where id = p.id;
    end if;
  else
    linked_payable_id := null;

    if p.id is not null then
      update public.commission_splits
         set payable_id = null
       where id = sp.id;

      delete from public.payables where id = p.id;
    end if;
  end if;

  if sp.id is null then
    insert into public.commission_splits(
      commission_id, beneficiary_type, beneficiary_id, percentage,
      amount, payable_id, status
    ) values (
      c.id, 'broker', s.broker_id, broker_pct,
      broker_amount, linked_payable_id,
      case when linked_payable_id is null then 'not_applicable' else 'pending' end
    );
  else
    update public.commission_splits
       set beneficiary_id = s.broker_id,
           percentage = broker_pct,
           amount = broker_amount,
           payable_id = linked_payable_id,
           status = case when linked_payable_id is null then 'not_applicable' else 'pending' end
     where id = sp.id;
  end if;

  sp.id := null;
  select * into sp
    from public.commission_splits
   where commission_id = c.id
     and beneficiary_type = 'manager'
   for update;

  if manager_pct > 0 then
    if sp.id is null then
      insert into public.commission_splits(
        commission_id, beneficiary_type, percentage, amount, status
      ) values (
        c.id, 'manager', manager_pct, manager_amount, 'pending'
      );
    else
      update public.commission_splits
         set percentage = manager_pct,
             amount = manager_amount,
             status = 'pending'
       where id = sp.id;
    end if;
  elsif sp.id is not null then
    delete from public.commission_splits where id = sp.id;
  end if;

  sp.id := null;
  select * into sp
    from public.commission_splits
   where commission_id = c.id
     and beneficiary_type = 'captador'
   for update;

  if captador_pct > 0 then
    if sp.id is null then
      insert into public.commission_splits(
        commission_id, beneficiary_type, percentage, amount, status
      ) values (
        c.id, 'captador', captador_pct, captador_amount, 'pending'
      );
    else
      update public.commission_splits
         set percentage = captador_pct,
             amount = captador_amount,
             status = 'pending'
       where id = sp.id;
    end if;
  elsif sp.id is not null then
    delete from public.commission_splits where id = sp.id;
  end if;

  return c.id;
end;
$$;

create or replace function private.cancel_commission_graph(target_commission uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.commissions where id = target_commission for update;

  if private.commission_has_financial_activity(target_commission) then
    raise exception using message = U&'A comiss\00E3o possui movimenta\00E7\00E3o financeira e n\00E3o pode ser cancelada antes dos estornos.';
  end if;

  update public.commissions set status = 'cancelled' where id = target_commission;
  update public.commission_installments set status = 'cancelled' where commission_id = target_commission;

  update public.receivables
     set status = 'cancelled', updated_at = now()
   where commission_installment_id in (
     select id from public.commission_installments where commission_id = target_commission
   );

  update public.payables
     set status = 'cancelled', updated_at = now()
   where id in (
     select payable_id
       from public.commission_splits
      where commission_id = target_commission
        and payable_id is not null
   );

  update public.commission_splits
     set status = 'not_applicable'
   where commission_id = target_commission
     and status = 'pending';
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
begin
  select * into s from public.sales where id = target_sale for update;
  if s.id is null then raise exception using message = U&'Venda n\00E3o encontrada'; end if;
  if not private.can_operate_sale(s.company_id, s.broker_id) then
    raise exception using message = 'Acesso negado';
  end if;

  return private.sync_commission_graph(
    s.id, null, installment_count, manager_percentage, captador_percentage,
    total_override, receipt_override, first_due_date, commission_notes
  );
end;
$$;

create or replace function private.save_sale_graph(
  target_id uuid,
  payload jsonb,
  generate_commission boolean default true,
  installment_count integer default 1,
  manager_percentage numeric default 0,
  captador_percentage numeric default 0
) returns public.sales
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_sale public.sales;
  current_commission public.commissions;
  saved public.sales;
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
    if current_sale.id is null then raise exception using message = U&'Venda n\00E3o encontrada'; end if;
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
    raise exception using message = U&'Dados obrigat\00F3rios da venda n\00E3o foram informados';
  end if;
  if target_status not in ('in_progress', 'completed', 'cancelled') then
    raise exception using message = U&'Status da venda inv\00E1lido';
  end if;
  if not exists (
    select 1 from public.developments d
     where d.id = target_development and d.company_id = target_company
  ) then
    raise exception using message = U&'Empreendimento n\00E3o pertence \00E0 empresa selecionada';
  end if;
  if not exists (
    select 1 from public.employees e
     where e.id = target_broker and e.company_id = target_company
  ) then
    raise exception using message = U&'Corretor n\00E3o pertence \00E0 empresa selecionada';
  end if;
  if not private.can_operate_sale(target_company, target_broker) then raise exception using message = 'Acesso negado'; end if;
  if target_id is not null and not private.can_manage_finance(target_company)
     and target_broker is distinct from current_sale.broker_id then
    raise exception using message = U&'O corretor n\00E3o pode reatribuir a venda';
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

  select * into current_commission
    from public.commissions
   where sale_id = current_sale.id
   for update;

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
      or target_unit is distinct from current_sale.unit
      or target_sale_date is distinct from current_sale.sale_date
      or target_status is distinct from current_sale.status
      or greatest(1, coalesce(installment_count, 1)) is distinct from current_installments
      or greatest(0, coalesce(manager_percentage, 0)) is distinct from current_manager
      or greatest(0, coalesce(captador_percentage, 0)) is distinct from current_captador;
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

  if current_commission.id is not null then
    if target_status = 'cancelled' then
      perform private.cancel_commission_graph(current_commission.id);
    elsif graph_changed then
      perform private.sync_commission_graph(
        saved.id,
        current_commission.id,
        installment_count,
        manager_percentage,
        captador_percentage,
        null,
        case
          when target_development is distinct from current_sale.development_id then null
          else current_commission.receipt_type
        end,
        null,
        current_commission.notes
      );
    end if;
  elsif generate_commission and target_status <> 'cancelled' then
    perform private.create_commission_graph(
      saved.id, installment_count, manager_percentage, captador_percentage,
      null, null, null, null
    );
  end if;

  return saved;
end;
$$;

create or replace function private.generate_commission_graph_authorized(
  target_sale uuid,
  installment_count integer default 1,
  manager_percentage numeric default 0,
  captador_percentage numeric default 0
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.sales;
  c public.commissions;
begin
  select * into s from public.sales where id = target_sale for update;
  if s.id is null then raise exception using message = U&'Venda n\00E3o encontrada'; end if;
  if not private.can_operate_sale(s.company_id, s.broker_id) then raise exception using message = 'Acesso negado'; end if;

  select * into c from public.commissions where sale_id = s.id for update;

  if c.id is null then
    return private.create_commission_graph(
      s.id, installment_count, manager_percentage, captador_percentage,
      null, null, null, null
    );
  end if;

  return private.sync_commission_graph(
    s.id, c.id, installment_count, manager_percentage, captador_percentage,
    null, c.receipt_type, null, c.notes
  );
end;
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
declare
  c public.commissions;
begin
  select * into c from public.commissions where id = target_id for update;
  if c.id is null then raise exception using message = U&'Comiss\00E3o n\00E3o encontrada'; end if;
  if not private.can_manage_finance(c.company_id) then raise exception using message = 'Acesso negado'; end if;
  if total_amount <= 0 then raise exception using message = U&'O valor da comiss\00E3o deve ser positivo'; end if;
  if installment_count < 1 or installment_count > 120 then raise exception using message = U&'Quantidade de parcelas inv\00E1lida'; end if;

  return private.sync_commission_graph(
    c.sale_id, c.id, installment_count, manager_percentage, captador_percentage,
    total_amount, receipt_type, first_due_date, commission_notes
  );
end;
$$;

-- Recalculate only open graphs. Settled, invoiced or otherwise financially
-- active records are deliberately preserved as historical accounting facts.
do $$
declare
  graph record;
begin
  for graph in
    select
      c.id as commission_id,
      c.sale_id,
      c.total_amount,
      c.receipt_type,
      c.notes,
      greatest(1, count(distinct ci.id))::integer as installment_count,
      min(ci.expected_date) as first_due_date,
      coalesce(max(cs.percentage) filter (where cs.beneficiary_type = 'manager'), 0) as manager_pct,
      coalesce(max(cs.percentage) filter (where cs.beneficiary_type = 'captador'), 0) as captador_pct
    from public.commissions c
    join public.commission_splits broker
      on broker.commission_id = c.id
     and broker.beneficiary_type = 'broker'
    left join public.commission_installments ci on ci.commission_id = c.id
    left join public.commission_splits cs on cs.commission_id = c.id
    where not private.commission_has_financial_activity(c.id)
    group by c.id, c.sale_id, c.total_amount, c.receipt_type, c.notes
    order by c.id
  loop
    perform private.sync_commission_graph(
      graph.sale_id,
      graph.commission_id,
      graph.installment_count,
      graph.manager_pct,
      graph.captador_pct,
      graph.total_amount,
      graph.receipt_type,
      graph.first_due_date,
      graph.notes
    );
  end loop;
end;
$$;

revoke all on function private.sync_commission_graph(uuid, uuid, integer, numeric, numeric, numeric, text, date, text)
  from public, anon, authenticated;
revoke all on function private.cancel_commission_graph(uuid)
  from public, anon, authenticated;
revoke all on function private.create_commission_graph(uuid, integer, numeric, numeric, numeric, text, date, text)
  from public, anon, authenticated;

grant execute on function private.save_sale_graph(uuid, jsonb, boolean, integer, numeric, numeric)
  to authenticated;
grant execute on function private.generate_commission_graph_authorized(uuid, integer, numeric, numeric)
  to authenticated;
grant execute on function private.update_commission_graph_authorized(uuid, numeric, text, integer, date, numeric, numeric, text)
  to authenticated;
