-- Novos empreendimentos usam as regras comerciais mais comuns da RE9 quando
-- o cliente omite os percentuais. Valores existentes, inclusive zero, são
-- preservados e continuam editáveis pelos perfis autorizados.
alter table if exists public.developments
  alter column commission_percentage set default 4,
  alter column broker_split_percentage set default 2;

comment on column public.developments.commission_percentage is
  'Percentual de comissão da venda; padrão de 4% para novos empreendimentos.';

comment on column public.developments.broker_split_percentage is
  'Percentual de repasse ao corretor; padrão de 2% para novos empreendimentos.';
