# RE9 Finanças — Design Spec

> Sistema de gestão financeira multi-tenant para imobiliárias e agências de marketing digital.
> Empresas: RE9 Imóveis (imobiliária) e RE9 Online Branding (agência de marketing digital).
> Localização: Fortaleza/CE — integração com SEFIN Fortaleza para emissão de NFS-e.

---

## 1. Visão Geral

### 1.1 Objetivo

Criar o melhor sistema de gestão financeira para imobiliárias do Brasil, unificando controle financeiro, gestão comercial, funil de vendas, motor de comissões e emissão automatizada de NFS-e em uma única plataforma multi-tenant.

### 1.2 Empresas Atendidas

| Empresa | Tipo | Operação |
|---------|------|----------|
| RE9 Imóveis | Imobiliária (CRECI-CE 24868) | Vendas de imóveis (lançamentos e avulsos), comissões de corretores, repasse de construtoras |
| RE9 Online Branding Ltda | Agência de marketing digital | Contratos mensais de clientes, serviços avulsos, freelancers, ferramentas SaaS |

### 1.3 Stack Técnico

- **Frontend:** Next.js 14 (App Router), Tailwind CSS, shadcn/ui, template de dashboard comprado (a ser integrado)
- **Backend:** Next.js API Routes + Supabase (PostgreSQL com Row Level Security)
- **Auth:** Supabase Auth com controle de perfis/permissões por empresa
- **NFS-e:** Integração direta com API SEFIN Fortaleza (ABRASF, SOAP), assinatura com certificado A1
- **Notificações:** Evolution API (WhatsApp) + SMTP (email)
- **IA:** Claude API para importador inteligente de migração
- **Deploy:** Docker Compose + Traefik na Hostinger VPS
- **CI/CD:** GitHub Actions → GitHub Container Registry → VPS
- **Domínio:** financeiro.re9imob.com.br
- **SSL:** Let's Encrypt via Traefik (automático)

---

## 2. Perfis de Acesso

| Perfil | Escopo | Permissões |
|--------|--------|------------|
| Super Admin | Todas as empresas | Acesso total, dashboard consolidado, gestão de empresas e usuários |
| Admin da Empresa | Uma empresa | Acesso total dentro da empresa atribuída |
| Financeiro | Uma empresa | Contas a pagar/receber, fluxo de caixa, fornecedores, NFS-e. Sem acesso a comissões individuais de corretores |
| Corretor | Uma empresa | Somente suas próprias vendas, comissões e funil pessoal |
| Contador | Uma empresa | Somente leitura: relatórios, exportações contábeis, NFS-e |
| Visualizador | Uma empresa | Dashboard de leitura, sem edição |

Um mesmo usuário pode ter perfis diferentes em empresas diferentes (ex: Super Admin na RE9 Imob e Admin na RE9 Online).

---

## 3. Módulos

### 3.1 Auth & Multi-tenant

- Login com email/senha via Supabase Auth
- Recuperação de senha por email
- Seletor de empresa no header (para usuários com acesso a múltiplas empresas)
- Middleware de contexto que injeta company_id em todas as queries
- Row Level Security (RLS) no Supabase em todas as tabelas — nenhum dado vaza entre empresas
- Audit log automático em toda ação relevante (quem, o quê, quando, empresa)

### 3.2 Dashboard

**Dashboard por empresa:**
- Saldo atual (entradas - saídas do mês)
- Contas a pagar vencendo essa semana (quantidade + valor total)
- Contas a receber vencendo essa semana (quantidade + valor total)
- Fluxo de caixa dos últimos 30 dias (gráfico de linha)
- DRE resumido do mês corrente
- Alertas visuais com cards coloridos (verde/amarelo/vermelho)

**Indicadores específicos RE9 Imob:**
- Vendas do mês (quantidade + VGV)
- Comissões pendentes de recebimento (valor total)
- Funil de vendas por estágio (mini pipeline visual)

**Indicadores específicos RE9 Online:**
- Contratos ativos (quantidade + faturamento mensal)
- Inadimplência de clientes (quantidade + valor)

**Dashboard consolidado (Super Admin):**
- Visão somada de todas as empresas
- Comparativo entre empresas

**Alertas inteligentes no dashboard:**
- Cards com cores: verde (ok), amarelo (atenção), vermelho (crítico)
- Exemplos: "3 contas vencem amanhã", "comissão atrasada 15 dias", "fluxo negativo em 7 dias"

