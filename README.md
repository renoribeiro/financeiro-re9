# RE9 Finanças

Sistema de gestão financeira **multi-empresa** para a RE9 Imóveis (imobiliária) e a
RE9 Online Branding (agência de marketing digital). Front-end construído sobre o tema
**Materio (Nuxt 3 + Vuetify 3)**.

> **Estado atual:** aplicação **front-end completa** com camada de dados em memória
> (Pinia + seed realista das duas empresas), **autenticação com sessão + proteção de
> rota por perfil**, log de auditoria, motor de comissões (parcelas + splits), motor de
> recorrência, importador de CSV com validação real, dashboard consolidado e relatórios
> com exportação (CSV/Excel/PDF). As integrações externas (NFS-e SEFIN via SOAP,
> WhatsApp/Evolution, SMTP, Supabase/RLS) estão **prontas para ligar** — código real em
> `infra/` e `supabase/`, ativáveis com credenciais (ver `docs/`).
>
> **Documentação:** [`docs/AUDITORIA-2026-07.md`](docs/AUDITORIA-2026-07.md) (34 correções),
> [`docs/MELHORIAS-2026-07.md`](docs/MELHORIAS-2026-07.md) (roadmap) e
> [`docs/IMPLEMENTACAO-MELHORIAS-2026-07.md`](docs/IMPLEMENTACAO-MELHORIAS-2026-07.md)
> (o que já foi implementado × o que aguarda credenciais).
>
> **Login (demo):** `reno@re9.online` (Super Admin), `financeiro@re9imob.com.br`,
> `lucas@re9imob.com.br` (Corretor) ou `contador@re9.online` — qualquer senha.

## Stack

- Nuxt 3 · Vue 3 · TypeScript
- Vuetify 3 (tema Materio) · ApexCharts · Pinia
- Ícones RemixIcon (`ri-*`)

## Como rodar

```sh
pnpm install      # instala dependências
pnpm dev          # ambiente de desenvolvimento (http://localhost:3000)
pnpm build        # build de produção
node .output/server/index.mjs   # preview do build
```

## Multi-tenant e perfis

- **Seletor de empresa** no topo (header) alterna entre RE9 Imóveis e RE9 Online.
  Todos os dados são escopados pela empresa atual (simula o RLS do Supabase).
- **Trocar de usuário/perfil** pelo avatar (canto superior direito): há usuários
  com perfis Super Admin, Financeiro, Corretor e Contador. Perfis somente-leitura
  (Contador/Visualizador) têm os botões de edição ocultos/desabilitados.

## Módulos implementados

| Área | Telas |
|------|-------|
| Visão geral | Dashboard (KPIs, fluxo 30d, DRE, alertas, indicadores por tipo de empresa) |
| Financeiro | Contas a Pagar, Contas a Receber, Fluxo de Caixa, Plano de Contas, Centros de Custo |
| Comercial (imobiliária) | Vendas, Funil de Vendas (kanban drag&drop), Empreendimentos, Comissões, Portal do Corretor |
| Cadastros | Fornecedores, Colaboradores |
| Fiscal & Relatórios | Notas Fiscais (NFS-e), Relatórios (DRE, comparativo, comissões, aging, centros de custo + export CSV) |
| Visão geral (grupo) | Dashboard consolidado do Super Admin (totais e comparativo entre empresas) |
| Sistema | Notificações + regras, Importador inteligente (CSV real), Auditoria, Configurações |

## Arquitetura do código

```
types/finance.ts          # modelo de dados (TypeScript)
utils/format.ts           # formatadores PT-BR (BRL, datas, documentos) — auto-import
utils/labels.ts           # rótulos/cores de status e enums — auto-import
data/seed.ts              # seed das 2 empresas e todas as entidades
stores/app.ts             # contexto multi-tenant (empresa/usuário/perfil atual)
stores/finance.ts         # entidades + getters por empresa + CRUD + motor de comissões
composables/useFinanceMetrics.ts  # métricas do dashboard/fluxo/relatórios
components/               # AppPageHeader, KpiCard, StatusChip, ConfirmDialog (globais)
pages/                    # uma rota por módulo (file-based routing)
layouts/components/       # header (CompanySelector, NavbarNotifications), NavItems (menu)
```

## Deploy (Dokploy / VPS)

A aplicação está pronta para deploy em **container** no [Dokploy](https://dokploy.com)
(VPS Hostinger): `Dockerfile` multi-stage (Nuxt SSR / Nitro node-server), health check
em `GET /api/health` e porta **3000**. Passo a passo completo em
[`docs/DEPLOY-DOKPLOY.md`](docs/DEPLOY-DOKPLOY.md).

```sh
# teste local da imagem de produção
docker compose up --build   # descomente o bloco `ports` no docker-compose.yml
```

## Próximos passos (backend)

1. Substituir o seed/Pinia por Supabase (PostgreSQL + RLS por `company_id`).
2. Conectar a emissão de NFS-e à API SEFIN Fortaleza (ABRASF/SOAP, certificado A1).
3. Notificações reais via Evolution API (WhatsApp) e SMTP.
4. Importador inteligente com análise de planilhas pela Claude API.
