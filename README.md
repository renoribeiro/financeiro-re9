# RE9 Finanças

Sistema de gestão financeira **multi-empresa** para a RE9 Imóveis (imobiliária) e a
RE9 Online Branding (agência de marketing digital). Front-end construído sobre o tema
**Materio (Nuxt 3 + Vuetify 3)**.

> **Estado atual:** aplicação SSR persistida no **Supabase/PostgreSQL**, com autenticação,
> RLS multi-tenant, proteção de rotas por perfil, auditoria e restauração, motor atômico
> de vendas/comissões/contas, fluxo de caixa, importação CSV e NFS-e GINFES/SEFIN.
> A emissão fiscal só opera quando habilitada no servidor e com certificado A1 válido;
> não existe fallback de emissão simulada. WhatsApp e e-mail ainda não possuem entrega
> server-side e aparecem como indisponíveis na configuração de regras.
>
> **Auditoria atual:** [`docs/AUDITORIA-PRODUCAO-2026-08-10.md`](docs/AUDITORIA-PRODUCAO-2026-08-10.md).
> Histórico: [`docs/AUDITORIA-2026-07.md`](docs/AUDITORIA-2026-07.md) (34 correções),
> [`docs/MELHORIAS-2026-07.md`](docs/MELHORIAS-2026-07.md) (roadmap) e
> [`docs/IMPLEMENTACAO-MELHORIAS-2026-07.md`](docs/IMPLEMENTACAO-MELHORIAS-2026-07.md)
> (o que já foi implementado × o que aguarda credenciais).
>
## Stack

- Nuxt 3 · Vue 3 · TypeScript
- Vuetify 3 (tema Materio) · ApexCharts · Pinia
- Supabase (PostgreSQL, Auth, RLS e Storage)
- Ícones RemixIcon (`ri-*`)

## Como rodar

```sh
pnpm install      # instala dependências
pnpm dev          # ambiente de desenvolvimento (http://localhost:3000)
pnpm build        # build de produção
node .output/server/index.mjs   # preview do build
```

## Multi-tenant e perfis

- O seletor de empresa mostra somente empresas vinculadas ao usuário autenticado.
- O banco aplica RLS por empresa e restringe o corretor às próprias vendas/comissões.
- Contador e visualizador são perfis somente leitura; operações administrativas são
  validadas tanto na interface quanto no banco/servidor.

## Módulos implementados

| Área | Telas |
|------|-------|
| Visão geral | Dashboard (KPIs, fluxo 30d, DRE, alertas, indicadores por tipo de empresa) |
| Financeiro | Contas a Pagar, Contas a Receber, Fluxo de Caixa, Plano de Contas, Centros de Custo |
| Comercial (imobiliária) | Vendas, Funil de Vendas (kanban drag&drop), Empreendimentos, Comissões, Portal do Corretor |
| Cadastros | Clientes, Fornecedores, Colaboradores |
| Fiscal & Relatórios | Notas Fiscais (NFS-e), Relatórios (DRE, comparativo, comissões, aging, centros de custo + export CSV) |
| Visão geral (grupo) | Dashboard consolidado do Super Admin (totais e comparativo entre empresas) |
| Sistema | Notificações + regras, Importador inteligente (CSV real), Auditoria, Configurações |

## Arquitetura do código

```
types/finance.ts          # modelo de dados (TypeScript)
utils/format.ts           # formatadores PT-BR (BRL, datas, documentos) — auto-import
utils/labels.ts           # rótulos/cores de status e enums — auto-import
stores/app.ts             # contexto multi-tenant (empresa/usuário/perfil atual)
stores/finance.ts         # cache reativo + CRUD persistido + motores financeiros
composables/useDb.ts      # acesso tipado ao Supabase e RPCs transacionais
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

## Verificação antes de publicar

```sh
pnpm verify
pnpm audit --prod --audit-level high
```

As migrações em `supabase/migrations/` devem ser aplicadas e os advisors de segurança
e desempenho do projeto remoto precisam ser revisados antes de promover a imagem.