### 3.3 Plano de Contas

- Estrutura hierárquica: Tipo → Categoria → Subcategoria
- Tipos: Receita, Despesa, Ativo, Passivo
- Pré-configurado por tipo de empresa com categorias padrão:
  - **Agência:** Salários, Ferramentas SaaS, Freelancers, Aluguel, Impostos, Meta Ads (reembolso), etc.
  - **Imobiliária:** Repasse de comissões, CRECI, Cartório, Marketing, Aluguel, Impostos, etc.
- Totalmente editável pelo admin (criar, renomear, mover, desativar categorias)

### 3.4 Fornecedores

- CNPJ ou CPF com validação
- Razão social, nome fantasia, contato
- Dados bancários (banco, agência, conta, PIX)
- Categoria vinculada ao plano de contas
- Histórico de pagamentos (auto-populado pelas contas a pagar)
- Observações livres
- Status: ativo/inativo

### 3.5 Colaboradores

- Tipos de vínculo: CLT, PJ, Freelancer, Comissionado Puro
- Dados pessoais: nome, CPF, email, telefone, endereço
- Dados bancários (banco, agência, conta, PIX)
- Documentos anexados (contrato, RG, CPF, etc.)
- Para CLT: salário bruto, data de admissão
- Para PJ: valor mensal do contrato, CNPJ da PJ
- Para Freelancer: sem valor fixo (pago por projeto via contas a pagar)
- Para Comissionado Puro: sem valor fixo (recebe apenas via motor de comissões)
- Status: ativo/inativo/desligado

### 3.6 Contas a Pagar

- Vinculação com fornecedor ou colaborador
- Categoria do plano de contas + centro de custo
- Valor, data de vencimento, data de competência
- Recorrência: única, semanal, mensal, trimestral, anual (gera lançamentos automáticos)
- Status: aberto, pago, vencido, cancelado
- Baixa manual (com upload de comprovante) ou automática (ao vincular transação)
- Anexo de boleto/nota/comprovante (upload de arquivos)
- Filtros: por período, fornecedor, categoria, centro de custo, status
- Parcelamento: dividir uma conta em N parcelas com vencimentos sequenciais

### 3.7 Contas a Receber

- Vinculação com cliente, venda ou contrato
- Categoria do plano de contas + centro de custo
- Valor, data de vencimento, data de competência
- **Regra de emissão de NFS-e (configurável por lançamento):**
  - Antecipada: emite no ato do cadastro
  - Ao receber: emite automaticamente quando a baixa é registrada
  - Agendada: emite em uma data específica definida pelo admin
  - Recorrente: emite todo mês em dia fixo (para contratos mensais da RE9 Online)
- Status: aberto, recebido, vencido, cancelado
- Baixa manual ou automática
- Filtros: por período, cliente, categoria, status, regra NFS-e

### 3.8 Fluxo de Caixa

- Visão temporal: diária, semanal, mensal
- Entradas realizadas vs saídas realizadas
- Entradas previstas vs saídas previstas (baseado em contas a pagar/receber abertas)
- Saldo projetado (saldo atual + previstos)
- Gráfico de linha: entradas, saídas, saldo acumulado
- Alerta automático: se saldo projetado fica negativo nos próximos 7/15/30 dias
- Filtro por centro de custo

### 3.9 Centros de Custo

- Nome, descrição, empresa
- Exemplos RE9 Imob: "Empreendimento VERT Macêdo", "Empreendimento Inc Green"
- Exemplos RE9 Online: "Cliente Mega Imóveis", "Cliente Direcional"
- Vinculável em contas a pagar e a receber
- Relatório de resultado por centro de custo

### 3.10 Vendas (RE9 Imob)

- Empreendimento (vinculado ao cadastro de empreendimentos)
- Unidade vendida (bloco, andar, número)
- Valor total da venda (VGV)
- Dados do comprador (nome, CPF/CNPJ, contato)
- Forma de pagamento do comprador (à vista, financiamento, parcelado com construtora)
- Corretor responsável
- Data da venda
- Status: em andamento, concluída, distratada
- Documentos anexados (proposta, contrato, escritura)
- Vinculação automática com comissão e contas a receber

### 3.11 Funil de Vendas (RE9 Imob)

