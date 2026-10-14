-- The two historical income entries restored by the previous reconciliation
-- have matching reversal transactions.  Their net cash effect is zero, so they
-- must remain cancelled and must not appear as received income.

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
    'Conciliação Financeiro V2: títulos com entrada integralmente estornada permanecem cancelados.',
    true
  );

  update public.receivables r
     set status = 'cancelled',
         received_amount = 0,
         received_at = null,
         notes = concat_ws(E'\n', nullif(r.notes, ''),
           'Conciliação 14/10/2026 — título cancelado: a entrada histórica possui estorno integral; efeito líquido no caixa é R$ 0,00.'),
         updated_at = now()
   where r.company_id = v_company
     and r.id in (
       '793119e9-ebc9-42fb-abc8-1edf1a0ad8ca'::uuid,
       'e89bcb53-44a9-4a7d-b28a-3c83fe9f6145'::uuid
     )
     and not exists (
       select 1
         from public.transactions t
        where t.receivable_id = r.id
          and t.company_id = v_company
          and t.type = 'income'
        group by t.receivable_id
       having round(sum(case when t.is_reversal then -t.amount else t.amount end)::numeric, 2) <> 0
     );
end $$;

commit;
