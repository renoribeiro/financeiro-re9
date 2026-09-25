-- Snapshot the commercial terms used by each sale and allow safe manual
-- adjustments without breaking the sale -> commission -> receivable graph.

alter table public.sales
  add column if not exists commission_calculation_mode text,
  add column if not exists commission_percentage numeric(9,6),
  add column if not exists commission_amount_override numeric(14,2),
  add column if not exists development_commission_percentage_snapshot numeric(9,6),
  add column if not exists updated_at timestamptz not null default now();

with commission_terms as (
  select
    s.id,
    c.total_amount,
    d.commission_percentage as development_percentage,
    case
      when c.id is not null and d.id is not null
       and abs(c.total_amount - round(s.sale_value * coalesce(d.commission_percentage, 0) / 100, 2)) <= 0.01
        then 'percentage'
      when c.id is not null then 'manual_amount'
      else 'percentage'
    end as calculation_mode,
    case
      when c.id is not null and d.id is not null
       and abs(c.total_amount - round(s.sale_value * coalesce(d.commission_percentage, 0) / 100, 2)) <= 0.01
        then coalesce(d.commission_percentage, 4)
      when c.id is not null and s.sale_value > 0
        then round(c.total_amount * 100 / s.sale_value, 6)
      else coalesce(d.commission_percentage, 4)
    end as applied_percentage
  from public.sales s
  left join public.developments d on d.id = s.development_id
  left join public.commissions c on c.sale_id = s.id
)
update public.sales s
   set commission_calculation_mode = ct.calculation_mode,
       commission_percentage = ct.applied_percentage,
       commission_amount_override = case
         when ct.calculation_mode = 'manual_amount' then ct.total_amount
         else null
       end,
       development_commission_percentage_snapshot = ct.development_percentage,
       updated_at = coalesce(s.updated_at, s.created_at, now())
  from commission_terms ct
 where ct.id = s.id;

update public.sales
   set commission_calculation_mode = coalesce(commission_calculation_mode, 'percentage'),
       commission_percentage = coalesce(commission_percentage, 4),
       development_commission_percentage_snapshot = coalesce(
         development_commission_percentage_snapshot,
         commission_percentage,
         4
       );

alter table public.sales
  alter column commission_calculation_mode set default 'percentage',
  alter column commission_calculation_mode set not null,
  alter column commission_percentage set default 4,
  alter column commission_percentage set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'sales_commission_calculation_mode_check'
       and conrelid = 'public.sales'::regclass
  ) then
    alter table public.sales
      add constraint sales_commission_calculation_mode_check
      check (commission_calculation_mode in ('percentage', 'manual_amount'));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'sales_commission_percentage_valid'
       and conrelid = 'public.sales'::regclass
  ) then
    alter table public.sales
      add constraint sales_commission_percentage_valid
      check (commission_percentage >= 0 and commission_percentage <= 100);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'sales_commission_override_valid'
       and conrelid = 'public.sales'::regclass
  ) then
    alter table public.sales
      add constraint sales_commission_override_valid
      check (
        (commission_calculation_mode = 'percentage' and commission_amount_override is null)
        or
        (commission_calculation_mode = 'manual_amount' and commission_amount_override > 0)
      );
  end if;
end;
$$;

-- Historical sales may already have a null development after the previous
-- ON DELETE SET NULL rule. Keep them valid, but prevent future deletions from
-- removing the commercial reference of an existing sale.
alter table public.sales drop constraint if exists sales_development_id_fkey;
alter table public.sales
  add constraint sales_development_id_fkey
  foreign key (development_id) references public.developments(id) on delete restrict;

create or replace function private.sale_commission_total(s public.sales)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(
    case
      when s.commission_calculation_mode = 'manual_amount'
        then s.commission_amount_override
      else s.sale_value * s.commission_percentage / 100
    end,
    2
  );
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
  target_development_row public.developments;
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
  target_calculation_mode text;
  target_commission_percentage numeric;
  target_commission_override numeric;
  target_development_snapshot numeric;
  target_commission_total numeric(14,2);
  current_installments integer := 0;
  current_manager numeric := 0;
  current_captador numeric := 0;
  graph_changed boolean := false;