- Estágios: Lead → Visita → Proposta → Contrato → Escritura
- Drag & drop entre estágios
- Cada card mostra: nome do lead/comprador, empreendimento, valor, corretor, dias no estágio
- Timestamps automáticos a cada transição de estágio
- Métricas de conversão:
  - Por corretor: % de conversão em cada estágio, tempo médio por estágio
  - Por empreendimento: volume de leads, taxa de fechamento, ticket médio
- Filtros: por corretor, empreendimento, período

### 3.12 Motor de Comissões (RE9 Imob)

**Cadastro de empreendimentos com tabela de comissão:**
- Nome, construtora, endereço, tipo (lançamento/avulso)
- % de comissão que a construtora paga à imobiliária
- % de repasse ao corretor
- Observações sobre modelo de recebimento

**Três cenários de recebimento:**

1. **Lançamento com repasse:** Construtora paga comissão total para RE9 Imob → RE9 retém sua parte → RE9 repassa parte do corretor. O sistema gera:
   - Conta a receber da construtora (comissão total)
   - Conta a pagar ao corretor (parte do corretor) — executada após recebimento

2. **Avulso consolidado:** RE9 recebe tudo do comprador e repassa ao corretor. O sistema gera:
   - Conta a receber do comprador (comissão total)
   - Conta a pagar ao corretor (parte do corretor) — executada após recebimento

3. **Avulso dividido:** Comprador paga diretamente: parte para RE9, parte para corretor. O sistema gera:
   - Conta a receber do comprador (apenas parte da RE9)
   - Registro informativo da parte do corretor (sem gerar conta a pagar, pois o corretor já recebeu direto)

**Parcelas:**
- Comissões podem ser recebidas em múltiplas parcelas
- Cada parcela tem: número, valor, data prevista, data de recebimento, status
- O repasse ao corretor pode ser vinculado parcela a parcela ou ao total

**Commission splits:**
- Divisão percentual entre imobiliária e corretor
- Possibilidade de splits adicionais (gerente, captador) — configurável por venda

### 3.13 Portal do Corretor

Tela simplificada acessível pelo perfil Corretor:
- Minhas vendas (lista com status e valores)
- Minhas comissões (pendentes, recebidas, timeline de parcelas)
- Meu funil (pipeline pessoal com seus leads)
- Meus indicadores (vendas do mês, taxa de conversão, comissão acumulada)

### 3.14 Notas Fiscais (NFS-e)

**Integração com SEFIN Fortaleza:**
- Protocolo: ABRASF (padrão nacional), webservice SOAP
- Assinatura digital: certificado A1 (arquivo .pfx) armazenado criptografado no banco, um por empresa
- CNAEs e alíquotas ISS configuráveis por empresa

**Fluxo de emissão:**
1. Sistema monta XML da NFS-e com dados do tomador, serviço, valor, empresa emitente
2. Assina digitalmente com certificado A1
3. Envia à API SEFIN via SOAP
4. Recebe retorno com número da NF e código de verificação
5. Gera PDF (DANFSE) e armazena com XML
6. Envia PDF por email ao tomador automaticamente
7. Em caso de erro: registra no painel e notifica admin via WhatsApp

**Modos de emissão (configurável por lançamento de conta a receber):**
- Antecipada: emite no ato do cadastro do recebimento
- Ao receber: emite quando a baixa é registrada
- Agendada: emite na data específica configurada
- Recorrente: job agendado (cron) verifica diariamente quais notas recorrentes devem ser emitidas

**Painel de NFS-e:**
- Lista de notas emitidas com filtros (período, status, empresa, tomador)
- Status: pendente, emitida, cancelada, com erro
- Ações: visualizar XML/PDF, reenviar email, cancelar nota
- Download em lote (ZIP com XMLs + PDFs de um período)

### 3.15 Relatórios

- **DRE (Demonstrativo de Resultado):** receitas - despesas por período, comparativo mensal
- **Balancete:** saldos por conta do plano de contas
- **Relatório de comissões:** por corretor, empreendimento, período, com status de recebimento/repasse
- **Aging de inadimplência:** contas a receber vencidas agrupadas por faixa (1-30, 31-60, 61-90, 90+ dias)
- **Comparativo mensal/anual:** evolução de receitas, despesas e resultado
- **Resultado por centro de custo:** receitas e despesas agrupadas por projeto/cliente
- **Exportação:** PDF, Excel (.xlsx), CSV
- Todos os relatórios filtráveis por empresa e período

