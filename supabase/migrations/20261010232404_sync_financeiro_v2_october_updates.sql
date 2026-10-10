-- Incremental reconciliation with the current "Financeiro V2" workbook.
-- Reviewed on 2026-10-10. The workbook itself is not modified.
--
-- Source-of-truth policy:
--   * Cash tabs (Entradas/Saídas) drive settled cash transactions.
--   * Control-tab conflicts are retained as XXXX notes rather than silently
--     fabricating or deleting a real settlement.

begin;

do $$
declare
  v_company uuid;
  v_actor uuid;
  v_revenue_commission uuid;
  v_expense_commission uuid;
  v_expense_salary uuid;
  v_cc_admin uuid;
  v_cc_commercial uuid;
  v_soraya uuid;
  v_angelica uuid;
  v_development uuid;
  v_sale uuid;
  v_commission uuid;
  v_receivable uuid;
  v_installment uuid;
  v_broker_payable uuid;
  v_angelica_payable uuid;
  v_old_assis_payable uuid;
  v_old_assis_settlement uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('re9:financeiro-v2:2026-10-10', 0));

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
  perform set_config(
    're9.adjustment_reason',
    'Sincronização incremental com Financeiro V2 em 10/10/2026',
    true
  );

  select id into v_revenue_commission from public.chart_accounts
   where company_id = v_company and code = '1.1' limit 1;
  select id into v_expense_commission from public.chart_accounts
   where company_id = v_company and code = '2.1' limit 1;
  select id into v_expense_salary from public.chart_accounts
   where company_id = v_company and code = '2.7' limit 1;
  select id into v_cc_admin from public.cost_centers
   where company_id = v_company and lower(name) = 'administrativo' limit 1;
  select id into v_cc_commercial from public.cost_centers
   where company_id = v_company and lower(name) = 'comercial' limit 1;
  select id into v_soraya from public.employees
   where company_id = v_company and lower(full_name) = 'soraya' limit 1;
  select id into v_angelica from public.employees
   where company_id = v_company and lower(full_name) = lower('Angélica') limit 1;

  if v_revenue_commission is null or v_expense_commission is null
     or v_expense_salary is null or v_cc_admin is null or v_cc_commercial is null
     or v_soraya is null or v_angelica is null then
    raise exception 'Cadastros financeiros obrigatórios não encontrados';
  end if;

  -- Bravize appears for the first time in Comissões, Contas a Receber and
  -- Contas a Pagar. The developer was not informed by the workbook, so it is
  -- explicitly marked for team review.
  insert into public.developments(
    company_id, name, developer, type, commission_percentage,
    broker_split_percentage, is_active, notes
  )
  select v_company, 'Bravize', 'XXXX', 'launch', 4, 2, true,
         'Origem: Financeiro V2 — Comissões!A31. XXXX — confirmar construtora/incorporadora.'
   where not exists (
     select 1 from public.developments
      where company_id = v_company and lower(name) = lower('Bravize')
   );

  select id into v_development from public.developments
   where company_id = v_company and lower(name) = lower('Bravize') and is_active
   order by created_at limit 1;
  if v_development is null then
    raise exception 'Empreendimento Bravize não disponível';
  end if;

  select id into v_sale from public.sales
   where company_id = v_company
     and coalesce(notes, '') like '%Financeiro V2 — Comissoes!31:Bravize%'
   limit 1;
  if v_sale is null then
    insert into public.sales(
      company_id, development_id, unit, sale_value, buyer_name,
      payment_method, broker_id, sale_date, status, notes,
      commission_calculation_mode, commission_percentage,
      commission_amount_override, development_commission_percentage_snapshot,
      updated_at
    ) values (
      v_company, v_development, '206 T07', 206990.00, 'Gabrielle Kayle Braga',
      'cash', v_soraya, date '2026-10-31', 'completed',
      'Origem: Financeiro V2 — Comissoes!31:Bravize. XXXX — a planilha não informa a data da venda; usada a data prevista de recebimento.',
      'manual_amount', 4, 8279.60, 4, now()
    ) returning id into v_sale;
  end if;

  select id into v_commission from public.commissions where sale_id = v_sale limit 1;
  if v_commission is null then
    insert into public.commissions(company_id, sale_id, total_amount, receipt_type, status, notes)
    values (
      v_company, v_sale, 8279.60, 'launch_passthrough', 'pending',
      'Origem: Financeiro V2 — Comissões!A31. Valor bruto da comissão; recebível e repasse monetários arredondados a centavos.'
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
      v_company, 'Gabrielle Kayle Braga', v_sale,
      'Comissão de venda — Soraya — Bravize — Unidade 206 T07 — Compradora Gabrielle Kayle Braga — Competência 10/2026',
      3993.25, date '2026-10-31', date '2026-10-01',
      v_revenue_commission, v_cc_commercial, 'on_receive', 'once', 'open', 'XXXX',
      'Origem: Financeiro V2 — Contas a Receber!A33 e Comissões!A31. XXXX — a fórmula da planilha retorna R$ 3.993,25108; valor financeiro registrado em centavos (R$ 3.993,25).'
    ) returning id into v_receivable;
    insert into public.commission_installments(
      commission_id, installment_number, amount, expected_date, status, receivable_id
    ) values (
      v_commission, 1, 3993.25, date '2026-10-31', 'pending', v_receivable
    ) returning id into v_installment;
    update public.receivables
       set commission_installment_id = v_installment
     where id = v_receivable;
  end if;

  select id into v_broker_payable from public.payables
   where company_id = v_company
     and coalesce(notes, '') like '%Financeiro V2 — Contas a Pagar!A43:Bravize-Soraya%'
   limit 1;
  if v_broker_payable is null then
    insert into public.payables(
      company_id, employee_id, description, amount, due_date, competence_date,
      category_id, cost_center_id, recurrence, status, payment_method, account, notes
    ) values (
      v_company, v_soraya,
      'Repasse de comissão — Soraya — Bravize — Unidade 206 T07 — Competência 10/2026',
      3993.25, date '2026-10-31', date '2026-10-01',
      v_expense_commission, v_cc_commercial, 'once', 'open', 'pix', 'XXXX',
      'Origem: Financeiro V2 — Contas a Pagar!A43:Bravize-Soraya. XXXX — a fórmula da planilha retorna R$ 3.993,25108; valor financeiro registrado em centavos (R$ 3.993,25).'
    ) returning id into v_broker_payable;
  end if;

  select id into v_angelica_payable from public.payables
   where company_id = v_company
     and coalesce(notes, '') like '%Financeiro V2 — Contas a Pagar!A42:Bravize-Angélica%'
   limit 1;
  if v_angelica_payable is null then
    insert into public.payables(
      company_id, employee_id, description, amount, due_date, competence_date,
      category_id, cost_center_id, recurrence, status, payment_method, account, notes
    ) values (
      v_company, v_angelica,
      'Repasse de comissão — Angélica — Bravize — Unidade 206 T07 — Competência 10/2026',
      500.00, date '2026-10-31', date '2026-10-01',
      v_expense_commission, v_cc_commercial, 'once', 'open', 'pix', 'XXXX',
      'Origem: Financeiro V2 — Contas a Pagar!A42:Bravize-Angélica. XXXX — a planilha não informa a regra deste repasse de R$ 500,00.'
    ) returning id into v_angelica_payable;
  end if;

  if not exists (
    select 1 from public.commission_splits
     where commission_id = v_commission and beneficiary_type = 'broker'
  ) then
    insert into public.commission_splits(
      commission_id, beneficiary_type, beneficiary_id, percentage, amount, payable_id, status
    ) values (
      v_commission, 'broker', v_soraya,
      round(3993.25 * 100 / 206990.00, 6), 3993.25, v_broker_payable, 'pending'
    );
    insert into public.commission_splits(
      commission_id, beneficiary_type, percentage, amount, status
    ) values (
      v_commission, 'brokerage',
      round((8279.60 - 3993.25) * 100 / 8279.60, 6), 4286.35, 'not_applicable'
    );
  end if;

  -- The spreadsheet's monthly configuration changed Assis to R$ 1.500,00,
  -- while Saídas records an actual October payment of R$ 2.000,00. Preserve
  -- that cash event as historical and schedule the updated value from November.
  select p.id, st.id into v_old_assis_payable, v_old_assis_settlement
    from public.payables p
    left join public.settlements st
      on st.payable_id = p.id and st.type = 'payment' and st.reversal_of is null
   where p.company_id = v_company
     and p.description = 'Salário — Assis — Competência 10/2026'
     and p.amount = 2000.00
   order by st.settled_at desc nulls last, p.created_at desc
   limit 1;

  if v_old_assis_settlement is not null then
    perform public.reverse_payable_settlement(
      v_old_assis_settlement,
      timestamptz '2026-10-10 12:00:00-03',
      'Duplicidade: a planilha Financeiro V2 registra o pagamento de R$ 2.000,00 em Saídas!A185 em 08/10/2026; este pagamento recorrente adicional foi neutralizado.',
      md5('financeiro-v2:2026-10-10:assis-duplicate-reversal')::uuid
    );
  end if;
  if v_old_assis_payable is not null then
    update public.payables
       set status = 'cancelled',
           notes = concat_ws(E'\n', nullif(notes, ''),
             'XXXX — mensalidade-base alterada para R$ 1.500,00 em Custos Fixos; lançamento recorrente de outubro cancelado após estorno por duplicar Saídas!A185.'),
           updated_at = now()
     where id = v_old_assis_payable and paid_amount = 0;
  end if;

  insert into public.payables(
    company_id, employee_id, description, amount, due_date, competence_date,
    category_id, cost_center_id, recurrence, recurrence_day, status,
    payment_method, account, notes
  )
  select v_company, (
           select id from public.employees
            where company_id = v_company and lower(full_name) = 'assis'
            order by created_at limit 1
         ),
         'Salário — Assis — Competência 11/2026', 1500.00,
         date '2026-11-05', date '2026-11-01',
         v_expense_salary, v_cc_admin, 'monthly', 5, 'open',
         'other', 'XXXX',
         'Origem: Financeiro V2 — Custos Fixos!A5. XXXX — o pagamento de outubro em Saídas é R$ 2.000,00, enquanto a configuração mensal vigente informa R$ 1.500,00; atualização aplicada a partir de 11/2026.'
   where not exists (
     select 1 from public.payables p
      where p.company_id = v_company
        and p.description = 'Salário — Assis — Competência 11/2026'
        and p.status <> 'cancelled'
   );

  -- The workbook marks La Vie 806 as paid/received but has no matching cash
  -- entry in Saídas/Entradas. Existing settled records stay intact and carry
  -- an explicit reconciliation warning instead of being silently altered.
  update public.payables
     set notes = concat_ws(E'\n', nullif(notes, ''),
       'XXXX — Contas a Pagar informa PAGO, mas não há linha correspondente em Saídas; registro preservado até validação do time.')
   where company_id = v_company
     and description ilike '%La Vie%Unidade 806%'
     and status = 'paid';
  update public.receivables
     set notes = concat_ws(E'\n', nullif(notes, ''),
       'XXXX — Contas a Receber informa Recebido, mas não há linha correspondente em Entradas; registro preservado até validação do time.')
   where company_id = v_company
     and description ilike '%La Vie%806%'
     and status = 'received';

  if exists (
    select 1 from public.payables
     where company_id = v_company and status = 'paid' and paid_amount <> amount
  ) then
    raise exception 'Invariante violada: conta paga com valor divergente';
  end if;
  if exists (
    select 1 from public.receivables
     where company_id = v_company and status = 'received' and received_amount <> amount
  ) then
    raise exception 'Invariante violada: conta recebida com valor divergente';
  end if;
end;
$$;

commit;
