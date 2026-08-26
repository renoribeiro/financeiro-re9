set statement_timeout = '30s';

-- Capture the residual cases detected by the post-migration audit before
-- refining them. Matching by content keeps this migration portable.
insert into private.financial_description_backups (
  migration_name, entity_type, entity_id, company_id,
  old_description, new_description, old_notes
)
select
  'refine_financial_description_outliers',
  'payable',
  p.id,
  p.company_id,
  p.description,
  case
    when p.description = 'Adiantamento Quinzenal' then 'Adiantamento quinzenal'
    when p.description = 'Pagamento OLX' then U&'M\00EDdia paga \2014 OLX'
    when p.description = 'Pagamento dos Chips' then U&'Telefonia \2014 Chips'
    when p.description like 'Pagamento Saldo Google%' then
      U&'M\00EDdia paga \2014 Google Ads \2014 Saldo \2014 ' ||
      btrim(regexp_replace(p.description, '^Pagamento Saldo Google[[:space:]]*', '', 'i'), U&' \2014')
  end,
  p.notes
from public.payables p
where p.description in ('Adiantamento Quinzenal', 'Pagamento OLX', 'Pagamento dos Chips')
   or p.description like 'Pagamento Saldo Google%'
on conflict (migration_name, entity_type, entity_id) do nothing;

insert into private.financial_description_backups (
  migration_name, entity_type, entity_id, company_id,
  old_description, new_description, old_notes
)
select distinct on (t.id)
  'refine_financial_description_outliers',
  'transaction',
  t.id,
  t.company_id,
  t.description,
  backup.new_description,
  null
from public.transactions t
join private.financial_description_backups backup
  on backup.migration_name = 'refine_financial_description_outliers'
 and backup.entity_type = 'payable'
 and backup.entity_id = t.payable_id
where t.description is not distinct from backup.old_description
on conflict (migration_name, entity_type, entity_id) do nothing;

update public.transactions t
set description = backup.new_description
from private.financial_description_backups backup
where backup.migration_name = 'refine_financial_description_outliers'
  and backup.entity_type = 'transaction'
  and backup.entity_id = t.id
  and t.description is distinct from backup.new_description;

update public.payables p
set description = backup.new_description
from private.financial_description_backups backup
where backup.migration_name = 'refine_financial_description_outliers'
  and backup.entity_type = 'payable'
  and backup.entity_id = p.id
  and p.description is distinct from backup.new_description;