### 3.16 Alertas & Notificações

**Engine de notificações:**
- Cada regra define: condição, mensagem, canal(is), destinatário(s)
- Canais: dashboard (sempre), WhatsApp (via Evolution API), email (via SMTP)

**Regras pré-configuradas (configuráveis pelo admin):**
- Contas a pagar vencendo em 3 dias
- Contas a pagar vencendo hoje
- Comissão da construtora atrasada X dias
- Fluxo de caixa projetado negativo em 7 dias
- NFS-e emitida com sucesso
- NFS-e com erro de emissão
- Venda registrada por corretor
- Comissão recebida (notifica corretor)

**Configuração:**
- Admin ativa/desativa cada regra
- Define canais por regra (dashboard, WhatsApp, email)
- Define antecedência (para alertas de vencimento)

### 3.17 Importador Inteligente (Migração)

**Escopo:** migração inicial de dados históricos das planilhas para o sistema.

**Fluxo:**
1. Admin faz upload de planilha Excel (.xlsx) ou CSV
2. Claude API analisa a planilha: identifica colunas, tipos de dados, e sugere mapeamento automático
3. Tela de revisão: "Coluna X → Campo Y" com preview dos primeiros registros. Admin ajusta se necessário
4. Validação automática: CPF/CNPJ inválidos, datas inconsistentes, valores negativos, duplicatas
5. Tela de erros: lista de registros com problemas para correção manual
6. Importação em massa no banco de dados
7. Relatório final: X importados, Y erros, Z ignorados, com log completo

**Módulos que suportam migração:**
- Fornecedores
- Colaboradores
- Contas a pagar (histórico)
- Contas a receber (histórico)
- Vendas
- Comissões históricas

### 3.18 Acesso do Contador

Dashboard dedicado (perfil Contador):
- Visão somente leitura de toda movimentação financeira
- Filtros por período, empresa, categoria, centro de custo
- Exportação em CSV e Excel formatados para importação em sistemas contábeis
- Download em lote de NFS-e (XMLs + PDFs em ZIP)
- DRE e balancete gerados pelo sistema

---

## 4. Modelo de Dados

### 4.1 Core / Multi-tenant

```sql
-- Empresas (tenants)
companies (
  id uuid PK,
  name text NOT NULL,
  trade_name text,
  cnpj text UNIQUE NOT NULL,
  state_registration text,
  municipal_registration text,
  main_cnae text,
  tax_regime text, -- simples_nacional, lucro_presumido, lucro_real
  certificate_a1 bytea, -- criptografado
  certificate_a1_password text, -- criptografado
  certificate_a1_expiry timestamptz,
  logo_url text,
  address jsonb,
  invoice_config jsonb, -- descrição padrão serviço, alíquota ISS, etc.
  created_at timestamptz DEFAULT now()
)

-- Usuários (extende Supabase Auth)
user_profiles (
  id uuid PK REFERENCES auth.users,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  avatar_url text,
  created_at timestamptz DEFAULT now()
)

-- Vínculo usuário ↔ empresa ↔ perfil
user_company_roles (
  id uuid PK,
  user_id uuid REFERENCES user_profiles NOT NULL,
  company_id uuid REFERENCES companies NOT NULL,
  role text NOT NULL, -- super_admin, admin, financial, broker, accountant, viewer
  is_active boolean DEFAULT true,
  UNIQUE(user_id, company_id)
)

-- Log de auditoria
audit_log (
  id uuid PK,
  company_id uuid REFERENCES companies,
  user_id uuid REFERENCES user_profiles,
  action text NOT NULL, -- create, update, delete, login, emit_invoice, etc.
  entity_type text, -- payable, receivable, sale, invoice, etc.
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  ip_address inet,
  created_at timestamptz DEFAULT now()
)
```

### 4.2 Financeiro

