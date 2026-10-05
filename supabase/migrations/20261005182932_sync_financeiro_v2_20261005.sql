-- Reconcile the RE9 Imoveis production ledger with the Google Sheet
-- "Financeiro V2" (snapshot reviewed on 2026-10-05).
--
-- Cash tabs are authoritative for settlements.  When the workbook conflicts
-- with its control tabs, the uncertainty is preserved in notes with XXXX.
-- Every inserted row carries a stable source marker so this migration is
-- idempotent and auditable.

begin;

do $$
declare
  v_company uuid;
  v_actor uuid;
  v_revenue_commission uuid;
  v_revenue_other uuid;
  v_expense_root uuid;
  v_expense_commission uuid;
  v_expense_marketing uuid;
  v_expense_salary uuid;
  v_expense_software uuid;
  v_expense_creci uuid;
  v_cc_admin uuid;
  v_cc_commercial uuid;
  v_cc_marketing uuid;
  v_reno uuid;
  v_andre uuid;
  v_angelica uuid;
  v_felipe uuid;
  v_soraya uuid;
  v_dev_bella uuid;
  v_dev_mlar_cambeba uuid;
  v_dev_mlar_kennedy uuid;
  v_dev_vista_costeira uuid;
  v_dev_la_vie uuid;
  v_dev_garden uuid;
  v_dev_piazza uuid;
  v_dev_enjoy uuid;
  v_sale uuid;
  v_commission uuid;
  v_receivable uuid;
  v_installment uuid;
  v_payable uuid;
  v_old_receivable uuid;
  v_old_payable uuid;
  v_row record;
