-- A sale with cash, payout, transaction or NFS-e history must keep its
-- financial graph immutable, but its commercial registration must remain
-- editable.  This wrapper preserves the existing graph and delegates to the
-- regular graph synchronizer whenever there is no financial history.

create or replace function public.save_sale_with_commission(
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
  saved public.sales;
begin
  -- New sales, and edits without any financial history, continue through the
  -- complete graph synchronizer unchanged.
  if target_id is null then
    return private.save_sale_graph(
      target_id, payload, generate_commission, installment_count,
      manager_percentage, captador_percentage
    );
  end if;

  select * into current_sale
    from public.sales
   where id = target_id
   for update;
  if current_sale.id is null then
    raise exception using message = U&'Venda n\00E3o encontrada';
  end if;

  select * into current_commission
    from public.commissions
   where sale_id = current_sale.id
   for update;

  if current_commission.id is null
     or not private.commission_has_financial_activity(current_commission.id) then
    return private.save_sale_graph(
      target_id, payload, generate_commission, installment_count,
      manager_percentage, captador_percentage
    );
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

  if target_company is distinct from current_sale.company_id then
    raise exception using message = U&'A empresa da venda n\00E3o pode ser alterada';
  end if;
  if target_broker is null or target_development is null or target_value is null
     or target_value <= 0 or nullif(trim(target_buyer), '') is null then
    raise exception using message = U&'Dados obrigat\00F3rios da venda n\00E3o foram informados';
  end if;
  if target_status not in ('in_progress', 'completed', 'cancelled') then
    raise exception using message = U&'Status da venda inv\00E1lido';
  end if;
  if target_status = 'cancelled' then
    raise exception using message = U&'A venda possui hist\00F3rico financeiro ou NFS-e. Estorne/reabra os lan\00E7amentos antes de cancel\00E1-la';
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
  if not private.can_operate_sale(target_company, target_broker) then
    raise exception using message = 'Acesso negado';
  end if;
  if not private.can_manage_finance(target_company)
     and target_broker is distinct from current_sale.broker_id then
    raise exception using message = U&'O corretor n\00E3o pode reatribuir a venda';
  end if;

  -- Do not write commission terms here: they are the fiscal/financial
  -- snapshot.  The commercial sale fields below remain editable and audited.
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
         updated_at = now()
   where id = current_sale.id
   returning * into saved;

  return saved;
end;
$$;