```sql
-- Plano de contas
chart_of_accounts (
  id uuid PK,
  company_id uuid REFERENCES companies NOT NULL,
  parent_id uuid REFERENCES chart_of_accounts,
  code text, -- ex: 1.1.01
  name text NOT NULL,
  type text NOT NULL, -- revenue, expense, asset, liability
  is_active boolean DEFAULT true
)

-- Centros de custo
cost_centers (
  id uuid PK,
  company_id uuid REFERENCES companies NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true
)

-- Fornecedores
suppliers (
  id uuid PK,
  company_id uuid REFERENCES companies NOT NULL,
  document_type text NOT NULL, -- cpf, cnpj
  document_number text NOT NULL,
  legal_name text NOT NULL,
  trade_name text,
  email text,
  phone text,
  bank_info jsonb, -- banco, agência, conta, pix
  category_id uuid REFERENCES chart_of_accounts,
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
)

-- Colaboradores
employees (
  id uuid PK,
  company_id uuid REFERENCES companies NOT NULL,
  user_id uuid REFERENCES user_profiles, -- se for corretor com login
  full_name text NOT NULL,
  cpf text NOT NULL,
  email text,
  phone text,
  address jsonb,
  employment_type text NOT NULL, -- clt, pj, freelancer, commission_only
  pj_cnpj text, -- se PJ
  base_salary numeric(12,2), -- se CLT ou PJ fixo
  bank_info jsonb,
  hire_date date,
  termination_date date,
  status text DEFAULT 'active', -- active, inactive, terminated
  documents jsonb, -- [{name, url, type}]
  created_at timestamptz DEFAULT now()
)

-- Contas a pagar
payables (
  id uuid PK,
  company_id uuid REFERENCES companies NOT NULL,
  supplier_id uuid REFERENCES suppliers,
  employee_id uuid REFERENCES employees,
  description text NOT NULL,
  amount numeric(12,2) NOT NULL,
  due_date date NOT NULL,
  competence_date date,
  category_id uuid REFERENCES chart_of_accounts,
  cost_center_id uuid REFERENCES cost_centers,
  recurrence text DEFAULT 'once', -- once, weekly, monthly, quarterly, yearly
  recurrence_end_date date,
  parent_payable_id uuid REFERENCES payables, -- para parcelas
  installment_number int,
  total_installments int,
  status text DEFAULT 'open', -- open, paid, overdue, cancelled
  paid_at timestamptz,
  paid_amount numeric(12,2),
  proof_url text, -- comprovante
  notes text,
  created_at timestamptz DEFAULT now()
)

-- Contas a receber
receivables (
  id uuid PK,
  company_id uuid REFERENCES companies NOT NULL,
  client_name text,
  client_document text,
  sale_id uuid REFERENCES sales,
  commission_installment_id uuid REFERENCES commission_installments,
  description text NOT NULL,
  amount numeric(12,2) NOT NULL,
  due_date date NOT NULL,
  competence_date date,
  category_id uuid REFERENCES chart_of_accounts,
  cost_center_id uuid REFERENCES cost_centers,
  invoice_rule text DEFAULT 'on_receive', -- immediate, on_receive, scheduled, recurring
  invoice_scheduled_date date,
  invoice_recurrence_day int, -- dia do mês para recorrente (1-28)
  recurrence text DEFAULT 'once', -- once, monthly
  recurrence_end_date date,
  status text DEFAULT 'open', -- open, received, overdue, cancelled
  received_at timestamptz,
  received_amount numeric(12,2),
  proof_url text,
  notes text,
  created_at timestamptz DEFAULT now()
)

-- Transações realizadas
transactions (
  id uuid PK,
  company_id uuid REFERENCES companies NOT NULL,
  type text NOT NULL, -- income, expense
  amount numeric(12,2) NOT NULL,
  date timestamptz NOT NULL,
  payable_id uuid REFERENCES payables,
  receivable_id uuid REFERENCES receivables,
  description text,
  proof_url text,
  created_at timestamptz DEFAULT now()
)
```

### 4.3 Comercial / Vendas

