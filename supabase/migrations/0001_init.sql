-- ============================================================================
-- RE9 Finanças — Migração inicial (Supabase / PostgreSQL)
-- Reflete o modelo de dados do design spec (§4). Habilita RLS em todas as
-- tabelas com isolamento por company_id. Aplicar via `supabase db push` ou
-- `apply_migration`. Ver docs/MELHORIAS-2026-07.md (item A1).
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_cron";

-- ---- Core / multi-tenant ----------------------------------------------------

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trade_name text,
  type text not null check (type in ('real_estate', 'agency')),
  cnpj text unique not null,
  state_registration text,
  municipal_registration text,
  main_cnae text,
  tax_regime text check (tax_regime in ('simples_nacional', 'lucro_presumido', 'lucro_real')),
  creci text,
  city text,
  state text,
  logo_color text,
  certificate_a1 bytea,             -- criptografado (AES-256)
  certificate_a1_password text,     -- criptografado
  certificate_a1_expiry timestamptz,
  invoice_config jsonb,
  created_at timestamptz default now()
);

create table user_profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  avatar_color text,
  created_at timestamptz default now()
);

create table user_company_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references user_profiles on delete cascade,
  company_id uuid not null references companies on delete cascade,
  role text not null check (role in ('super_admin','admin','financial','broker','accountant','viewer')),
  is_active boolean default true,
  unique (user_id, company_id)
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies on delete cascade,
  user_id uuid references user_profiles,
  user_name text,
  action text not null,
  entity_type text,
  entity_id uuid,
  description text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz default now()
);

-- ---- Financeiro -------------------------------------------------------------

create table chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies on delete cascade,
  parent_id uuid references chart_of_accounts,
  code text,
  name text not null,
  type text not null check (type in ('revenue','expense','asset','liability')),
  is_active boolean default true
);

create table cost_centers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies on delete cascade,
  name text not null,
  description text,
  is_active boolean default true
);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies on delete cascade,
  document_type text not null check (document_type in ('cpf','cnpj')),
  document_number text not null,
  legal_name text not null,
  trade_name text,
  email text,
  phone text,
  bank_info jsonb,
  category_id uuid references chart_of_accounts,
  notes text,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies on delete cascade,
  user_id uuid references user_profiles,
  full_name text not null,
  cpf text not null,
  email text,
  phone text,
  employment_type text not null check (employment_type in ('clt','pj','freelancer','commission_only')),
  pj_cnpj text,
  base_salary numeric(12,2),
  bank_info jsonb,
  hire_date date,
  termination_date date,
  status text default 'active' check (status in ('active','inactive','terminated')),
  documents jsonb,
  created_at timestamptz default now()
);

create table sales (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies on delete cascade,
  development_id uuid,
  unit text,
  sale_value numeric(14,2) not null,
  buyer_name text not null,
  buyer_document text,
  buyer_contact text,
  payment_method text check (payment_method in ('cash','financing','installments_developer')),
  broker_id uuid references employees,
  sale_date date not null,
  status text default 'in_progress' check (status in ('in_progress','completed','cancelled')),
  notes text,
  created_at timestamptz default now()
);

create table developments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies on delete cascade,
  name text not null,
  developer text not null,
  address text,
  type text not null check (type in ('launch','resale')),
  commission_percentage numeric(5,2),
  broker_split_percentage numeric(5,2),
  notes text,
  is_active boolean default true,
  created_at timestamptz default now()
);

alter table sales add constraint sales_development_fk foreign key (development_id) references developments;

create table commissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies on delete cascade,
  sale_id uuid not null references sales on delete cascade,
  total_amount numeric(12,2) not null,
  receipt_type text not null check (receipt_type in ('launch_passthrough','resale_consolidated','resale_split')),
  status text default 'pending' check (status in ('pending','partial','received','cancelled')),
  notes text,
  created_at timestamptz default now()
);

create table receivables (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies on delete cascade,
  client_name text,
  client_document text,
  sale_id uuid references sales,
  commission_installment_id uuid,
  description text not null,
  amount numeric(12,2) not null,
  due_date date not null,
  competence_date date,
  category_id uuid references chart_of_accounts,
  cost_center_id uuid references cost_centers,
  invoice_rule text default 'on_receive' check (invoice_rule in ('immediate','on_receive','scheduled','recurring')),
  invoice_scheduled_date date,
  invoice_recurrence_day int,
  recurrence text default 'once' check (recurrence in ('once','monthly')),
  status text default 'open' check (status in ('open','received','overdue','cancelled')),
  received_at timestamptz,
  received_amount numeric(12,2),
  proof_url text,
  notes text,
  created_at timestamptz default now()
);

