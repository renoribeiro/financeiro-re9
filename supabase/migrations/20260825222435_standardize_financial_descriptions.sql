set statement_timeout = '30s';

-- Keep an immutable, private before/after map so this data migration can be
-- audited and reversed without relying on an external export.
create table if not exists private.financial_description_backups (
  migration_name text not null,
  entity_type text not null check (entity_type in ('payable', 'receivable', 'transaction')),
  entity_id uuid not null,
  company_id uuid not null,
  old_description text,
  new_description text,
  old_notes text,
  backed_up_at timestamptz not null default now(),
  primary key (migration_name, entity_type, entity_id)
);

revoke all on table private.financial_description_backups from public, anon, authenticated;

create or replace function private.clean_financial_description(source text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  result text := btrim(coalesce(source, ''));
begin
  -- Repair the UTF-8 sequences that were previously persisted as mojibake.
  result := replace(result, U&'Comiss\00C3\00A3o', U&'Comiss\00E3o');
  result := replace(result, U&'comiss\00C3\00A3o', U&'comiss\00E3o');
  result := replace(result, U&'ap\00C3\00B3s', U&'ap\00F3s');
  result := replace(result, U&'\00E2\20AC\201D', U&'\2014');

  -- Fix recurring abbreviations and spelling without introducing new facts.
  result := regexp_replace(result, '^Pgto[[:space:]]*', 'Pagamento ', 'i');
  result := replace(result, 'Bonus', U&'B\00F4nus');
  result := replace(result, 'bonus', U&'b\00F4nus');
  result := replace(result, 'Angelica', U&'Ang\00E9lica');
  result := replace(result, 'cabecas', U&'cabe\00E7as');
  result := replace(result, 'Imoveis', U&'Im\00F3veis');
  result := replace(result, 'Parquelandia', U&'Parquel\00E2ndia');
  result := replace(result, 'Re9', 'RE9');
  result := replace(result, 'Mlar', 'MLar');
  result := replace(result, 'Pt1', 'Parte 1');
  result := replace(result, 'Pt2', 'Parte 2');
  result := replace(result, ' Ap. ', ' Unidade ');

  result := regexp_replace(result, '[[:space:]]+', ' ', 'g');
  result := regexp_replace(result, U&'[[:space:]]*\2014[[:space:]]*', U&' \2014 ', 'g');
  result := regexp_replace(result, '[[:space:]]+-[[:space:]]+', U&' \2014 ', 'g');
  result := regexp_replace(result, U&'([[:space:]]*\2014[[:space:]]*){2,}', U&' \2014 ', 'g');
  return btrim(result, U&' \2014');
end;
$$;

create or replace function private.remove_leading_financial_party(
  source text,
  party text
) returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  result text := btrim(coalesce(source, ''));
  full_name text := btrim(coalesce(party, ''));
  first_name text;
begin
  if full_name = '' then
    return result;
  end if;

  first_name := split_part(full_name, ' ', 1);
  if lower(result) = lower(full_name) or lower(result) = lower(first_name) then
    return '';
  end if;

  if lower(left(result, length(full_name) + 3)) = lower(full_name || U&' \2014 ') then
    return substr(result, length(full_name) + 4);
  end if;

  if lower(left(result, length(first_name) + 3)) = lower(first_name || U&' \2014 ') then
    return substr(result, length(first_name) + 4);
  end if;

  return result;
end;
$$;

create or replace function private.append_financial_competence(
  source text,
  competence date
) returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  result text := btrim(coalesce(source, ''));
  segment text;
begin
  if competence is null then
    return result;
  end if;

  segment := U&'Compet\00EAncia ' || to_char(competence, 'MM/YYYY');
  if position(lower(segment) in lower(result)) > 0 then
    return result;
  end if;

  return concat_ws(U&' \2014 ', nullif(result, ''), segment);
end;
$$;

create or replace function private.standardize_payable_description(
  source text,
  category_name text,
  beneficiary_name text,
  competence date
) returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  cleaned text := private.clean_financial_description(source);
  detail text;
  result text;
  normalized_category text := lower(coalesce(category_name, ''));
begin
  if lower(cleaned) like U&'%comiss\00E3o contabilidade%' then
    result := U&'Servi\00E7o cont\00E1bil \2014 Comiss\00E3o de contabilidade';

  elsif lower(cleaned) like 'saldo meta%'
     or lower(cleaned) like 'pagamento meta%' then
    detail := regexp_replace(cleaned, '^(Saldo|Pagamento)[[:space:]]+Meta([[:space:]]+Ads)?[[:space:]]*', '\1 ', 'i');
    result := concat_ws(U&' \2014 ', U&'M\00EDdia paga', 'Meta Ads', nullif(btrim(detail, U&' \2014'), ''));

  elsif lower(cleaned) like 'saldo google%'
     or lower(cleaned) like 'pagamento google%' then
    detail := regexp_replace(cleaned, '^(Saldo|Pagamento)[[:space:]]+Google([[:space:]]+Ads)?[[:space:]]*', '\1 ', 'i');
    result := concat_ws(U&' \2014 ', U&'M\00EDdia paga', 'Google Ads', nullif(btrim(detail, U&' \2014'), ''));

  elsif lower(cleaned) like '%olx%' and normalized_category like '%marketing%' then
    result := concat_ws(U&' \2014 ', U&'M\00EDdia paga', cleaned);

  elsif lower(cleaned) like U&'%capta\00E7\00E3o%'
     or normalized_category like U&'%capta\00E7%'
  then
    detail := regexp_replace(cleaned, '^Pagamento[[:space:]]*', '', 'i');
    detail := private.remove_leading_financial_party(btrim(detail, U&' \2014'), beneficiary_name);
    detail := regexp_replace(detail, U&'^Capta\00E7\00E3o[[:space:]]*', '', 'i');
    result := concat_ws(U&' \2014 ', U&'Repasse de capta\00E7\00E3o', nullif(btrim(detail, U&' \2014'), ''));

  elsif lower(cleaned) like U&'b\00F4nus%'
     or normalized_category like U&'%repasse de comiss\00F5es%' and lower(cleaned) like U&'%b\00F4nus%'
  then
    detail := regexp_replace(cleaned, U&'^B\00F4nus([[:space:]]+Venda)?[[:space:]]*', '', 'i');
    detail := private.remove_leading_financial_party(btrim(detail, U&' \2014'), beneficiary_name);
    result := concat_ws(U&' \2014 ', U&'Repasse de b\00F4nus', nullif(btrim(detail, U&' \2014'), ''));

  elsif lower(cleaned) like U&'comiss\00E3o%'
     or lower(cleaned) like U&'repasse%'
     or lower(cleaned) like U&'pagamento comiss\00E3o%'
     or normalized_category like U&'%repasse de comiss\00F5es%'
  then
    detail := regexp_replace(
      cleaned,
      U&'^(Pagamento[[:space:]]+)?(Comiss\00E3o([[:space:]]+Corretor)?|Repasse)[[:space:]]*',
      '',
      'i'
    );
    detail := regexp_replace(detail, '^Pagamento[[:space:]]*', '', 'i');
    detail := private.remove_leading_financial_party(btrim(detail, U&' \2014'), beneficiary_name);
    result := concat_ws(U&' \2014 ', U&'Repasse de comiss\00E3o', nullif(btrim(detail, U&' \2014'), ''));

  elsif lower(cleaned) like U&'sal\00E1rio%'
     or normalized_category like U&'%sal\00E1rio%'
  then
    detail := regexp_replace(cleaned, U&'^Sal\00E1rio[[:space:]]*', '', 'i');
    detail := private.remove_leading_financial_party(detail, beneficiary_name);
    result := concat_ws(U&' \2014 ', U&'Sal\00E1rio', nullif(btrim(detail, U&' \2014'), ''));

  elsif lower(cleaned) like 'adiantamento%'
     or lower(cleaned) like 'quinzena%'
  then
    result := case
      when lower(cleaned) like 'quinzena%' then 'Adiantamento quinzenal'
      else initcap(cleaned)
    end;

  elsif lower(cleaned) like 'retirada%'
  then
    detail := regexp_replace(cleaned, '^Retirada[[:space:]]*', '', 'i');
    result := concat_ws(U&' \2014 ', U&'Retirada de s\00F3cio', nullif(btrim(detail, U&' \2014'), ''));

  elsif lower(cleaned) like 'compra%'
  then
    detail := regexp_replace(cleaned, '^Compra([[:space:]]+de)?[[:space:]]*', '', 'i');
    detail := private.remove_leading_financial_party(detail, beneficiary_name);
    result := concat_ws(U&' \2014 ', 'Compra', nullif(btrim(detail, U&' \2014'), ''));

  elsif lower(cleaned) like '%placas%'
     or normalized_category like '%equipamento%'
  then
    detail := private.remove_leading_financial_party(cleaned, beneficiary_name);
    result := concat_ws(U&' \2014 ', 'Compra', nullif(btrim(detail, U&' \2014'), ''));

  elsif lower(cleaned) in ('imposto', 'impostos') then
    result := 'Imposto';
  elsif lower(cleaned) = 'imposto maio/26' then
    result := U&'Imposto \2014 Compet\00EAncia 05/2026';
  elsif lower(cleaned) = 'imposto junho/26' then
    result := U&'Imposto \2014 Compet\00EAncia 06/2026';

  elsif lower(cleaned) like 'curso%'
     or normalized_category like U&'%forma\00E7%'
  then
    detail := regexp_replace(cleaned, '^Curso[[:space:]]*', '', 'i');
    result := concat_ws(U&' \2014 ', U&'Forma\00E7\00E3o profissional', nullif(btrim(detail, U&' \2014'), ''));

  elsif lower(cleaned) like U&'servi\00E7o financeiro%'
  then
    result := U&'Servi\00E7o financeiro';

  elsif lower(cleaned) like 'creci%'
  then
    detail := regexp_replace(cleaned, '^Creci[[:space:]]*', '', 'i');
    detail := private.remove_leading_financial_party(detail, beneficiary_name);
    result := concat_ws(U&' \2014 ', 'CRECI', nullif(btrim(detail, U&' \2014'), ''));

  else
    result := cleaned;
  end if;

  return private.append_financial_competence(result, competence);
end;
$$;

create or replace function private.standardize_receivable_description(
  source text,
  competence date
) returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  cleaned text := private.clean_financial_description(source);
  detail text;
  result text;
begin
  if lower(cleaned) like U&'comiss\00E3o 3 vendas%'
  then
    detail := regexp_replace(cleaned, U&'^Comiss\00E3o 3 Vendas[[:space:]]*', '', 'i');
    result := concat_ws(U&' \2014 ', U&'Comiss\00E3o de 3 vendas', nullif(btrim(detail, U&' \2014'), ''));

  elsif lower(cleaned) like U&'b\00F4nus%'
  then
    detail := regexp_replace(cleaned, U&'^B\00F4nus([[:space:]]+Venda)?[[:space:]]*', '', 'i');
    result := concat_ws(U&' \2014 ', U&'B\00F4nus de venda', nullif(btrim(detail, U&' \2014'), ''));

  elsif lower(cleaned) like U&'comiss\00E3o%'
     or lower(cleaned) like U&'primeira parte da comiss\00E3o%'
  then
    if lower(cleaned) like U&'primeira parte da comiss\00E3o%' then
      detail := 'Parte 1';
    else
      detail := regexp_replace(cleaned, U&'^Comiss\00E3o([[:space:]]+Venda)?[[:space:]]*', '', 'i');
    end if;
    detail := regexp_replace(detail, U&'^(Reno|Andr\00E9)[[:space:]]*', 'Corretor \1 ', 'i');
    result := concat_ws(U&' \2014 ', U&'Comiss\00E3o de venda', nullif(btrim(detail, U&' \2014'), ''));

  elsif lower(cleaned) like 'aporte%'
  then
    detail := regexp_replace(cleaned, '^Aporte[[:space:]]*', '', 'i');
    result := concat_ws(U&' \2014 ', 'Aporte', nullif(btrim(detail, U&' \2014'), ''));

  elsif lower(cleaned) like 'investimento%'
  then
    detail := regexp_replace(cleaned, '^Investimento[[:space:]]*', '', 'i');
    result := concat_ws(U&' \2014 ', 'Investimento', nullif(btrim(detail, U&' \2014'), ''));

  elsif lower(cleaned) like '%investimento%'
  then
    detail := regexp_replace(cleaned, U&'[[:space:]]*\2014[[:space:]]*Investimento$', '', 'i');
    result := concat_ws(U&' \2014 ', 'Investimento', nullif(btrim(detail, U&' \2014'), ''));

  else
    result := cleaned;
  end if;

  return private.append_financial_competence(result, competence);
end;
$$;

-- Back up every current description, including unchanged rows. This gives the
-- migration a complete, reviewable source snapshot.
insert into private.financial_description_backups (
  migration_name, entity_type, entity_id, company_id,
  old_description, new_description, old_notes
)
select
  'standardize_financial_descriptions',
  'payable',
  p.id,
  p.company_id,
  p.description,
  case
    when sale.id is not null then concat_ws(
      U&' \2014 ',
      U&'Repasse de comiss\00E3o',
      nullif(d.name, ''),
      case when nullif(sale.unit, '') is not null then 'Unidade ' || sale.unit end,
      case when nullif(sale.buyer_name, '') is not null then 'Venda de ' || sale.buyer_name end
    )
    else private.standardize_payable_description(
      p.description,
      ca.name,
      coalesce(nullif(sup.trade_name, ''), sup.legal_name, emp.full_name),
      p.competence_date
    )
  end,
  p.notes
from public.payables p
left join public.suppliers sup on sup.id = p.supplier_id
left join public.employees emp on emp.id = p.employee_id
left join public.chart_accounts ca on ca.id = p.category_id
left join public.commission_splits split on split.payable_id = p.id
left join public.commissions commission on commission.id = split.commission_id
left join public.sales sale on sale.id = commission.sale_id
left join public.developments d on d.id = sale.development_id
on conflict (migration_name, entity_type, entity_id) do nothing;

insert into private.financial_description_backups (
  migration_name, entity_type, entity_id, company_id,
  old_description, new_description, old_notes
)
select
  'standardize_financial_descriptions',
  'receivable',
  r.id,
  r.company_id,
  r.description,
  case
    when sale.id is not null then private.append_financial_competence(
      concat_ws(
        U&' \2014 ',
        U&'Comiss\00E3o de venda',
        case when nullif(emp.full_name, '') is not null then 'Corretor ' || emp.full_name end,
        nullif(d.name, ''),
        case when nullif(sale.unit, '') is not null then 'Unidade ' || sale.unit end,
        case when nullif(sale.buyer_name, '') is not null then 'Comprador ' || sale.buyer_name end,
        case
          when installment_totals.installment_count > 1
          then 'Parcela ' || installment.installment_number || '/' || installment_totals.installment_count
        end
      ),
      r.competence_date
    )
    else private.standardize_receivable_description(r.description, r.competence_date)
  end,
  r.notes
from public.receivables r
left join public.sales sale on sale.id = r.sale_id
left join public.developments d on d.id = sale.development_id
left join public.employees emp on emp.id = sale.broker_id
left join public.commission_installments installment on installment.receivable_id = r.id
left join lateral (
  select count(*)::integer as installment_count
  from public.commission_installments sibling
  where sibling.commission_id = installment.commission_id
) installment_totals on true
on conflict (migration_name, entity_type, entity_id) do nothing;

-- Keep cash-ledger descriptions aligned only when they still exactly match the
-- original account description. Independent ledger notes are preserved.
insert into private.financial_description_backups (
  migration_name, entity_type, entity_id, company_id,
  old_description, new_description, old_notes
)
select distinct on (t.id)
  'standardize_financial_descriptions',
  'transaction',
  t.id,
  t.company_id,
  t.description,
  backup.new_description,
  null
from public.transactions t
join private.financial_description_backups backup
  on backup.migration_name = 'standardize_financial_descriptions'
 and (
      (backup.entity_type = 'payable' and backup.entity_id = t.payable_id)
   or (backup.entity_type = 'receivable' and backup.entity_id = t.receivable_id)
 )
where t.description is not distinct from backup.old_description
on conflict (migration_name, entity_type, entity_id) do nothing;

update public.transactions t
set description = backup.new_description
from private.financial_description_backups backup
where backup.migration_name = 'standardize_financial_descriptions'
  and backup.entity_type = 'transaction'
  and backup.entity_id = t.id
  and t.description is distinct from backup.new_description;

update public.payables p
set
  description = backup.new_description,
  notes = case
    when p.notes is null then null
    else private.clean_financial_description(p.notes)
  end
from private.financial_description_backups backup
where backup.migration_name = 'standardize_financial_descriptions'
  and backup.entity_type = 'payable'
  and backup.entity_id = p.id
  and (
    p.description is distinct from backup.new_description
    or (
      p.notes is not null
      and p.notes is distinct from private.clean_financial_description(p.notes)
    )
  );

update public.receivables r
set
  description = backup.new_description,
  notes = case
    when r.notes is null then null
    else private.clean_financial_description(r.notes)
  end
from private.financial_description_backups backup
where backup.migration_name = 'standardize_financial_descriptions'
  and backup.entity_type = 'receivable'
  and backup.entity_id = r.id
  and (
    r.description is distinct from backup.new_description
    or (
      r.notes is not null
      and r.notes is distinct from private.clean_financial_description(r.notes)
    )
  );

-- Future sale graphs now follow the same standard and use Unicode escapes so
-- deployment encoding cannot corrupt Portuguese text again.
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
  broker_name text;
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
  if s.id is null then raise exception using message = U&'Venda n\00E3o encontrada'; end if;
  if not private.can_operate_sale(s.company_id, s.broker_id) then
    raise exception using message = 'Acesso negado';
  end if;
  if exists (select 1 from public.commissions where sale_id = s.id) then
    raise exception using message = U&'A venda j\00E1 possui comiss\00E3o';
  end if;

  select * into d from public.developments where id = s.development_id;
  if d.id is null or d.company_id <> s.company_id then
    raise exception using message = U&'Empreendimento inv\00E1lido';
  end if;

  select full_name into broker_name from public.employees where id = s.broker_id;

  installment_count := greatest(1, least(120, coalesce(installment_count, 1)));
  manager_percentage := greatest(0, coalesce(manager_percentage, 0));
  captador_percentage := greatest(0, coalesce(captador_percentage, 0));
  broker_pct := coalesce(d.broker_split_percentage, 0);
  if broker_pct + manager_percentage + captador_percentage > 100 then
    raise exception using message = U&'A soma dos percentuais de comiss\00E3o excede 100%';
  end if;

  brokerage_pct := 100 - broker_pct - manager_percentage - captador_percentage;
  total := round(coalesce(total_override, s.sale_value * coalesce(d.commission_percentage, 0) / 100), 2);
  if total <= 0 then
    raise exception using message = U&'Comiss\00E3o calculada deve ser positiva';
  end if;
  receipt := coalesce(
    receipt_override,
    case when d.type = 'launch' then 'launch_passthrough' else 'resale_consolidated' end
  );
  if receipt not in ('launch_passthrough', 'resale_consolidated', 'resale_split') then
    raise exception using message = U&'Modelo de recebimento inv\00E1lido';
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
      concat_ws(
        U&' \2014 ',
        U&'Comiss\00E3o de venda',
        case when nullif(broker_name, '') is not null then 'Corretor ' || broker_name end,
        nullif(d.name, ''),
        case when nullif(s.unit, '') is not null then 'Unidade ' || s.unit end,
        case when nullif(s.buyer_name, '') is not null then 'Comprador ' || s.buyer_name end,
        case when installment_count > 1 then 'Parcela ' || n || '/' || installment_count end,
        case when s.sale_date is not null then U&'Compet\00EAncia ' || to_char(s.sale_date, 'MM/YYYY') end
      ),
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
      concat_ws(
        U&' \2014 ',
        U&'Repasse de comiss\00E3o',
        nullif(d.name, ''),
        case when nullif(s.unit, '') is not null then 'Unidade ' || s.unit end,
        case when nullif(s.buyer_name, '') is not null then 'Venda de ' || s.buyer_name end
      ),
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
      U&'Executar ap\00F3s recebimento da comiss\00E3o.'
    ) returning id into payable_id;
  end if;

  insert into public.commission_splits(commission_id, beneficiary_type, beneficiary_id, percentage, amount, payable_id, status)
  values (
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

revoke all on function private.create_commission_graph(uuid, integer, numeric, numeric, numeric, text, date, text)
  from public, anon;
grant execute on function private.create_commission_graph(uuid, integer, numeric, numeric, numeric, text, date, text)
  to authenticated;

drop function private.standardize_receivable_description(text, date);
drop function private.standardize_payable_description(text, text, text, date);
drop function private.append_financial_competence(text, date);
drop function private.remove_leading_financial_party(text, text);
drop function private.clean_financial_description(text);
