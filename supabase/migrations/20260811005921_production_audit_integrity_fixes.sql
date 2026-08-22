-- Correções de integridade encontradas na auditoria de produção de 2026-08-10.

-- Campos já existentes nos formulários e modelos de domínio que ainda não
-- tinham persistência no schema remoto.
alter table public.suppliers
  add column if not exists category_id uuid references public.chart_accounts(id) on delete set null,
  add column if not exists bank_info jsonb not null default '{}'::jsonb;

alter table public.employees
  add column if not exists pj_cnpj text,
  add column if not exists bank_info jsonb not null default '{}'::jsonb,
  add column if not exists hire_date date,
  add column if not exists termination_date date;

alter table public.invoices
  add column if not exists cnae_code text,
  add column if not exists ctiss text,
  add column if not exists iss_retido boolean not null default false,
  add column if not exists deductions_amount numeric(18,2) not null default 0,
  add column if not exists iss_amount numeric(18,2),
  add column if not exists net_amount numeric(18,2),
  add column if not exists municipio_ibge text,
  add column if not exists competencia text,
  add column if not exists rps_type integer not null default 1,
  add column if not exists taker_address jsonb not null default '{}'::jsonb,
  add column if not exists public_url text,
  add column if not exists cancel_reason text;

alter table public.invoices drop constraint if exists invoices_deductions_amount_check;
alter table public.invoices add constraint invoices_deductions_amount_check
  check (deductions_amount >= 0 and deductions_amount <= amount);

alter table public.invoices drop constraint if exists invoices_rps_type_check;
alter table public.invoices add constraint invoices_rps_type_check check (rps_type between 1 and 5);

update public.invoices
   set status = 'pending',
       error_message = coalesce(error_message, 'Registro legado simulado; requer emissão fiscal real.')
 where status = 'simulated';

alter table public.invoices drop constraint if exists invoices_status_check;
alter table public.invoices add constraint invoices_status_check
  check (status in ('pending', 'processing', 'issued', 'cancelled', 'error'));

create index if not exists suppliers_category_id_idx on public.suppliers(category_id);

drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications for insert to authenticated
  with check (
    private.can_manage_finance(company_id)
    and (user_id is null or user_id = (select auth.uid()))
  );

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using (
    user_id = (select auth.uid())
    or (user_id is null and private.is_company_member(company_id))
  )
  with check (
    user_id = (select auth.uid())
    or (user_id is null and private.is_company_member(company_id))
  );

grant insert, update on public.notifications to authenticated;

update public.invoices i
   set cnae_code = coalesce(nullif(i.cnae_code, ''), nullif(c.main_cnae, ''))
  from public.companies c
 where c.id = i.company_id
   and nullif(i.cnae_code, '') is null;

-- Corretor deve consultar somente vendas e comissões vinculadas ao próprio
-- cadastro de colaborador. Perfis administrativos e de leitura financeira
-- continuam com a visão integral da empresa.
create or replace function private.can_read_sale(target_company uuid, target_broker uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and (
      private.has_company_role(
        target_company,
        array['super_admin', 'admin', 'financial', 'accountant', 'viewer']
      )
      or exists (
        select 1
          from public.company_members cm
          join public.employees e
            on e.company_id = cm.company_id
           and e.user_id = cm.user_id
         where cm.company_id = target_company
           and cm.user_id = (select auth.uid())
           and cm.role = 'broker'
           and e.id = target_broker
      )
    );
$$;

create or replace function private.can_read_commission(target_commission uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.commissions c
      join public.sales s on s.id = c.sale_id
     where c.id = target_commission
       and private.can_read_sale(c.company_id, s.broker_id)
  );
$$;

drop policy if exists sales_select on public.sales;
create policy sales_select on public.sales for select to authenticated
  using (private.can_read_sale(company_id, broker_id));

drop policy if exists commissions_select on public.commissions;
create policy commissions_select on public.commissions for select to authenticated
  using (private.can_read_commission(id));

drop policy if exists commission_installments_select on public.commission_installments;
create policy commission_installments_select on public.commission_installments for select to authenticated
  using (private.can_read_commission(commission_id));

drop policy if exists commission_splits_select on public.commission_splits;
create policy commission_splits_select on public.commission_splits for select to authenticated
  using (private.can_read_commission(commission_id));

revoke all on function private.can_read_sale(uuid, uuid) from public, anon;
revoke all on function private.can_read_commission(uuid) from public, anon;
grant execute on function private.can_read_sale(uuid, uuid) to authenticated;
grant execute on function private.can_read_commission(uuid) to authenticated;