create table payables (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies on delete cascade,
  supplier_id uuid references suppliers,
  employee_id uuid references employees,
  description text not null,
  amount numeric(12,2) not null,
  due_date date not null,
  competence_date date,
  category_id uuid references chart_of_accounts,
  cost_center_id uuid references cost_centers,
  recurrence text default 'once',
  installment_number int,
  total_installments int,
  parent_payable_id uuid references payables,
  status text default 'open' check (status in ('open','paid','overdue','cancelled')),
  paid_at timestamptz,
  paid_amount numeric(12,2),
  proof_url text,
  notes text,
  created_at timestamptz default now()
);

create table commission_installments (
  id uuid primary key default gen_random_uuid(),
  commission_id uuid not null references commissions on delete cascade,
  installment_number int not null,
  amount numeric(12,2) not null,
  expected_date date not null,
  received_date date,
  status text default 'pending' check (status in ('pending','received','overdue','cancelled')),
  receivable_id uuid references receivables,
  created_at timestamptz default now()
);

create table commission_splits (
  id uuid primary key default gen_random_uuid(),
  commission_id uuid not null references commissions on delete cascade,
  beneficiary_type text not null check (beneficiary_type in ('brokerage','broker','manager','captador')),
  beneficiary_id uuid references employees,
  percentage numeric(5,2) not null,
  amount numeric(12,2) not null,
  payable_id uuid references payables,
  status text default 'pending' check (status in ('pending','paid','not_applicable')),
  created_at timestamptz default now()
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies on delete cascade,
  type text not null check (type in ('income','expense')),
  amount numeric(12,2) not null,
  date timestamptz not null,
  payable_id uuid references payables,
  receivable_id uuid references receivables,
  description text,
  proof_url text,
  created_at timestamptz default now()
);

create table funnel_cards (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies on delete cascade,
  development_id uuid references developments,
  broker_id uuid references employees,
  contact_name text not null,
  contact_phone text,
  contact_email text,
  estimated_value numeric(14,2),
  current_stage text default 'lead' check (current_stage in ('lead','visit','proposal','contract','deed')),
  sale_id uuid references sales,
  notes text,
  stage_entered_at timestamptz default now(),
  created_at timestamptz default now()
);

create table funnel_history (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references funnel_cards on delete cascade,
  from_stage text,
  to_stage text not null,
  changed_by uuid references user_profiles,
  changed_at timestamptz default now()
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies on delete cascade,
  receivable_id uuid references receivables,
  invoice_number text,
  series text,
  verification_code text,
  cnae text not null,
  iss_rate numeric(5,2) not null,
  service_description text not null,
  amount numeric(12,2) not null,
  taker_name text not null,
  taker_document text not null,
  taker_email text,
  status text default 'pending' check (status in ('pending','issued','cancelled','error')),
  error_message text,
  xml_url text,
  pdf_url text,
  issued_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz default now()
);
-- numeração de NFS-e única por empresa+série
create unique index invoices_number_per_company on invoices (company_id, series, invoice_number) where invoice_number is not null;

create table notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies on delete cascade,
  user_id uuid references user_profiles,
  type text not null,
  title text not null,
  message text not null,
  channel text not null check (channel in ('dashboard','whatsapp','email')),
  status text default 'pending' check (status in ('pending','sent','read','failed')),
  severity text check (severity in ('success','warning','error','info')),
  read_at timestamptz,
  created_at timestamptz default now()
);

create table notification_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies on delete cascade,
  type text not null,
  label text,
  is_active boolean default true,
  channels text[] default '{dashboard}',
  advance_days int,
  config jsonb
);

-- índices de performance (item D4)
create index on payables (company_id, due_date, status);
create index on receivables (company_id, due_date, status);
create index on transactions (company_id, date);
create index on sales (company_id, sale_date);

-- ---- RLS: isolamento total por empresa (design spec §3.1, §7) ---------------

create or replace function auth_company_ids() returns setof uuid
language sql stable security definer as $$
  select company_id from user_company_roles
  where user_id = auth.uid() and is_active
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'companies','chart_of_accounts','cost_centers','suppliers','employees',
    'sales','developments','commissions','receivables','payables',
    'commission_installments','commission_splits','transactions',
    'funnel_cards','funnel_history','invoices','notifications','notification_rules','audit_log'
  ] loop
    execute format('alter table %I enable row level security;', t);
  end loop;
end $$;

-- policy por company_id (as tabelas sem company_id direto usam joins nas app queries)
do $$
declare t text;
begin
  foreach t in array array[
    'chart_of_accounts','cost_centers','suppliers','employees','sales',
    'developments','commissions','receivables','payables','transactions',
    'funnel_cards','invoices','notifications','notification_rules','audit_log'
  ] loop
    execute format($f$
      create policy tenant_isolation on %I
      using (company_id in (select auth_company_ids()))
      with check (company_id in (select auth_company_ids()));
    $f$, t);
  end loop;
end $$;

create policy companies_visible on companies
  using (id in (select auth_company_ids()));