begin
  if target_id is not null then
    select * into current_sale from public.sales where id = target_id for update;
    if current_sale.id is null then raise exception using message = U&'Venda n\00E3o encontrada'; end if;

    select * into current_commission
      from public.commissions
     where sale_id = current_sale.id
     for update;
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

  select * into target_development_row
    from public.developments d
   where d.id = target_development
     and d.company_id = target_company;
  if target_development_row.id is null then
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

  target_calculation_mode := coalesce(
    nullif(payload->>'commissionCalculationMode', ''),
    current_sale.commission_calculation_mode,
    'percentage'
  );
  if target_calculation_mode not in ('percentage', 'manual_amount') then
    raise exception using message = U&'Modo de c\00E1lculo da comiss\00E3o inv\00E1lido';
  end if;

  target_commission_percentage := coalesce(
    nullif(payload->>'commissionPercentage', '')::numeric,
    current_sale.commission_percentage,
    target_development_row.commission_percentage,
    4
  );
  if target_commission_percentage < 0 or target_commission_percentage > 100 then
    raise exception using message = U&'Al\00EDquota da comiss\00E3o deve estar entre 0% e 100%';
  end if;

  target_commission_override := case
    when target_calculation_mode = 'manual_amount' then coalesce(
      nullif(payload->>'commissionAmountOverride', '')::numeric,
      current_sale.commission_amount_override,
      current_commission.total_amount
    )
    else null
  end;
  if target_calculation_mode = 'manual_amount'
     and coalesce(target_commission_override, 0) <= 0 then
    raise exception using message = U&'O valor manual da comiss\00E3o deve ser positivo';
  end if;

  if not private.can_manage_finance(target_company) then
    if target_id is null and (
      target_calculation_mode <> 'percentage'
      or target_commission_percentage is distinct from coalesce(target_development_row.commission_percentage, 4)
      or target_commission_override is not null
    ) then
      raise exception using message = U&'Apenas a gest\00E3o financeira pode alterar a al\00EDquota ou o valor da comiss\00E3o';
    end if;
    if target_id is not null and (
      target_calculation_mode is distinct from current_sale.commission_calculation_mode
      or target_commission_percentage is distinct from current_sale.commission_percentage
      or target_commission_override is distinct from current_sale.commission_amount_override
    ) then
      raise exception using message = U&'Apenas a gest\00E3o financeira pode alterar a al\00EDquota ou o valor da comiss\00E3o';
    end if;
  end if;

  target_development_snapshot := case
    when target_id is null or target_development is distinct from current_sale.development_id
      then coalesce(target_development_row.commission_percentage, 4)
    else coalesce(
      current_sale.development_commission_percentage_snapshot,
      target_development_row.commission_percentage,
      4
    )
  end;
  target_commission_total := round(
    case
      when target_calculation_mode = 'manual_amount' then target_commission_override
      else target_value * target_commission_percentage / 100
    end,
    2
  );
  if generate_commission and target_status <> 'cancelled' and target_commission_total <= 0 then
    raise exception using message = U&'Comiss\00E3o calculada deve ser positiva';
  end if;

  if target_id is null then
    insert into public.sales(
      company_id, development_id, unit, sale_value, buyer_name, buyer_document,
      buyer_contact, payment_method, broker_id, sale_date, status, notes,
      commission_calculation_mode, commission_percentage,
      commission_amount_override, development_commission_percentage_snapshot,
      updated_at
    ) values (
      target_company, target_development, target_unit, target_value, target_buyer,
      target_buyer_document, target_buyer_contact, target_payment_method,
      target_broker, target_sale_date, target_status, target_notes,
      target_calculation_mode, target_commission_percentage,
      target_commission_override, target_development_snapshot, now()
    ) returning * into saved;

    if generate_commission and target_status <> 'cancelled' then
      perform private.create_commission_graph(
        saved.id, installment_count, manager_percentage, captador_percentage,
        target_commission_total, null, null, null
      );
    end if;
    return saved;
  end if;

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
      or target_calculation_mode is distinct from current_sale.commission_calculation_mode
      or target_commission_percentage is distinct from current_sale.commission_percentage
      or target_commission_override is distinct from current_sale.commission_amount_override
      or target_commission_total is distinct from current_commission.total_amount
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
         notes = target_notes,
         commission_calculation_mode = target_calculation_mode,
         commission_percentage = target_commission_percentage,
         commission_amount_override = target_commission_override,
         development_commission_percentage_snapshot = target_development_snapshot,
         updated_at = now()
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
        target_commission_total,
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
      target_commission_total, null, null, null
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
  resolved_total numeric;
