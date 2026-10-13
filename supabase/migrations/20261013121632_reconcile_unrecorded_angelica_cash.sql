-- Financeiro V2 has no cash movement for this control-tab-only settlement.
-- Keep the payable open rather than counting an unsupported R$ 500,00 outflow.

begin;

do $$
declare
  v_company constant uuid := 'e11042be-3d22-4048-9380-ac71e8dc9252';
  v_actor uuid;
  v_payable constant uuid := '2e334f95-733e-4a56-9a2d-b428345adf95';
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
    'Conciliação Financeiro V2 de 13/10/2026: estorno de baixa sem movimento em Saídas.',
    true
  );

  if not exists (
    select 1
      from public.settlements
     where reversal_of = '4e6b5571-74d9-4531-8105-a1b832bc4c16'::uuid
  ) then
    perform public.reverse_payable_settlement(
      '4e6b5571-74d9-4531-8105-a1b832bc4c16'::uuid,
      '2026-10-13 15:00:00+00'::timestamptz,
      'Conciliação Financeiro V2: Contas a Pagar indicava pago, sem movimento correspondente em Saídas.',
      'd8e33644-334f-50d7-863e-3e19d93d9e54'::uuid
    );
  end if;

  update public.payables
     set notes = concat_ws(E'\n', nullif(notes, ''),
       'Conciliação 13/10/2026 — baixa estornada: não há movimento correspondente em Financeiro V2 — Saídas.',
       'XXXX — validar posteriormente se houve pagamento fora do caixa da planilha.'),
         updated_at = now()
   where id = v_payable
     and notes not like '%baixa estornada: não há movimento correspondente%';
end $$;

commit;
