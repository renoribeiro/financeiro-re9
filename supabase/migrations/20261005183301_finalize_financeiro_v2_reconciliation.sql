-- Post-reconciliation cleanup for two historical duplicates that have no
-- effective cash activity but would otherwise overstate open balances.

begin;

do $$
declare
  v_company uuid;
  v_actor uuid;
  v_vinicius_commission uuid;
  v_paid_vinicius uuid;
  v_income numeric(18,2);
  v_expense numeric(18,2);
  v_open_receivables numeric(18,2);
begin
  perform pg_advisory_xact_lock(hashtextextended('re9:financeiro-v2:2026-10-05', 0));

  select id into v_company from public.companies
   where lower(trade_name) = lower('RE9 Imóveis') order by created_at limit 1;
  select cm.user_id into v_actor
    from public.company_members cm left join auth.users u on u.id = cm.user_id
   where cm.company_id = v_company
   order by (lower(coalesce(u.email, '')) = 'reno@re9imob.com.br') desc,
            (cm.role = 'super_admin') desc, cm.user_id
   limit 1;
  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('re9.adjustment_reason',
    'Revisão final da conciliação Financeiro V2 em 05/10/2026', true);

  -- The R$ 2,990.57 Mateus bonus is already received in another row.  This
  -- open copy has no receipt and is the exact difference between the system
  -- open balance and the workbook's R$ 42,426.00 pending total.
  update public.receivables
     set status = 'cancelled',
         notes = concat_ws(E'\n', nullif(notes, ''),
           'Duplicidade sem movimentação neutralizada na revisão Financeiro V2; o recebimento de R$ 2.990,57 já está registrado.'),
         updated_at = now()
   where company_id = v_company
     and status = 'open'
     and received_amount = 0
     and amount = 2990.57
     and description ilike '%Bônus%Bella Aldeota%Mateus%';

  select c.id into v_vinicius_commission
    from public.sales s join public.commissions c on c.sale_id = s.id
   where s.company_id = v_company and s.buyer_name = 'Vinicius' limit 1;
  select p.id into v_paid_vinicius
    from public.payables p
   where p.company_id = v_company and p.amount = 6219.34 and p.status = 'paid'
     and (p.description ilike '%Vinicius%' or p.notes ilike '%Vinicius%')
   order by p.created_at desc limit 1;

  if v_vinicius_commission is null or v_paid_vinicius is null then
    raise exception 'Não foi possível localizar o repasse liquidado de Vinicius';
  end if;

  update public.commission_splits
     set amount = 6219.34,
         payable_id = v_paid_vinicius,
         status = 'paid'
   where commission_id = v_vinicius_commission
     and beneficiary_type = 'broker';

  update public.payables
     set status = 'cancelled',
         notes = concat_ws(E'\n', nullif(notes, ''),
           'Duplicidade sem movimentação neutralizada; o repasse de R$ 6.219,34 já foi liquidado em 20/08/2026.'),
         updated_at = now()
   where company_id = v_company
     and status = 'open'
     and paid_amount = 0
     and (
       (amount = 6219.34 and description ilike '%MLar Cambeba 905%')
       or id in (
         select p2.id from public.payables p2
         where p2.company_id = v_company and p2.status = 'open'
           and p2.paid_amount = 0 and p2.amount = 6948.21
           and p2.description ilike '%Vinicius%'
       )
     );

  select
    round(coalesce(sum(amount) filter (where type = 'income' and not is_reversal), 0)
      - coalesce(sum(amount) filter (where type = 'income' and is_reversal), 0), 2),
    round(coalesce(sum(amount) filter (where type = 'expense' and not is_reversal), 0)
      - coalesce(sum(amount) filter (where type = 'expense' and is_reversal), 0), 2)
    into v_income, v_expense
    from public.transactions where company_id = v_company;
  if v_income <> 484876.81 or v_expense <> 385095.35 then
    raise exception 'Totais de caixa divergentes após revisão: entradas %, saídas %', v_income, v_expense;
  end if;

  select round(coalesce(sum(amount - received_amount), 0), 2)
    into v_open_receivables
    from public.receivables
   where company_id = v_company and status in ('open', 'partial', 'overdue');
  if v_open_receivables <> 42426.00 then
    raise exception 'Saldo de contas a receber divergente: %', v_open_receivables;
  end if;
end;
$$;

commit;