begin
  select * into s from public.sales where id = target_sale for update;
  if s.id is null then raise exception using message = U&'Venda n\00E3o encontrada'; end if;
  if not private.can_operate_sale(s.company_id, s.broker_id) then raise exception using message = 'Acesso negado'; end if;
  resolved_total := private.sale_commission_total(s);

  select * into c from public.commissions where sale_id = s.id for update;
  if c.id is null then
    return private.create_commission_graph(
      s.id, installment_count, manager_percentage, captador_percentage,
      resolved_total, null, null, null
    );
  end if;

  return private.sync_commission_graph(
    s.id, c.id, installment_count, manager_percentage, captador_percentage,
    resolved_total, c.receipt_type, null, c.notes
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
  s public.sales;
begin
  select * into c from public.commissions where id = target_id;
  if c.id is null then raise exception using message = U&'Comiss\00E3o n\00E3o encontrada'; end if;
  if not private.can_manage_finance(c.company_id) then raise exception using message = 'Acesso negado'; end if;
  if total_amount <= 0 then raise exception using message = U&'O valor da comiss\00E3o deve ser positivo'; end if;
  if installment_count < 1 or installment_count > 120 then raise exception using message = U&'Quantidade de parcelas inv\00E1lida'; end if;

  select * into s from public.sales where id = c.sale_id for update;
  select * into c from public.commissions where id = target_id for update;
  update public.sales
     set commission_calculation_mode = 'manual_amount',
         commission_amount_override = round(total_amount, 2),
         commission_percentage = case
           when sale_value > 0 then round(total_amount * 100 / sale_value, 6)
           else commission_percentage
         end,
         updated_at = now()
   where id = s.id;

  return private.sync_commission_graph(
    c.sale_id, c.id, installment_count, manager_percentage, captador_percentage,
    total_amount, receipt_type, first_due_date, commission_notes
  );
end;
$$;

create or replace function private.adjust_commission_receivable_amount(
  target_id uuid,
  requested_amount numeric,
  expected_updated_at timestamptz default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  relation_row record;
  s public.sales;
  c public.commissions;
  ci public.commission_installments;
  r public.receivables;
  new_total numeric(14,2);
  received_total numeric(14,2);
  broker_amount numeric(14,2) := 0;
  manager_pct numeric := 0;
  captador_pct numeric := 0;
  manager_amount numeric(14,2) := 0;
  captador_amount numeric(14,2) := 0;
  brokerage_amount numeric(14,2) := 0;
  brokerage_pct numeric := 0;
begin
  if requested_amount <= 0 then
    raise exception using message = U&'O valor da parcela deve ser positivo';
  end if;

  select
    coalesce(r0.commission_installment_id, ci0.id) as installment_id,
    ci0.commission_id
    into relation_row
    from public.receivables r0
    left join public.commission_installments ci0
      on ci0.id = r0.commission_installment_id or ci0.receivable_id = r0.id
   where r0.id = target_id
   limit 1;

  if relation_row.installment_id is null or relation_row.commission_id is null then
    raise exception using message = U&'A conta n\00E3o est\00E1 vinculada a uma parcela de comiss\00E3o';
  end if;

  select * into c from public.commissions where id = relation_row.commission_id;
  if c.id is null or not private.can_manage_finance(c.company_id) then
    raise exception using message = 'Acesso negado';
  end if;

  -- Use the same lock order as sync_commission_graph.
  select * into s from public.sales where id = c.sale_id for update;
  select * into c from public.commissions where id = c.id for update;
  perform 1 from public.commission_installments
   where commission_id = c.id order by id for update;
  select * into ci from public.commission_installments
   where id = relation_row.installment_id for update;
  select * into r from public.receivables where id = target_id for update;

  if expected_updated_at is not null and r.updated_at is distinct from expected_updated_at then
    raise exception using message = U&'Esta conta foi alterada por outro usu\00E1rio. Atualize a p\00E1gina e tente novamente.';
  end if;
  if requested_amount < r.received_amount then
    raise exception using message = U&'O valor total n\00E3o pode ser menor que o valor j\00E1 recebido';
  end if;
  if exists (
    select 1 from public.invoices i
     where i.receivable_id = r.id
       and i.status not in ('cancelled', 'error')
  ) and requested_amount is distinct from r.amount then
    raise exception using message = U&'O valor n\00E3o pode mudar enquanto houver uma NFS-e ativa vinculada';
  end if;
  if r.status = 'cancelled' and requested_amount is distinct from r.amount then
    raise exception using message = U&'Reabra a conta cancelada antes de ajustar o valor';
  end if;
  if requested_amount is not distinct from r.amount then return; end if;

  update public.receivables
     set amount = round(requested_amount, 2),
         status = case
           when received_amount = round(requested_amount, 2) and received_amount > 0 then 'received'
           when received_amount > 0 then 'partial'
           when status = 'cancelled' then 'cancelled'
           else 'open'
         end,
         received_at = case
           when received_amount = round(requested_amount, 2) and received_amount > 0 then received_at
           else null
         end,
         updated_at = now()
   where id = r.id
   returning * into r;

  update public.commission_installments
     set amount = r.amount,
         status = case when r.status = 'received' then 'received' else 'pending' end,
         received_date = case when r.status = 'received' then r.received_at::date else null end
   where id = ci.id;

  select round(sum(amount), 2) into new_total
    from public.commission_installments where commission_id = c.id;
  select coalesce(sum(r1.received_amount), 0) into received_total
    from public.commission_installments ci1
    join public.receivables r1 on r1.id = ci1.receivable_id
   where ci1.commission_id = c.id;

  select coalesce(max(amount), 0) into broker_amount
    from public.commission_splits
   where commission_id = c.id and beneficiary_type = 'broker';
  select coalesce(max(percentage), 0) into manager_pct
    from public.commission_splits
   where commission_id = c.id and beneficiary_type = 'manager';
  select coalesce(max(percentage), 0) into captador_pct
    from public.commission_splits
   where commission_id = c.id and beneficiary_type = 'captador';

  manager_amount := round(new_total * manager_pct / 100, 2);
  captador_amount := round(new_total * captador_pct / 100, 2);
  if broker_amount + manager_amount + captador_amount > new_total then
    raise exception using message = U&'O novo total da comiss\00E3o n\00E3o comporta os repasses configurados';
  end if;
  brokerage_amount := new_total - broker_amount - manager_amount - captador_amount;
  brokerage_pct := case when new_total = 0 then 0 else round(brokerage_amount * 100 / new_total, 6) end;

  if exists (
    select 1
      from public.commission_splits cs
      join public.payables p on p.id = cs.payable_id
     where cs.commission_id = c.id
       and cs.beneficiary_type in ('manager', 'captador')
       and p.paid_amount > 0
       and cs.amount is distinct from case
         when cs.beneficiary_type = 'manager' then manager_amount
         else captador_amount
       end
  ) then
    raise exception using message = U&'O ajuste alteraria um repasse j\00E1 pago. Estorne o pagamento antes de continuar.';
  end if;

  update public.commissions
     set total_amount = new_total,
         status = case
           when received_total = new_total and received_total > 0 then 'received'
           when received_total > 0 then 'partial'
           else 'pending'
         end
   where id = c.id;

  update public.sales
     set commission_calculation_mode = 'manual_amount',
         commission_amount_override = new_total,
         commission_percentage = case
           when sale_value > 0 then round(new_total * 100 / sale_value, 6)
           else commission_percentage
         end,
         updated_at = now()
   where id = s.id;

  update public.commission_splits
     set amount = case beneficiary_type
           when 'manager' then manager_amount
           when 'captador' then captador_amount
           when 'brokerage' then brokerage_amount
           else amount
         end,
         percentage = case beneficiary_type
           when 'brokerage' then brokerage_pct
           else percentage
         end
   where commission_id = c.id
     and beneficiary_type in ('manager', 'captador', 'brokerage');
end;
$$;

create or replace function public.update_commission_receivable_entry(
  target_id uuid,
  payload jsonb,
  external_invoice jsonb default null,
  adjustment_reason text default null,
  expected_updated_at timestamptz default null
) returns public.receivables
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_amount numeric;
  requested_amount numeric;
  result public.receivables;
begin
  select amount into current_amount from public.receivables where id = target_id;
  requested_amount := coalesce(nullif(payload->>'amount', '')::numeric, 0);
  if current_amount is distinct from requested_amount
     and nullif(trim(adjustment_reason), '') is null then
    raise exception using message = U&'Informe o motivo do ajuste manual da comiss\00E3o';
  end if;

  if nullif(trim(adjustment_reason), '') is not null then
    perform set_config('re9.adjustment_reason', trim(adjustment_reason), true);
  end if;
  perform private.adjust_commission_receivable_amount(
    target_id,
    requested_amount,
    expected_updated_at
  );
  select * into result
    from public.update_receivable_entry(target_id, payload, external_invoice);
  return result;
end;
$$;

-- Add the adjustment reason to the full audit snapshots without creating a
-- second synthetic event that could interfere with point-in-time restoration.
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
  adjustment_reason text;
begin
  old_row := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  new_row := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  adjustment_reason := nullif(current_setting('re9.adjustment_reason', true), '');
  if adjustment_reason is not null and new_row is not null then
    new_row := new_row || jsonb_build_object('_adjustment_reason', adjustment_reason);
  end if;
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
    select c.company_id into cid from public.commissions c where c.id::text = parent_commission;
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

revoke all on function private.sale_commission_total(public.sales) from public, anon, authenticated;
revoke all on function private.adjust_commission_receivable_amount(uuid, numeric, timestamptz) from public, anon, authenticated;
revoke all on function public.update_commission_receivable_entry(uuid, jsonb, jsonb, text, timestamptz) from public, anon;

grant execute on function private.adjust_commission_receivable_amount(uuid, numeric, timestamptz) to authenticated;
grant execute on function public.update_commission_receivable_entry(uuid, jsonb, jsonb, text, timestamptz) to authenticated;