```sql
-- Empreendimentos
developments (
  id uuid PK,
  company_id uuid REFERENCES companies NOT NULL,
  name text NOT NULL,
  developer text NOT NULL, -- construtora
  address text,
  type text NOT NULL, -- launch, resale
  commission_percentage numeric(5,2), -- % que a construtora paga
  broker_split_percentage numeric(5,2), -- % repassado ao corretor
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
)

-- Vendas
sales (
  id uuid PK,
  company_id uuid REFERENCES companies NOT NULL,
  development_id uuid REFERENCES developments NOT NULL,
  unit text, -- bloco/andar/número
  sale_value numeric(14,2) NOT NULL, -- VGV
  buyer_name text NOT NULL,
  buyer_document text,
  buyer_contact jsonb,
  payment_method text, -- cash, financing, installments_developer
  broker_id uuid REFERENCES employees NOT NULL,
  sale_date date NOT NULL,
  status text DEFAULT 'in_progress', -- in_progress, completed, cancelled
  documents jsonb, -- [{name, url, type}]
  notes text,
  created_at timestamptz DEFAULT now()
)

-- Funil de vendas
sales_funnel (
  id uuid PK,
  company_id uuid REFERENCES companies NOT NULL,
  development_id uuid REFERENCES developments,
  broker_id uuid REFERENCES employees,
  contact_name text NOT NULL,
  contact_phone text,
  contact_email text,
  current_stage text DEFAULT 'lead', -- lead, visit, proposal, contract, deed
  sale_id uuid REFERENCES sales, -- vincula quando vira venda
  notes text,
  created_at timestamptz DEFAULT now()
)

-- Histórico de transições do funil
funnel_stage_history (
  id uuid PK,
  funnel_id uuid REFERENCES sales_funnel NOT NULL,
  from_stage text,
  to_stage text NOT NULL,
  changed_by uuid REFERENCES user_profiles,
  changed_at timestamptz DEFAULT now()
)

-- Comissões
commissions (
  id uuid PK,
  company_id uuid REFERENCES companies NOT NULL,
  sale_id uuid REFERENCES sales NOT NULL,
  total_amount numeric(12,2) NOT NULL,
  receipt_type text NOT NULL, -- launch_passthrough, resale_consolidated, resale_split
  status text DEFAULT 'pending', -- pending, partial, received, cancelled
  notes text,
  created_at timestamptz DEFAULT now()
)

-- Parcelas da comissão
commission_installments (
  id uuid PK,
  commission_id uuid REFERENCES commissions NOT NULL,
  installment_number int NOT NULL,
  amount numeric(12,2) NOT NULL,
  expected_date date NOT NULL,
  received_date date,
  status text DEFAULT 'pending', -- pending, received, overdue, cancelled
  receivable_id uuid REFERENCES receivables, -- vincula com conta a receber
  created_at timestamptz DEFAULT now()
)

-- Splits de comissão (divisão)
commission_splits (
  id uuid PK,
  commission_id uuid REFERENCES commissions NOT NULL,
  beneficiary_type text NOT NULL, -- brokerage, broker, manager, captador
  beneficiary_id uuid REFERENCES employees, -- null se for brokerage
  percentage numeric(5,2) NOT NULL,
  amount numeric(12,2) NOT NULL,
  payable_id uuid REFERENCES payables, -- conta a pagar gerada (null se avulso_dividido)
  status text DEFAULT 'pending', -- pending, paid, not_applicable
  created_at timestamptz DEFAULT now()
)
```

### 4.4 Notas Fiscais

```sql
-- Notas fiscais emitidas
invoices (
  id uuid PK,
  company_id uuid REFERENCES companies NOT NULL,
  receivable_id uuid REFERENCES receivables,
  invoice_number text,
  series text,
  verification_code text,
  cnae text NOT NULL,
  iss_rate numeric(5,2) NOT NULL,
  service_description text NOT NULL,
  amount numeric(12,2) NOT NULL,
  taker_name text NOT NULL,
  taker_document text NOT NULL,
  taker_email text,
  taker_address jsonb,
  status text DEFAULT 'pending', -- pending, issued, cancelled, error
  error_message text,
  xml_url text,
  pdf_url text,
  issued_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz DEFAULT now()
)

-- Regras padrão de emissão por empresa
invoice_defaults (
  id uuid PK,
  company_id uuid REFERENCES companies UNIQUE NOT NULL,
  default_cnae text NOT NULL,
  default_iss_rate numeric(5,2) NOT NULL,
  default_service_description text NOT NULL,
  tax_regime text NOT NULL
)
```

### 4.5 Notificações