begin
  perform pg_advisory_xact_lock(hashtextextended('re9:financeiro-v2:2026-10-05', 0));

  select id into v_company
    from public.companies
   where lower(trade_name) = lower('RE9 Imóveis')
   order by created_at
   limit 1;
  if v_company is null then
    raise exception 'Empresa RE9 Imóveis não encontrada';
  end if;

  select cm.user_id into v_actor
    from public.company_members cm
    left join auth.users u on u.id = cm.user_id
   where cm.company_id = v_company
   order by (lower(coalesce(u.email, '')) = 'reno@re9imob.com.br') desc,
            (cm.role = 'super_admin') desc,
            cm.user_id
   limit 1;
  if v_actor is null then
    raise exception 'Usuário responsável pela conciliação não encontrado';
  end if;

  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('re9.adjustment_reason',
    'Conciliação integral com a planilha Financeiro V2 em 05/10/2026', true);

  select id into v_revenue_commission from public.chart_accounts
   where company_id = v_company and code = '1.1' limit 1;
  select id into v_revenue_other from public.chart_accounts
   where company_id = v_company and code = '1.2' limit 1;
  select id into v_expense_root from public.chart_accounts
   where company_id = v_company and code = '2' limit 1;
  select id into v_expense_commission from public.chart_accounts
   where company_id = v_company and code = '2.1' limit 1;
  select id into v_expense_marketing from public.chart_accounts
   where company_id = v_company and code = '2.2' limit 1;
  select id into v_expense_creci from public.chart_accounts
   where company_id = v_company and code = '2.3' limit 1;
  select id into v_expense_salary from public.chart_accounts
   where company_id = v_company and code = '2.7' limit 1;
  select id into v_expense_software from public.chart_accounts
   where company_id = v_company and code = '2.12' limit 1;

  select id into v_cc_admin from public.cost_centers
   where company_id = v_company and lower(name) = 'administrativo' limit 1;
  select id into v_cc_commercial from public.cost_centers
   where company_id = v_company and lower(name) = 'comercial' limit 1;
  select id into v_cc_marketing from public.cost_centers
   where company_id = v_company and lower(name) = 'marketing' limit 1;

  if v_revenue_commission is null or v_expense_commission is null
     or v_cc_commercial is null or v_cc_admin is null or v_cc_marketing is null then
    raise exception 'Plano de contas ou centros de custo obrigatórios não encontrados';
  end if;

  -- Dedicated tax tab says 3.53%; Custos Fixos says 3.56%.  The dedicated
  -- tax tab wins, and the discrepancy remains explicit for the team.
  update public.companies
     set tax_regime = 'simples_nacional',
         tax_config = coalesce(tax_config, '{}'::jsonb)
           || jsonb_build_object(
                'issSimplesPct', 3.53,
                'irCsllProvisionPct', 15,
                'source', 'Financeiro V2 — Impostos!B4',
                'sourceWarning', 'XXXX — Custos Fixos informa 3,56%; Impostos informa 3,53%. Aplicado 3,53%.'
              )
   where id = v_company;

  -- Standard development defaults and known spelling/developer metadata.
  update public.developments
     set commission_percentage = coalesce(commission_percentage, 4),
         broker_split_percentage = coalesce(broker_split_percentage, 2),
         type = coalesce(type, 'launch')
   where company_id = v_company;

  update public.developments set name = 'MLar Cambeba', developer = coalesce(developer, 'MLar')
   where company_id = v_company and lower(name) = lower('Mlar Cambeba');
  update public.developments set developer = 'Marquise', type = 'launch'
   where company_id = v_company and lower(name) = lower('Maré');
  update public.developments set developer = 'R Miranda', type = 'launch'
   where company_id = v_company and lower(name) = lower('Vibe Meireles');
  update public.developments set developer = 'Tenda', type = 'launch'
   where company_id = v_company and lower(name) = lower('Vista di Mari');
  update public.developments set developer = 'MLar', type = 'launch'
   where company_id = v_company and lower(name) = lower('MLar Kennedy');

  insert into public.developments(
    company_id, name, developer, type, commission_percentage,
    broker_split_percentage, is_active, notes
  )
  select v_company, 'Garden Fátima', 'Ibidra', 'launch', 4, 2, true,
         'Origem: Financeiro V2. XXXX — a planilha alterna Garden/Gardem e Ibidra/Idibra; grafia padronizada como Garden Fátima / Ibidra.'
   where not exists (
     select 1 from public.developments
      where company_id = v_company
        and lower(replace(name, 'gardem', 'garden')) = lower('Garden Fátima')
   );

  insert into public.developments(
    company_id, name, developer, type, commission_percentage,
    broker_split_percentage, is_active, notes
  )
  select v_company, 'Piazza', 'Coliseo', 'launch', 4, 2, true,
         'Origem: Financeiro V2.'
   where not exists (
     select 1 from public.developments
      where company_id = v_company and lower(name) = lower('Piazza')
   );

  insert into public.developments(
    company_id, name, developer, type, commission_percentage,
    broker_split_percentage, is_active, notes
  )
  select v_company, 'Enjoy', 'XXXX', 'launch', 4, 2, true,
         'Origem: Financeiro V2. XXXX — confirmar construtora do empreendimento Enjoy.'
   where not exists (
     select 1 from public.developments
      where company_id = v_company and lower(name) = lower('Enjoy')
   );

  -- Consolidate exact duplicate suppliers without losing history.
  for v_row in
    with ranked as (
      select s.id,
             first_value(s.id) over (
               partition by lower(trim(coalesce(nullif(s.trade_name, ''), s.legal_name)))
               order by (select count(*) from public.payables p where p.supplier_id = s.id) desc,
                        s.created_at,
                        s.id
             ) canonical_id,
             count(*) over (
               partition by lower(trim(coalesce(nullif(s.trade_name, ''), s.legal_name)))
             ) duplicate_count
        from public.suppliers s
       where s.company_id = v_company
    )
    select id, canonical_id from ranked
     where duplicate_count > 1 and id <> canonical_id
  loop
    update public.payables set supplier_id = v_row.canonical_id
     where supplier_id = v_row.id;
    update public.suppliers
       set is_active = false,
           notes = concat_ws(E'\n', nullif(notes, ''),
             'Cadastro consolidado em 05/10/2026 com o fornecedor canônico ' || v_row.canonical_id || '.')
     where id = v_row.id;
  end loop;

  -- Consolidate duplicate developments by exact name.  Existing sales follow
  -- the canonical row; the redundant row remains inactive for auditability.
  for v_row in
    with ranked as (
      select d.id,
             first_value(d.id) over (
               partition by lower(trim(d.name))
               order by (select count(*) from public.sales s where s.development_id = d.id) desc,
                        d.created_at,
                        d.id
             ) canonical_id,
             count(*) over (partition by lower(trim(d.name))) duplicate_count
        from public.developments d
       where d.company_id = v_company
    )
    select id, canonical_id from ranked
     where duplicate_count > 1 and id <> canonical_id
  loop
    update public.sales set development_id = v_row.canonical_id
     where development_id = v_row.id;
    update public.developments
       set is_active = false,
           notes = concat_ws(E'\n', nullif(notes, ''),
             'Cadastro duplicado consolidado em 05/10/2026 com ' || v_row.canonical_id || '.')
     where id = v_row.id;
  end loop;

  -- Employees required by the source workbook.
  insert into public.employees(
    company_id, full_name, employment_type, status, role_title
  )
  select v_company, 'Soraya', 'commission_only', 'active',
         'Corretora — XXXX confirmar nome completo e vínculo'
   where not exists (
     select 1 from public.employees
      where company_id = v_company and lower(full_name) = 'soraya'
   );

  select id into v_reno from public.employees
   where company_id = v_company and lower(full_name) like 'reno%' order by created_at limit 1;
  select id into v_andre from public.employees
   where company_id = v_company and lower(full_name) like 'andré%' order by created_at limit 1;
  select id into v_angelica from public.employees
   where company_id = v_company and lower(full_name) = lower('Angélica') order by created_at limit 1;
  select id into v_felipe from public.employees
   where company_id = v_company and lower(full_name) = 'felipe' order by created_at limit 1;
  select id into v_soraya from public.employees
   where company_id = v_company and lower(full_name) = 'soraya' order by created_at limit 1;

  select id into v_dev_bella from public.developments
   where company_id = v_company and lower(name) = lower('Bella Aldeota') and is_active order by created_at limit 1;
  select id into v_dev_mlar_cambeba from public.developments
   where company_id = v_company and lower(name) = lower('MLar Cambeba') and is_active order by created_at limit 1;
  select id into v_dev_mlar_kennedy from public.developments
   where company_id = v_company and lower(name) = lower('MLar Kennedy') and is_active order by created_at limit 1;
  select id into v_dev_vista_costeira from public.developments
   where company_id = v_company and lower(name) = lower('Vista Costeira') and is_active order by created_at limit 1;
  select id into v_dev_la_vie from public.developments
   where company_id = v_company and lower(name) = lower('La Vie') and is_active order by created_at limit 1;
  select id into v_dev_garden from public.developments
   where company_id = v_company and lower(name) = lower('Garden Fátima') and is_active order by created_at limit 1;
  select id into v_dev_piazza from public.developments
   where company_id = v_company and lower(name) = lower('Piazza') and is_active order by created_at limit 1;
  select id into v_dev_enjoy from public.developments
   where company_id = v_company and lower(name) = lower('Enjoy') and is_active order by created_at limit 1;

  -- Suppliers required by the missing expense rows and fixed-cost templates.
  insert into public.suppliers(company_id, legal_name, trade_name, is_active, notes)
  select v_company, x.name, x.name, true, 'Criado pela conciliação Financeiro V2 em 05/10/2026.'
    from (values ('Meta'), ('Brindes'), ('Hostinger'), ('Zaia')) x(name)
   where not exists (
     select 1 from public.suppliers s
      where s.company_id = v_company and s.is_active
        and lower(coalesce(nullif(s.trade_name, ''), s.legal_name)) = lower(x.name)
   );

  create temporary table re9_stage_expenses(
    source_row integer primary key,
    paid_on date not null,
    description text not null,
    party text not null,
    party_type text not null,
    category_id uuid not null,
    cost_center_id uuid not null,
    amount numeric(14,2) not null,
    proof_name text
  ) on commit drop;

  insert into re9_stage_expenses values
    (167, date '2026-09-23', 'Brindes — Corretores e clientes — Competência 09/2026', 'Brindes', 'supplier', coalesce(v_expense_root, v_expense_commission), v_cc_admin, 2571.65, 'Pgto Brindes RE9 imob para corretores e clientes.jpeg'),
    (175, date '2026-09-25', 'Repasse de comissão — Angélica — La Vie — Apto 1204 e Apto 806', 'Angélica', 'employee', v_expense_commission, v_cc_commercial, 500.00, 'Comissão Angélica - La Vie - Apto 1204 & Apto 806.jpeg'),
    (176, date '2026-09-25', 'Repasse de comissão — Soraya — Garden Fátima — Parte 3 — Competência 09/2026', 'Soraya', 'employee', v_expense_commission, v_cc_commercial, 2813.87, 'Pgto Soraya - Comissão Idibra Set26 pt3.jpeg'),
    (177, date '2026-09-25', 'Repasse de comissão — Reno — Piazza — Unidade 1504 Torre Trevi', 'Reno', 'employee', v_expense_commission, v_cc_commercial, 12114.89, 'Pix Enviado para Reno comissão e encamihou comissão Soraya pt3.jpeg'),
    (178, date '2026-09-28', 'Comissão de indicação — Felipe — Passe de agente de IA — Lead Lucas de Freitas Braga', 'Felipe', 'employee', v_expense_commission, v_cc_commercial, 500.00, 'Comissão Felipe - Passe IA - Lead Lucas de Freitas Braga.jpeg'),
    (179, date '2026-09-29', 'Mídia paga — Meta Ads — Atlântico, Orizon, Seano e Enjoy', 'Meta', 'supplier', v_expense_marketing, v_cc_marketing, 1500.00, 'Saldo Meta - 1500 - Atlantico, Orizon, Seano e Enjoy.jpeg'),
    (180, date '2026-09-29', 'Mídia paga — Meta Ads — BS Wave, Maré, BC Cumbuco e Vista Coqueiral', 'Meta', 'supplier', v_expense_marketing, v_cc_marketing, 1000.00, 'Saldo Meta - 1000 - BS wave, Maré, BC Cumbuco e Vista Coqueiral.jpeg'),
    (181, date '2026-09-29', 'Mídia paga — Meta Ads — Bella Aldeota, Bella Rio, Oasy e Mirage', 'Meta', 'supplier', v_expense_marketing, v_cc_marketing, 1500.00, 'Saldo Meta - 1500 - Bella Aldeota, Bella Rio, Oasy e Mirage - 2809.jpeg'),
    (182, date '2026-09-29', 'Mídia paga — Meta Ads — La Vie, Inc Parquelândia, Atmos e BS Rubi', 'Meta', 'supplier', v_expense_marketing, v_cc_marketing, 2000.00, 'Saldo Meta - 2000 - La Vie, Inc Parquelandia, Atmos, BS Rubi.jpeg'),
    (183, date '2026-09-29', 'Mídia paga — Meta Ads — MLar Cambeba, Lago, Inc Cambeba e Bosque', 'Meta', 'supplier', v_expense_marketing, v_cc_marketing, 2000.00, 'Saldo Meta - 2000 - MLar Cambeba, Lago, Inc Cambeba e Bosque.jpeg'),
    (184, date '2026-10-01', 'Repasse de comissão — Reno — La Vie — Unidade 1204', 'Reno', 'employee', v_expense_commission, v_cc_commercial, 17971.20, 'Pgto Reno - Comissão La Vie 1204.jpeg');

  insert into public.payables(
    company_id, supplier_id, employee_id, description, amount, due_date,
    competence_date, category_id, cost_center_id, recurrence, status,
    payment_method, account, notes
  )
  select
    v_company,
    case when st.party_type = 'supplier' then (
      select s.id from public.suppliers s
       where s.company_id = v_company and s.is_active
         and lower(coalesce(nullif(s.trade_name, ''), s.legal_name)) = lower(st.party)
       order by created_at limit 1
    ) end,
    case when st.party_type = 'employee' then case st.party
      when 'Reno' then v_reno when 'Soraya' then v_soraya
      when 'Angélica' then v_angelica when 'Felipe' then v_felipe end
    end,
    st.description, st.amount, st.paid_on, date_trunc('month', st.paid_on)::date,
    st.category_id, st.cost_center_id, 'once', 'open', 'pix',
    'C6 — RE9 Imob',
    'Origem: Financeiro V2 — Saídas!A' || st.source_row
      || '. Comprovante informado na planilha: ' || coalesce(st.proof_name, 'XXXX') || '.'
  from re9_stage_expenses st
  where not exists (
    select 1 from public.payables p
     where p.company_id = v_company
       and coalesce(p.notes, '') like '%Financeiro V2 — Saídas!A' || st.source_row || '%'
  );

  for v_row in select * from re9_stage_expenses order by source_row loop
    select id into v_payable
      from public.payables
     where company_id = v_company
       and coalesce(notes, '') like '%Financeiro V2 — Saídas!A' || v_row.source_row || '%'
     order by created_at desc limit 1;
    if v_payable is null then
      raise exception 'Conta a pagar da linha Saídas!A% não foi criada', v_row.source_row;
    end if;
    if (select paid_amount from public.payables where id = v_payable) < v_row.amount then
      perform public.settle_payable(
        v_payable,
        v_row.amount - (select paid_amount from public.payables where id = v_payable),
        (v_row.paid_on::text || ' 12:00:00-03')::timestamptz,
        'pix', 'C6 — RE9 Imob', null,
        md5('financeiro-v2:saidas:' || v_row.source_row)::uuid
      );
    end if;
  end loop;

  -- Fixed-cost templates.  The first competence is unknown in the workbook;
  -- October/2026 is used as the first open cycle and clearly marked XXXX.
  insert into public.suppliers(company_id, legal_name, trade_name, is_active, notes)
  select v_company, x.name, x.name, true, 'Criado pela conciliação Financeiro V2 em 05/10/2026.'
    from (values ('Assis')) x(name)
   where not exists (
     select 1 from public.suppliers s where s.company_id = v_company and s.is_active
       and lower(coalesce(nullif(s.trade_name, ''), s.legal_name)) = lower(x.name)
   );

  insert into public.payables(
    company_id, supplier_id, employee_id, description, amount, due_date,
    competence_date, category_id, cost_center_id, recurrence, recurrence_day,
    status, payment_method, account, notes
  )
  select v_company,
         case when x.party_type = 'supplier' then (
           select s.id from public.suppliers s where s.company_id = v_company and s.is_active
             and lower(coalesce(nullif(s.trade_name, ''), s.legal_name)) = lower(x.party)
           order by created_at limit 1
         ) end,
         case when x.party_type = 'employee' then (
           select e.id from public.employees e where e.company_id = v_company
             and lower(e.full_name) = lower(x.party) order by created_at limit 1
         ) end,
         x.description, x.amount, x.due_date, date '2026-10-01', x.category_id,
         x.cost_center_id, 'monthly', x.recurrence_day, 'open', 'other', 'XXXX',
         'Origem: Financeiro V2 — Custos Fixos. XXXX — confirmar competência inicial, forma de pagamento e conta bancária.'
    from (values
      ('VPS Hostinger — Competência 10/2026', 'Hostinger', 'supplier', 94.91::numeric, date '2026-10-01', 1, v_expense_software, v_cc_admin),
      ('Salário — Assis — Competência 10/2026', 'Assis', 'employee', 2000.00::numeric, date '2026-10-05', 5, v_expense_salary, v_cc_admin),
      ('Mensalidade Zaia — Competência 10/2026', 'Zaia', 'supplier', 250.00::numeric, date '2026-10-01', 1, v_expense_software, v_cc_admin)
    ) x(description, party, party_type, amount, due_date, recurrence_day, category_id, cost_center_id)
   where not exists (
     select 1 from public.payables p
      where p.company_id = v_company
        and p.recurrence = 'monthly'
        and lower(p.description) like lower(split_part(x.description, ' — Competência', 1)) || '%'
   );

  -- Stage the four missing commercial operations from the commission tab.
  create temporary table re9_stage_sales(
    source_key text primary key,
    broker_id uuid not null,
    development_id uuid not null,
    buyer text not null,
    unit text not null,
    sale_value numeric(14,2) not null,
    sale_date date not null,
    commission_pct numeric(9,6) not null,
    gross_amount numeric(14,2) not null,
    net_receivable numeric(14,2) not null,
    client_name text not null,
    due_date date not null,
    received_on date not null,
    broker_amount numeric(14,2) not null,
    payable_source_row integer
  ) on commit drop;

  insert into re9_stage_sales values
    ('Comissoes!28:Garden-comissao', v_soraya, v_dev_garden, 'Catarina Fernandes Macedo Bezerra', '1507 Torre 02 — Comissão', 869667.86, date '2026-09-15', 4, 34786.71, 33555.26, 'Ibidra', date '2026-09-15', date '2026-09-17', 16779.37, null),
    ('Comissoes!29:Garden-bonus', v_soraya, v_dev_garden, 'Catarina Fernandes Macedo Bezerra', '1507 Torre 02 — Bônus-Prêmio', 869667.86, date '2026-09-15', 1, 8696.68, 8388.82, 'Ibidra', date '2026-09-15', date '2026-09-17', 4194.84, null),
    ('Comissoes!30:Piazza', v_reno, v_dev_piazza, 'Breno Kelson e Alyana Elyda', '1504 Torre Trevi', 627909.92, date '2026-09-11', 4, 25116.40, 24227.28, 'Coliseo', date '2026-09-11', date '2026-09-22', 12114.89, 177),
    ('Comissoes!31:LaVie-1204', v_reno, v_dev_la_vie, 'Ana Karla Mourão / Ronaldo Luis', '1204', 931440.00, date '2026-09-14', 4, 37257.60, 35938.68, 'Harmony', date '2026-09-14', date '2026-09-25', 17971.20, 184);

  for v_row in select * from re9_stage_sales order by source_key loop
    select id into v_sale from public.sales
     where company_id = v_company
       and coalesce(notes, '') like '%Financeiro V2 — ' || v_row.source_key || '%'
     limit 1;

    if v_sale is null then
      insert into public.sales(
        company_id, development_id, unit, sale_value, buyer_name,
        payment_method, broker_id, sale_date, status, notes,
        commission_calculation_mode, commission_percentage,
        commission_amount_override, development_commission_percentage_snapshot,
        updated_at
      ) values (
        v_company, v_row.development_id, v_row.unit, v_row.sale_value, v_row.buyer,
        'cash', v_row.broker_id, v_row.sale_date, 'completed',
        'Origem: Financeiro V2 — ' || v_row.source_key
          || '. Data da venda: XXXX — foi usada a data de referência disponível na aba Comissões.',
        'manual_amount', v_row.commission_pct, v_row.gross_amount, v_row.commission_pct, now()
      ) returning id into v_sale;
    end if;

    select id into v_commission from public.commissions where sale_id = v_sale limit 1;
    if v_commission is null then
      insert into public.commissions(
        company_id, sale_id, total_amount, receipt_type, status, notes
      ) values (
        v_company, v_sale, v_row.gross_amount, 'launch_passthrough', 'pending',
        'Origem: Financeiro V2 — ' || v_row.source_key
          || '. Recebível usa o valor líquido informado na planilha; comissão mantém o valor bruto.'
      ) returning id into v_commission;
    end if;

    select ci.id, ci.receivable_id into v_installment, v_receivable
      from public.commission_installments ci
     where ci.commission_id = v_commission and ci.installment_number = 1
     limit 1;

    if v_receivable is null then
      insert into public.receivables(
        company_id, client_name, sale_id, description, amount, due_date,
        competence_date, category_id, cost_center_id, invoice_rule,
        recurrence, status, account, notes
      ) values (
        v_company, v_row.client_name, v_sale,
        'Comissão de venda — ' || (select full_name from public.employees where id = v_row.broker_id)
          || ' — ' || (select name from public.developments where id = v_row.development_id)
          || ' — Unidade ' || v_row.unit || ' — Comprador ' || v_row.buyer
          || ' — Competência ' || to_char(v_row.sale_date, 'MM/YYYY'),
        v_row.net_receivable, v_row.due_date, v_row.sale_date,
        v_revenue_commission, v_cc_commercial, 'on_receive', 'once', 'open',
        'C6 — RE9 Imob',
        'Origem: Financeiro V2 — ' || v_row.source_key
          || '. Valor líquido conciliado com Entradas.'
      ) returning id into v_receivable;

      insert into public.commission_installments(
        commission_id, installment_number, amount, expected_date, status, receivable_id
      ) values (
        v_commission, 1, v_row.net_receivable, v_row.due_date, 'pending', v_receivable
      ) returning id into v_installment;

      update public.receivables set commission_installment_id = v_installment
       where id = v_receivable;
    end if;

    if not exists (
      select 1 from public.commission_splits
       where commission_id = v_commission and beneficiary_type = 'broker'
    ) then
      select id into v_payable from public.payables
       where company_id = v_company
         and v_row.payable_source_row is not null
         and coalesce(notes, '') like '%Financeiro V2 — Saídas!A' || v_row.payable_source_row || '%'
       limit 1;

      insert into public.commission_splits(
        commission_id, beneficiary_type, beneficiary_id, percentage,
        amount, payable_id, status
      ) values (
        v_commission, 'broker', v_row.broker_id,
        round(v_row.broker_amount * 100 / v_row.sale_value, 6),
        v_row.broker_amount, v_payable,
        case when v_row.payable_source_row is null then 'paid' else 'paid' end
      );
      insert into public.commission_splits(
        commission_id, beneficiary_type, percentage, amount, status
      ) values (
        v_commission, 'brokerage',
        round((v_row.gross_amount - v_row.broker_amount) * 100 / v_row.gross_amount, 6),
        v_row.gross_amount - v_row.broker_amount, 'not_applicable'
      );
    end if;

    if (select received_amount from public.receivables where id = v_receivable) < v_row.net_receivable then
      perform public.settle_receivable(
        v_receivable,
        v_row.net_receivable - (select received_amount from public.receivables where id = v_receivable),
        (v_row.received_on::text || ' 12:00:00-03')::timestamptz,
        'pix', 'C6 — RE9 Imob', null,
        md5('financeiro-v2:receita:' || v_row.source_key)::uuid,
        'Origem: Financeiro V2 — valor líquido conciliado com Entradas.'
      );
    end if;
  end loop;

  -- Existing cash rows with the same amount but a different system date.
  -- The workbook date is applied for Me Mude and Soraya because both have an
  -- unambiguous amount/description match.
  select r.id into v_receivable from public.receivables r
   where r.company_id = v_company and r.amount = 3164.22
     and r.description ilike '%Me Mude%' and r.status = 'received'
   order by r.created_at desc limit 1;
  if v_receivable is not null then
    update public.settlements set settled_at = timestamptz '2026-08-14 12:00:00-03'
     where receivable_id = v_receivable and type = 'receipt';
    update public.transactions set date = date '2026-08-14'
     where receivable_id = v_receivable and not is_reversal;
    update public.receivables
       set due_date = date '2026-08-14', competence_date = date '2026-08-01',
           received_at = timestamptz '2026-08-14 12:00:00-03',
           description = 'Comissão de venda — Me Mude — Viva Vida Sul — Gilberto — Competência 08/2026',
           category_id = v_revenue_commission, cost_center_id = v_cc_commercial,
           account = 'C6 — RE9 Imob',
           notes = concat_ws(E'\n', nullif(notes, ''), 'Origem: Financeiro V2 — Entradas!A23.')
     where id = v_receivable;
  end if;

  select r.id into v_receivable from public.receivables r
   where r.company_id = v_company and r.amount = 11462.65
     and r.status = 'received' and r.description ilike '%Parte 1%'
   order by r.created_at desc limit 1;
  if v_receivable is not null then
    update public.settlements set settled_at = timestamptz '2026-08-18 12:00:00-03'
     where receivable_id = v_receivable and type = 'receipt';
    update public.transactions set date = date '2026-08-18'
     where receivable_id = v_receivable and not is_reversal;
    update public.receivables
       set due_date = date '2026-08-18', competence_date = date '2026-08-01',
           received_at = timestamptz '2026-08-18 12:00:00-03',
           description = 'Comissão de venda — Soraya — Enjoy 1201 — Parte 1 — Competência 08/2026',
           category_id = v_revenue_commission, cost_center_id = v_cc_commercial,
           account = 'C6 — RE9 Imob',
           notes = concat_ws(E'\n', nullif(notes, ''), 'Origem: Financeiro V2 — Entradas!A26 / Contas a Receber!A23.')
     where id = v_receivable;
  end if;

  -- Correct the three existing recent sales whose original receipts were
  -- reversed or still held the gross amount.  The cash tab supplies the net.
  for v_row in
    select * from (values
      ('Maxwell Onajart Abidiel Junior de Sousa', 21834.63::numeric, date '2026-09-14', 'Entradas!A28'),
      ('Lucas de Freitas Braga', 13882.53::numeric, date '2026-09-14', 'Entradas!A29'),
      ('Francimeyre dos Santos Teixeira Nogueira', 43451.37::numeric, date '2026-09-25', 'Entradas!A33 — parcela La Vie 806')
    ) x(buyer, net_amount, received_on, source_ref)
  loop
    select s.id, c.id, ci.id, r.id
      into v_sale, v_commission, v_installment, v_receivable
      from public.sales s
      join public.commissions c on c.sale_id = s.id
      join public.commission_installments ci on ci.commission_id = c.id and ci.installment_number = 1
      join public.receivables r on r.id = ci.receivable_id
     where s.company_id = v_company and s.buyer_name = v_row.buyer
     limit 1;

    if v_receivable is not null then
      update public.receivables
         set amount = v_row.net_amount, received_amount = 0, status = 'open',
             received_at = null, due_date = v_row.received_on,
             competence_date = coalesce(competence_date, date_trunc('month', v_row.received_on)::date),
             category_id = v_revenue_commission, cost_center_id = v_cc_commercial,
             account = 'C6 — RE9 Imob',
             notes = concat_ws(E'\n', nullif(notes, ''),
               'Conciliação Financeiro V2 — ' || v_row.source_ref || '. Valor líquido recebido.')
       where id = v_receivable;
      update public.commission_installments
         set amount = v_row.net_amount, expected_date = v_row.received_on,
             status = 'pending', received_date = null
       where id = v_installment;

      perform public.settle_receivable(
        v_receivable, v_row.net_amount,
        (v_row.received_on::text || ' 12:00:00-03')::timestamptz,
        'pix', 'C6 — RE9 Imob', null,
        md5('financeiro-v2:existing:' || v_row.buyer)::uuid,
        'Conciliação Financeiro V2 — ' || v_row.source_ref
      );
    end if;
  end loop;

  -- Vista Costeira differs by R$ 0.21 between gross commission and the cash
  -- row.  Preserve the cash figure and flag the source conflict explicitly.
  select s.id, c.id, ci.id, r.id
    into v_sale, v_commission, v_installment, v_receivable
    from public.sales s
    join public.commissions c on c.sale_id = s.id
    join public.commission_installments ci on ci.commission_id = c.id and ci.installment_number = 1
    join public.receivables r on r.id = ci.receivable_id
   where s.company_id = v_company
     and s.buyer_name = 'Paulo Roberto Freitas Coelho'
   limit 1;
  if v_receivable is not null then
    update public.settlements
       set amount = 18235.86, settled_at = timestamptz '2026-09-18 12:00:00-03',
           account = 'C6 — RE9 Imob',
           notes = concat_ws(E'\n', nullif(notes, ''), 'Financeiro V2 — Entradas!A31.')
     where receivable_id = v_receivable and type = 'receipt'
       and not exists (select 1 from public.settlements rv where rv.reversal_of = settlements.id);
    update public.transactions
       set amount = 18235.86, date = date '2026-09-18', account = 'C6 — RE9 Imob'
     where receivable_id = v_receivable and not is_reversal;
    update public.receivables
       set amount = 18235.86, received_amount = 18235.86, status = 'received',
           received_at = timestamptz '2026-09-18 12:00:00-03',
           due_date = date '2026-09-18', account = 'C6 — RE9 Imob',
           notes = concat_ws(E'\n', nullif(notes, ''),
             'XXXX — Financeiro V2 informa bruto R$ 18.235,65 e entrada R$ 18.235,86; caixa conciliado pela entrada.')
     where id = v_receivable;
    update public.commission_installments
       set amount = 18235.86, status = 'received', received_date = date '2026-09-18'
     where id = v_installment;
    update public.commissions set status = 'received' where id = v_commission;
  end if;

  -- Integrate the legacy Lucirene bonus into a complete sale/commission graph
  -- without duplicating its already-recorded receipt and payment.
  select id into v_sale from public.sales
   where company_id = v_company and coalesce(notes, '') like '%Financeiro V2 — Comissoes!6%'
   limit 1;
  if v_sale is null then
    insert into public.sales(
      company_id, development_id, unit, sale_value, buyer_name, payment_method,
      broker_id, sale_date, status, notes, commission_calculation_mode,
      commission_percentage, commission_amount_override,
      development_commission_percentage_snapshot, updated_at
    ) values (
      v_company, v_dev_mlar_kennedy, 'Bônus R$ 5.000', 5000,
      'Lucirene Souza', 'cash', v_andre, date '2026-08-18', 'completed',
      'Origem: Financeiro V2 — Comissoes!6. Data da venda: XXXX — usada a data de recebimento.',
      'manual_amount', 100, 5000, 4, now()
    ) returning id into v_sale;
  end if;
  select id into v_commission from public.commissions where sale_id = v_sale limit 1;
  if v_commission is null then
    insert into public.commissions(company_id, sale_id, total_amount, receipt_type, status, notes)
    values (v_company, v_sale, 5000, 'launch_passthrough', 'received',
      'Origem: Financeiro V2 — Comissoes!6. Comissão bruta R$ 5.000,00; líquido recebido R$ 4.823,50.')
    returning id into v_commission;
  end if;
  select id into v_receivable from public.receivables
   where company_id = v_company and amount = 4823.50 and status = 'received'
     and client_name ilike '%Lucirene%' order by created_at limit 1;
  if v_receivable is not null and not exists (
    select 1 from public.commission_installments where commission_id = v_commission
  ) then
    insert into public.commission_installments(
      commission_id, installment_number, amount, expected_date, received_date,
      status, receivable_id
    ) values (v_commission, 1, 4823.50, date '2026-08-18', date '2026-08-18', 'received', v_receivable)
    returning id into v_installment;
    update public.receivables
       set sale_id = v_sale, commission_installment_id = v_installment,
           category_id = v_revenue_commission, cost_center_id = v_cc_commercial,
           competence_date = date '2026-08-01', account = coalesce(account, 'C6 — RE9 Imob'),
           notes = concat_ws(E'\n', nullif(notes, ''), 'Vinculado à venda Financeiro V2 — Comissoes!6.')
     where id = v_receivable;
  end if;
  select id into v_payable from public.payables
   where company_id = v_company and amount = 2411.75 and status = 'paid'
     and description ilike '%Bônus%' order by created_at desc limit 1;
  if not exists (select 1 from public.commission_splits where commission_id = v_commission) then
    insert into public.commission_splits(
      commission_id, beneficiary_type, beneficiary_id, percentage, amount, payable_id, status
    ) values (v_commission, 'broker', v_andre, 48.235, 2411.75, v_payable, 'paid');
    insert into public.commission_splits(
      commission_id, beneficiary_type, percentage, amount, status
    ) values (v_commission, 'brokerage', 51.765, 2588.25, 'not_applicable');
  end if;
  update public.receivables
     set status = 'cancelled',
         notes = concat_ws(E'\n', nullif(notes, ''), 'Duplicidade neutralizada na conciliação Financeiro V2; registro correto: R$ 4.823,50 recebido.')
   where company_id = v_company and status = 'open'
     and client_name ilike '%Lucirene%'
     and amount in (2237.75, 2500.00);

  -- Reuse the actual paid payables for Lucas/Maxwell and remove stale graph
  -- obligations.  Amounts follow Saídas; spreadsheet control differences are
  -- left in notes as XXXX instead of silently changing cash.
  for v_row in
    select * from (values
      ('Maxwell Onajart Abidiel Junior de Sousa', 10917.31::numeric, 'Maxwell', 'XXXX — Contas a Pagar informa R$ 10.918,45; Saídas informa R$ 10.917,31.'),
      ('Lucas de Freitas Braga', 6941.27::numeric, 'Lucas', 'XXXX — Contas a Pagar informa R$ 6.491,99; Saídas informa R$ 6.941,27.')
    ) x(buyer, paid_amount, key_name, warning)
  loop
    select s.id, c.id into v_sale, v_commission
      from public.sales s join public.commissions c on c.sale_id = s.id
     where s.company_id = v_company and s.buyer_name = v_row.buyer limit 1;
    select p.id into v_payable from public.payables p
     where p.company_id = v_company and p.amount = v_row.paid_amount and p.status = 'paid'
       and (p.description ilike '%' || v_row.key_name || '%' or p.notes ilike '%' || v_row.key_name || '%')
     order by p.created_at desc limit 1;
    if v_commission is not null and v_payable is not null then
      update public.commission_splits
         set amount = v_row.paid_amount,
             percentage = round(v_row.paid_amount * 100 / (select sale_value from public.sales where id = v_sale), 6),
             payable_id = v_payable, status = 'paid'
       where commission_id = v_commission and beneficiary_type = 'broker';
      update public.payables
         set notes = concat_ws(E'\n', nullif(notes, ''), v_row.warning)
       where id = v_payable;
      update public.payables p
         set status = 'cancelled',
             notes = concat_ws(E'\n', nullif(p.notes, ''), 'Duplicidade sem movimentação neutralizada pela conciliação Financeiro V2.')
       where p.company_id = v_company and p.status = 'open' and p.paid_amount = 0
         and p.id <> v_payable
         and exists (
           select 1 from public.commission_splits cs
            where cs.commission_id = v_commission and cs.payable_id = p.id
         );
    end if;
  end loop;

  -- Align Luana and Márcio split payables with the control tab and cancel the
  -- generated duplicate.  The selected standalone rows have no cash activity.
  for v_row in
    select * from (values
      ('Luana', 6262.20::numeric, 'MLar Cambeba 1104'),
      ('Marcio Anderson', 8485.59::numeric, 'Bella Aldeota 1306')
    ) x(buyer, expected_amount, description_key)
  loop
    select s.id, c.id into v_sale, v_commission
      from public.sales s join public.commissions c on c.sale_id = s.id
     where s.company_id = v_company and s.buyer_name = v_row.buyer limit 1;
    select id into v_payable from public.payables
     where company_id = v_company and amount = v_row.expected_amount
       and status = 'open' and description ilike '%' || v_row.description_key || '%'
     order by created_at desc limit 1;
    if v_commission is not null and v_payable is not null then
      select payable_id into v_old_payable from public.commission_splits
       where commission_id = v_commission and beneficiary_type = 'broker' limit 1;
      update public.commission_splits
         set amount = v_row.expected_amount,
             percentage = round(v_row.expected_amount * 100 / (select sale_value from public.sales where id = v_sale), 6),
             payable_id = v_payable, status = 'pending'
       where commission_id = v_commission and beneficiary_type = 'broker';
      if v_old_payable is not null and v_old_payable <> v_payable then
        update public.payables
           set status = 'cancelled',
               notes = concat_ws(E'\n', nullif(notes, ''), 'Duplicidade gerada automaticamente e neutralizada pela conciliação Financeiro V2.')
         where id = v_old_payable and paid_amount = 0;
      end if;
    end if;
  end loop;

  -- Vinicius already has a settled standalone receivable. Link it to the sale
  -- graph and cancel the stale open graph receivable.
  select s.id, c.id, ci.id, ci.receivable_id
    into v_sale, v_commission, v_installment, v_old_receivable
    from public.sales s join public.commissions c on c.sale_id = s.id
    join public.commission_installments ci on ci.commission_id = c.id
   where s.company_id = v_company and s.buyer_name = 'Vinicius' limit 1;
  select id into v_receivable from public.receivables
   where company_id = v_company and amount = 13405.88 and status = 'received'
   order by created_at desc limit 1;
  if v_installment is not null and v_receivable is not null then
    update public.commission_installments
       set amount = 13405.88, expected_date = date '2026-08-18',
           received_date = date '2026-08-18', status = 'received', receivable_id = v_receivable
     where id = v_installment;
    update public.receivables
       set sale_id = v_sale, commission_installment_id = v_installment,
           category_id = v_revenue_commission, cost_center_id = v_cc_commercial,
           competence_date = date '2026-08-01', account = coalesce(account, 'C6 — RE9 Imob')
     where id = v_receivable;
    update public.commissions set status = 'received' where id = v_commission;
    update public.receivables
       set sale_id = null, commission_installment_id = null, status = 'cancelled',
           notes = concat_ws(E'\n', nullif(notes, ''), 'Duplicidade neutralizada; recebível líquido vinculado ao grafo da venda.')
     where id = v_old_receivable and id <> v_receivable and received_amount = 0;
  end if;

  -- Márcio uses the net control receivable; keep the gross amount on the
  -- commission and replace only the linked installment/receivable.
  select s.id, c.id, ci.id, ci.receivable_id
    into v_sale, v_commission, v_installment, v_old_receivable
    from public.sales s join public.commissions c on c.sale_id = s.id
    join public.commission_installments ci on ci.commission_id = c.id
   where s.company_id = v_company and s.buyer_name = 'Marcio Anderson' limit 1;
  select id into v_receivable from public.receivables
   where company_id = v_company and amount = 16971.18 and status = 'open'
     and client_name ilike '%Marcio%' order by created_at desc limit 1;
  if v_installment is not null and v_receivable is not null then
    update public.commission_installments
       set amount = 16971.18, expected_date = date '2026-08-31',
           received_date = null, status = 'pending', receivable_id = v_receivable
     where id = v_installment;
    update public.receivables
       set sale_id = v_sale, commission_installment_id = v_installment,
           category_id = v_revenue_commission, cost_center_id = v_cc_commercial,
           competence_date = date '2026-08-01', account = coalesce(account, 'XXXX')
     where id = v_receivable;
    update public.receivables
       set sale_id = null, commission_installment_id = null, status = 'cancelled',
           notes = concat_ws(E'\n', nullif(notes, ''), 'Duplicidade neutralizada; recebível líquido vinculado ao grafo da venda.')
     where id = v_old_receivable and id <> v_receivable and received_amount = 0;
  end if;

  -- Luana has one valid gross receivable and a duplicate RE9-share row.
  update public.receivables
     set status = 'cancelled',
         notes = concat_ws(E'\n', nullif(notes, ''), 'Duplicidade neutralizada; recebível bruto da venda permanece ativo.')
   where company_id = v_company and amount = 6262.20 and status = 'open'
     and client_name = 'Luana';

  -- Neutralize open Enjoy obligations already covered by the R$ 9.000,00 +
  -- R$ 2.462,65 payments and the Angélica aggregate payment in Saídas.
  update public.payables
     set status = 'cancelled',
         notes = concat_ws(E'\n', nullif(notes, ''),
           'Duplicidade neutralizada. Financeiro V2 registra o repasse como pago em lançamentos agregados de caixa.')
   where company_id = v_company and status = 'open' and paid_amount = 0
     and description ilike '%Enjoy 1201%';

  -- Vista Costeira payable: retain as pending because Contas a Pagar says
  -- paid but Saídas contains no corresponding cash row.
  select c.id into v_commission
    from public.sales s join public.commissions c on c.sale_id = s.id
   where s.company_id = v_company and s.buyer_name = 'Paulo Roberto Freitas Coelho' limit 1;
  select payable_id into v_payable from public.commission_splits
   where commission_id = v_commission and beneficiary_type = 'broker' limit 1;
  if v_payable is not null then
    update public.payables
       set amount = 7391.57, status = 'open', paid_amount = 0, paid_at = null,
           due_date = date '2026-09-18', competence_date = date '2026-09-01',
           description = 'Repasse de comissão — Reno — Vista Costeira — Unidade 205 Torre 4',
           notes = concat_ws(E'\n', nullif(notes, ''),
             'XXXX — Contas a Pagar informa pago, mas não existe linha correspondente em Saídas; mantido pendente.')
     where id = v_payable;
    update public.commission_splits
       set amount = 7391.57,
           percentage = round(7391.57 * 100 / (select sale_value from public.sales where id = (select sale_id from public.commissions where id = v_commission)), 6),
           status = 'pending'
     where commission_id = v_commission and beneficiary_type = 'broker';
  end if;

  -- Reactivate and adjust the La Vie 806 broker payable according to the
  -- control tab.  No cash line exists, therefore it remains pending.
  select c.id into v_commission
    from public.sales s join public.commissions c on c.sale_id = s.id
   where s.company_id = v_company and s.buyer_name = 'Francimeyre dos Santos Teixeira Nogueira' limit 1;
  select payable_id into v_payable from public.commission_splits
   where commission_id = v_commission and beneficiary_type = 'broker' limit 1;
  if v_payable is not null then
    update public.payables
       set amount = 21727.94, paid_amount = 0, status = 'open', paid_at = null,
           due_date = date '2026-10-01', competence_date = date '2026-09-01',
           description = 'Repasse de comissão — Reno — La Vie — Unidade 806',
           notes = concat_ws(E'\n', nullif(notes, ''), 'Origem: Financeiro V2 — Contas a Pagar!A41.')
     where id = v_payable;
    update public.commission_splits
       set amount = 21727.94,
           percentage = round(21727.94 * 100 / 1126150.00, 6),
           status = 'pending'
     where commission_id = v_commission and beneficiary_type = 'broker';
  end if;
  insert into public.payables(
    company_id, employee_id, description, amount, due_date, competence_date,
    category_id, cost_center_id, recurrence, status, payment_method, account, notes
  )
  select v_company, v_angelica, 'Repasse de comissão — Angélica — La Vie — Unidade 806',
         500, date '2026-10-01', date '2026-09-01', v_expense_commission,
         v_cc_commercial, 'once', 'open', 'pix', 'C6 — RE9 Imob',
         'Origem: Financeiro V2 — Contas a Pagar!A42.'
   where not exists (
     select 1 from public.payables p where p.company_id = v_company
       and p.status <> 'cancelled' and p.amount = 500
       and p.description = 'Repasse de comissão — Angélica — La Vie — Unidade 806'
   );

  -- Normalize operational fields. Unknown historical account/method values
  -- are explicit instead of silently invented.
  update public.payables p
     set competence_date = coalesce(p.competence_date, date_trunc('month', p.due_date)::date),
         payment_method = coalesce(
           p.payment_method,
           (select st.payment_method from public.settlements st
             where st.payable_id = p.id and st.type = 'payment'
             order by st.settled_at desc limit 1),
           case when p.category_id = v_expense_commission then 'pix' else 'other' end
         ),
         account = coalesce(
           nullif(p.account, ''),
           (select nullif(st.account, '') from public.settlements st
             where st.payable_id = p.id and st.type = 'payment'
             order by st.settled_at desc limit 1),
           'XXXX'
         ),
         category_id = coalesce(p.category_id, v_expense_root),
         cost_center_id = coalesce(p.cost_center_id,
           case when p.category_id in (v_expense_commission, v_expense_marketing)
             then case when p.category_id = v_expense_marketing then v_cc_marketing else v_cc_commercial end
             else v_cc_admin end),
         notes = case when coalesce(nullif(p.account, ''), '') = ''
           then concat_ws(E'\n', nullif(p.notes, ''), 'XXXX — conta bancária não identificada na origem histórica.')
           else p.notes end,
         description = replace(replace(p.description, 'Mlar', 'MLar'), 'Gardem', 'Garden'),
         updated_at = now()
   where p.company_id = v_company;

  update public.receivables r
     set competence_date = coalesce(r.competence_date, date_trunc('month', r.due_date)::date),
         account = coalesce(nullif(r.account, ''),
           case when r.status in ('received', 'partial') then 'XXXX' else 'XXXX' end),
         category_id = coalesce(r.category_id,
           case when r.description ilike '%comiss%' or r.description ilike '%bônus%'
             then v_revenue_commission else v_revenue_other end),
         cost_center_id = coalesce(r.cost_center_id,
           case when r.description ilike '%comiss%' or r.description ilike '%bônus%'
             then v_cc_commercial else v_cc_admin end),
         notes = case when coalesce(nullif(r.account, ''), '') = ''
           then concat_ws(E'\n', nullif(r.notes, ''), 'XXXX — conta bancária não identificada na origem histórica.')
           else r.notes end,
         description = replace(replace(r.description, 'Mlar', 'MLar'), 'Gardem', 'Garden'),
         updated_at = now()
   where r.company_id = v_company;

  update public.settlements st
     set account = coalesce(nullif(st.account, ''),
       case when st.type in ('payment', 'receipt') then 'XXXX' else st.account end)
   where st.company_id = v_company;
  update public.transactions t
     set account = coalesce(nullif(t.account, ''), 'XXXX'),
         description = replace(replace(t.description, 'Mlar', 'MLar'), 'Gardem', 'Garden')
   where t.company_id = v_company;

  -- Preserve the four source date anomalies as explicit data-quality notes;
  -- no valid 2026 production date is replaced by the workbook's year 2006.
  update public.payables
     set notes = concat_ws(E'\n', nullif(notes, ''),
       'XXXX — Saídas!A124:A127 exibem 15/08/2006 entre lançamentos de 2026; mantida a data válida já registrada no sistema.')
   where company_id = v_company and due_date between date '2026-08-14' and date '2026-08-20'
     and (
       description ilike '%Me Mude%'
       or description ilike '%Bella Aldeota%Bella Rio%Myrage%Oasy%'
       or description ilike '%Google%Imóveis Praia%'
       or description ilike '%Google%Fortaleza%'
     );

  -- Final transactional invariants for the rows touched by the sync.
  if exists (
    select 1 from public.payables p
     where p.company_id = v_company and p.status = 'paid' and p.paid_amount <> p.amount
  ) then
    raise exception 'Invariante violada: conta paga com valor divergente';
  end if;
  if exists (
    select 1 from public.receivables r
     where r.company_id = v_company and r.status = 'received' and r.received_amount <> r.amount
  ) then
    raise exception 'Invariante violada: conta recebida com valor divergente';
  end if;
end;
$$;

commit;
