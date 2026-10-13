-- Reconciles the Financeiro V2 cash ledger with the two cash movements added on
-- 13/10/2026.  The spreadsheet is the source of truth for settlement timing.
--
-- The previously imported La Vie 806 payable was marked fully paid from the
-- control tab before its cash movement existed in Saídas.  Reverse those two
-- historical settlements and register only the first payment now evidenced by
-- Saídas!A189.  The remaining amount stays open for a later source movement.

begin;

do $$
declare
  v_company constant uuid := 'e11042be-3d22-4048-9380-ac71e8dc9252';
  v_actor uuid;
  v_lavie_payable constant uuid := '439c24ae-c152-438e-a859-cb35171414e0';
  v_tax_payable uuid;
begin
  select cm.user_id
    into v_actor
    from public.company_members cm
    left join auth.users u on u.id = cm.user_id
   where cm.company_id = v_company
   order by (lower(coalesce(u.email, '')) = 'reno@re9imob.com.br') desc,
            (cm.role = 'super_admin') desc,
            cm.user_id
   limit 1;

  if v_actor is null then
    raise exception 'Usuário auditor não encontrado para a empresa %', v_company;
  end if;

  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config(
    're9.adjustment_reason',
    'Conciliação Financeiro V2 de 13/10/2026: sincronização de caixa com Saídas.',
    true
  );

  -- Idempotent reversal of the two premature La Vie 806 settlements.
  if not exists (
    select 1 from public.settlements where reversal_of = 'b5a37642-b46f-41c5-8e8d-11bb867cd31f'::uuid
  ) then
    perform public.reverse_payable_settlement(
      'b5a37642-b46f-41c5-8e8d-11bb867cd31f'::uuid,
      '2026-10-13 15:00:00+00'::timestamptz,
      'Conciliação Financeiro V2: pagamento integral antecipado; Saídas confirma apenas a primeira parcela.',
      'f65d9259-b50b-5aee-95f3-6d2d6804fb58'::uuid
    );
  end if;

  if not exists (
    select 1 from public.settlements where reversal_of = 'cc9a62aa-6495-413d-b6da-9ebcf6ba27de'::uuid
  ) then
    perform public.reverse_payable_settlement(
      'cc9a62aa-6495-413d-b6da-9ebcf6ba27de'::uuid,
      '2026-10-13 15:00:00+00'::timestamptz,
      'Conciliação Financeiro V2: pagamento integral antecipado; Saídas confirma apenas a primeira parcela.',
      '11f2810c-a5ea-584c-8f8a-24b7d089f1e4'::uuid
    );
  end if;

  -- Saídas!A189: first evidenced instalment of the La Vie 806 broker payout.
  perform public.settle_payable(
    v_lavie_payable,
    10863.97,
    '2026-10-13 15:00:00+00'::timestamptz,
    'pix',
    'XXXX',
    null,
    '5d06bf40-49e4-5d5b-8b9f-95d395c94100'::uuid
  );

  update public.payables
     set notes = concat_ws(E'\n', nullif(notes, ''),
       'Conciliação 13/10/2026 — Financeiro V2 — Saídas!A189: R$ 10.863,97 liquidado; saldo remanescente permanece em aberto.',
       'XXXX — conta bancária não identificada na linha de origem.'),
         updated_at = now()
   where id = v_lavie_payable
     and notes not like '%Saídas!A189%';

  -- Saídas!A188: tax paid by PIX.  The source gives no bank account, so retain
  -- the requested explicit XXXX marker instead of inferring one.
  select id into v_tax_payable
    from public.payables
   where company_id = v_company
     and notes like '%Saídas!A188%'
   limit 1;

  if v_tax_payable is null then
    insert into public.payables(
      company_id, supplier_id, description, amount, due_date, competence_date,
      category_id, cost_center_id, recurrence, status, payment_method, account, notes
    ) values (
      v_company,
      'ff8cfa1e-5e12-4172-a239-66d2af8b58b7'::uuid,
      'Impostos — Simples Nacional — Competência 10/2026',
      15181.64,
      '2026-10-13',
      '2026-10-01',
      '2a8b5efd-83b6-4d5f-841e-9a335a0cd6a1'::uuid,
      '480b8738-0379-40c8-b502-0089485013c6'::uuid,
      'once',
      'open',
      'pix',
      'XXXX',
      'Origem: Financeiro V2 — Saídas!A188. Comprovante: Imposto - Simples Nacional.jpeg.' || E'\n' ||
      'XXXX — conta bancária não identificada na linha de origem.'
    ) returning id into v_tax_payable;
  end if;

  perform public.settle_payable(
    v_tax_payable,
    15181.64,
    '2026-10-13 15:00:00+00'::timestamptz,
    'pix',
    'XXXX',
    null,
    '2d62f87b-d374-56a6-9e7a-f1b97bb97346'::uuid
  );
end $$;

commit;
