-- Reconciles historical income transactions with Contas a Receber visibility.
-- These receipts already exist in cash, but their linked receivables were
-- mistakenly cancelled during an earlier de-duplication pass.

begin;

do $$
declare
  v_company constant uuid := 'e11042be-3d22-4048-9380-ac71e8dc9252';
  v_actor uuid;
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
    'Conciliação Financeiro V2: recebimentos existentes devem permanecer visíveis em Contas a Receber.',
    true
  );

  update public.receivables
     set status = 'received',
         received_amount = amount,
         received_at = coalesce(received_at, due_date::timestamptz),
         notes = concat_ws(E'\n', nullif(notes, ''),
           'Conciliação 14/10/2026 — recebível reativado porque existe entrada de caixa vinculada.',
           'XXXX — validar a origem comercial desta entrada histórica; o caixa foi preservado.'),
         updated_at = now()
   where company_id = v_company
     and id in (
       '793119e9-ebc9-42fb-abc8-1edf1a0ad8ca'::uuid,
       'e89bcb53-44a9-4a7d-b28a-3c83fe9f6145'::uuid
     )
     and exists (
       select 1
         from public.transactions t
        where t.receivable_id = receivables.id
          and t.company_id = v_company
          and t.type = 'income'
          and not t.is_reversal
     );
end $$;

commit;