```sql
-- Notificações geradas
notifications (
  id uuid PK,
  company_id uuid REFERENCES companies NOT NULL,
  user_id uuid REFERENCES user_profiles,
  type text NOT NULL, -- payable_due, invoice_issued, invoice_error, cashflow_alert, etc.
  title text NOT NULL,
  message text NOT NULL,
  channel text NOT NULL, -- dashboard, whatsapp, email
  status text DEFAULT 'pending', -- pending, sent, read, failed
  related_entity_type text,
  related_entity_id uuid,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
)

-- Regras de notificação configuráveis
notification_rules (
  id uuid PK,
  company_id uuid REFERENCES companies NOT NULL,
  type text NOT NULL,
  is_active boolean DEFAULT true,
  channels text[] DEFAULT '{dashboard}',
  advance_days int, -- para alertas de vencimento
  config jsonb, -- configurações adicionais
  created_at timestamptz DEFAULT now()
)
```

---

## 5. Integrações

### 5.1 NFS-e SEFIN Fortaleza

- Protocolo: ABRASF padrão nacional, webservice SOAP
- Certificado A1: arquivo .pfx armazenado criptografado (AES-256) no banco
- Operações: emissão, consulta, cancelamento
- Job agendado (cron): verifica diariamente notas recorrentes e agendadas
- Retry automático em caso de timeout da SEFIN (até 3 tentativas)
- Fallback: registra erro e notifica admin para ação manual

### 5.2 WhatsApp (Evolution API)

- Base URL: Evolution API já rodando na infra RE9
- Envio de mensagens de texto para alertas
- Templates configuráveis por tipo de notificação
- Rate limiting para evitar bloqueio do WhatsApp

### 5.3 Email (SMTP)

- SMTP Hostgator (já utilizado na infra RE9)
- Envio de: NFS-e (PDF) ao tomador, alertas, relatórios agendados

### 5.4 Claude API (Migração)

- Modelo: claude-sonnet-4-6
- Uso: análise de planilhas para mapeamento automático de colunas
- Escopo: apenas migração inicial, não é feature contínua

---

## 6. Faseamento de Desenvolvimento

### FASE 1 — Fundação (~2-3 semanas)
1. Setup do projeto Next.js + Supabase + template dashboard
2. Migrations do banco (tabelas core + RLS policies)
3. Auth (login, registro, recuperação de senha)
4. Multi-tenant (seletor empresa, middleware contexto)
5. Sistema de permissões por role
6. CRUD Fornecedores
7. CRUD Colaboradores
8. Plano de Contas configurável
9. Dashboard com cards (estrutura visual)

### FASE 2 — Financeiro Operacional (~2-3 semanas)
10. Contas a Pagar (CRUD + recorrência + anexos + parcelamento)
11. Contas a Receber (CRUD + regras NFS-e + recorrência)
12. Transações e baixas
13. Fluxo de Caixa (visão temporal + projeção + gráficos)
14. Centros de Custo
15. Dashboard dinâmico com dados reais e alertas visuais

### FASE 3 — Comercial + Comissões (~2-3 semanas)
16. Cadastro de Empreendimentos com tabela de comissão
17. Módulo de Vendas completo
18. Funil de Vendas visual (drag & drop)
19. Motor de Comissões (3 cenários + parcelas + splits)
20. Portal do Corretor
21. Métricas de conversão

### FASE 4 — Automações e Inteligência (~2-3 semanas)
22. Integração NFS-e SEFIN Fortaleza
23. Emissão automática + recorrente + agendada
24. Engine de notificações + regras configuráveis
25. Integração WhatsApp (Evolution API)
26. Relatórios (DRE, balancete, comissões, aging, exportações)
27. Acesso do Contador
28. Importador Inteligente de migração (Claude API)

---

## 7. Padrões de Qualidade

- TypeScript strict em todo o projeto
- RLS no Supabase — isolamento total entre empresas
- Audit log em toda ação relevante
- Responsivo (desktop + mobile para corretores)
- Validação dupla: frontend (UX) + backend (segurança)
- Migrations SQL versionadas no Git
- Componentes reutilizáveis seguindo padrão do template comprado
- Tratamento de erros consistente com feedback visual ao usuário

---

## 8. Infraestrutura

- **Domínio:** financeiro.re9imob.com.br
- **Deploy:** Docker Compose + Traefik na Hostinger VPS
- **CI/CD:** GitHub Actions → GitHub Container Registry → VPS (padrão MeMude)
- **SSL:** Let's Encrypt via Traefik
- **Backup:** Supabase managed backups + dump periódico do PostgreSQL
- **Monitoramento:** health checks via Traefik + alertas de erro via WhatsApp
