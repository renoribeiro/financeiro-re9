# Plano de Ajustes — RE9 Finanças (2026-07)

Dois ajustes solicitados após a aplicação entrar no ar em `financas.re9imob.com.br`:
1. **Contraste do tooltip dos gráficos** (bug de UI).
2. **Emissão real de NFS-e** na SEFIN Fortaleza + ISS, com certificado digital A1.

---

# 1) Tooltip dos gráficos sem contraste

## Análise (causa-raiz confirmada em produção)

Reproduzido no site no ar, em **modo escuro**, navegando via SPA para `/fluxo-de-caixa`:
a caixa do tooltip fica **branca** (`rgba(255,255,255,0.96)`) com o texto **claro**
(`rgba(231,227,252,0.7)`) → praticamente ilegível.

Por quê:
- O ApexCharts injeta o tooltip **fora do componente**, com a classe padrão
  `apexcharts-theme-light` (os gráficos não setam `theme.mode`/`tooltip.theme`).
  No tema *light* do ApexCharts a **cor do texto não é definida** — ela é **herdada**
  da página. Em modo escuro o texto herdado é claro → texto claro sobre caixa branca.
- Existe um override que corrigiria isso em
  [`@core/scss/template/libs/apex-chart.scss`](../@core/scss/template/libs/apex-chart.scss)
  (fundo/ទexto adaptativos via variáveis do Vuetify), **mas ele é carregado pelo array
  `css` do `nuxt.config`** — e (como já descobrimos no ajuste dos cards) esse CSS é
  **inlinado no SSR e não é entregue ao cliente**. Resultado: na página inicial
  (SSR) o tooltip fica ok, mas **após navegação SPA** o override some e o tooltip
  quebra. Confirmado em runtime: `ourAdaptiveRulePresent: false` nas páginas SPA.

É a **mesma classe de problema** dos cabeçalhos de card — CSS global do `css:` array
não chega ao cliente.

## Ajuste (mesma solução dos cards: override no `<style>` do layout)

Adicionar em [`layouts/default.vue`](../layouts/default.vue) (estilo não-scoped do
layout, que **é entregue ao cliente**) um override adaptativo do tooltip usando as
variáveis do Vuetify (`--v-theme-surface` / `--v-theme-on-surface`), que se ajustam
sozinhas a light/dark:

```scss
/* ApexCharts injeta o tooltip fora do componente e sem cor de texto no tema
   claro — em dark + SPA o texto herdava a cor clara sobre fundo branco. Forçamos
   cores adaptativas do Vuetify (funciona em light e dark, em qualquer página). */
.apexcharts-canvas {
  .apexcharts-tooltip,
  .apexcharts-tooltip.apexcharts-theme-light,
  .apexcharts-tooltip.apexcharts-theme-dark {
    border-color: rgba(var(--v-border-color), var(--v-border-opacity));
    background: rgb(var(--v-theme-surface));
    color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  }

  .apexcharts-tooltip-title {
    border-color: rgba(var(--v-border-color), var(--v-border-opacity));
    background: rgb(var(--v-theme-surface));
    color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  }

  .apexcharts-tooltip-text,
  .apexcharts-tooltip-text-y-value,
  .apexcharts-tooltip-text-y-label,
  .apexcharts-tooltip-text-goals-value,
  .apexcharts-xaxistooltip,
  .apexcharts-xaxistooltip-text {
    color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  }
}
```

A especificidade (`.apexcharts-canvas .apexcharts-tooltip...`) vence a regra padrão
do ApexCharts sem precisar de `!important`.

- **Arquivos:** só `layouts/default.vue`.
- **Verificação:** build + no ar (browser), hover nos gráficos de `/dashboard`,
  `/fluxo-de-caixa`, `/relatorios`, `/dashboard-consolidado`, em **light e dark**,
  medindo contraste do texto vs. fundo.
- **Esforço:** trivial (P). **Risco:** baixo. Deploy pelo pipeline atual (push → GHCR).

---

# 2) Emissão real de NFS-e — SEFIN Fortaleza + ISS (certificado A1)

## Análise do estado atual (inventário do código)

- **Runtime é 100% mock.** `stores/finance.ts` (`issueInvoice`, `cancelInvoice`,
  `retryInvoice`) apenas muda status em memória; a **numeração por empresa é real e
  monotônica** (base 143 imobiliária / 311 agência), mas o código de verificação é
  aleatório e **nunca há chamada a SEFIN, XML, certificado ou SOAP**.
- **UI pronta** em [`pages/notas-fiscais.vue`](../pages/notas-fiscais.vue): KPIs,
  filtros, tabela, detalhe, cancelar/reenviar. Já avisa "emissão simulada" e os
  botões **"Baixar PDF/XML" existem porém `disabled`**.
- **Scaffolding real (não conectado):** [`infra/nfse-builder.ts`](../infra/nfse-builder.ts)
  gera um **esqueleto** de XML ABRASF (RPS/Serviço/Prestador/Tomador/ISS) e traz, só
  como TODO, `signXml()` (A1), `sendSoap()` (retry), parse de retorno e DANFSE.
  **Não é importado por nenhum código executável.** Não há nenhuma rota em `server/`.
- **Modelo de dados incompleto para fiscal** (faltam campos obrigatórios — ver abaixo).
- **Envs previstas mas vazias:** `SEFIN_ENDPOINT`, `CERT_A1_ENCRYPTION_KEY`.
- A migração SQL `supabase/migrations/0001_init.sql` já tem `invoices.xml_url`/`pdf_url`
  e unicidade `(company_id, series, invoice_number)`, mas o app roda in-memory.

## Decisão bloqueante (descoberta): qual padrão a SEFIN Fortaleza exige HOJE?

Há dois caminhos possíveis e **precisamos confirmar no manual oficial vigente**:
- **(A) Webservice próprio da SEFIN Fortaleza — padrão ABRASF** (SOAP): operações do
  tipo `RecepcionarLoteRps`, `ConsultarLoteRps`, `ConsultarNfsePorRps`, `CancelarNfse`.
  O portal `iss.fortaleza.ce.gov.br` oferece "Validar Schema Lote RPS (Webservice)",
  o que indica esse modelo.
- **(B) NFS-e Nacional (padrão nacional / Ambiente de Dados Nacional)** — API REST +
  **DPS** assinada. A adesão nacional teve prazo de atualização de softwares até
  **31/12/2025**, então é possível que Fortaleza já exija (ou passe a exigir) o padrão
  nacional. Isso muda o **transporte** (REST vs SOAP) e o **layout** do XML.

> **Ação:** obter o *Manual de Integração* atual + credenciamento de emissor no
> ambiente de **homologação** da SEFIN Fortaleza e um **certificado A1 de teste**.
> A arquitetura abaixo vale para os dois; só o builder + transporte mudam conforme A/B.

## Arquitetura (server-side, certificado nunca no cliente)

Um **serviço no servidor** (rotas Nitro em `server/api/nfse/*` do próprio Nuxt, ou
Edge Function) responsável por: montar XML/DPS → **assinar com A1 (XMLDSig)** →
transmitir → tratar retorno → persistir XML + gerar DANFSE → atualizar status. O
front só chama a rota interna; **o `.pfx` e a senha ficam só no servidor**, cifrados.

## Componentes a implementar

1. **Modelo de dados fiscal** (adicionar em `types/finance.ts` + seed/migração):
   - *Company (emitente):* binário do A1 (`.pfx`) **cifrado (AES-256)** + senha cifrada,
     código IBGE do município, endereço fiscal, Optante Simples Nacional, incentivo
     fiscal. (Já existem: inscrição municipal, CNAE, regime, alíquota, validade do cert.)
   - *Invoice:* **item da lista de serviços LC 116**, **CTISS** (código de tributação
     municipal), natureza da operação / exigibilidade do ISS, **ISS retido** (bool) +
     responsável, base de cálculo/deduções/descontos, tributos federais retidos (PIS,
     COFINS, IR, INSS, CSLL, valor líquido), município da prestação, **competência**,
     dados de **RPS** (número/série/tipo/lote/protocolo), **endereço/IM do tomador**,
     `xmlUrl`/`pdfUrl`, **motivo do cancelamento**.
2. **Cofre do certificado A1:** upload seguro (server), cifra em repouso, carregamento
   em memória só para assinar; validação de validade (já há alerta de vencimento).
3. **Builder XML/DPS:** evoluir `infra/nfse-builder.ts` para o layout correto e
   **completo** (todos os grupos obrigatórios do padrão A ou B), com namespace/versão
   corretos. Validar contra o **validador de schema** da SEFIN (homologação).
4. **Assinatura XMLDSig (A1):** `xml-crypto` + `node-forge` (ou `@peculiar/x509`).
5. **Transporte:** cliente **SOAP** (`soap`) para o padrão ABRASF, ou **REST** para o
   nacional; ambientes homologação/produção; **retry até 3x** em timeout + timeout config.
6. **Retorno & numeração:** parser do retorno → número + código de verificação + data,
   **ou** lista de erros (código+mensagem) → status `error`. O número **oficial vem da
   prefeitura** (reconciliar; parar de gerar número fake).
7. **Cancelamento real:** operação de cancelamento **com justificativa/motivo**.
8. **DANFSE + armazenamento:** gerar PDF (DANFSE), guardar XML+PDF (Storage/Supabase),
   **habilitar os botões de download** (hoje `disabled`) e **download em lote (ZIP)**
   por período (`jszip`).
9. **Config/segredos:** expandir `.env.example` (endpoint homolog/prod, senha do cert,
   ambiente, timeouts, bucket). Segredos no Dokploy (aba Environment), nunca no repo.
10. **Segurança/compliance:** homologar ponta a ponta antes de produção; **feature
    flag**; auditoria de cada emissão/cancelamento (já existe `stores/audit.ts`);
    tratamento de contingência/rejeições na UI.

## Fases

| Fase | Entrega |
|------|---------|
| **0 — Descoberta** (bloqueante) | Manual vigente + credenciamento homologação + A1 de teste; confirmar padrão A/B, endpoints e layout; mapear LC116/CTISS e alíquotas por empresa. |
| **1 — Dados + cofre A1** | Campos fiscais no modelo; upload/cifra/carga do certificado no servidor. |
| **2 — Builder + assinatura** | XML/DPS completo e assinado; validar no schema da SEFIN (homologação). |
| **3 — Transporte + retorno** | Envio, retry, parse de retorno, numeração oficial; emissão ponta a ponta em homologação. |
| **4 — Cancelamento + DANFSE** | Cancelamento com motivo; PDF/XML persistidos; downloads individual e em lote. |
| **5 — Produção** | Feature flag ligada, monitoramento, contingência. |

## O que preciso de você (inputs)

- **Certificado A1 (.pfx) + senha** — de **homologação** primeiro. **Não envie por
  aqui**; entra por upload seguro no fluxo próprio (eu não manuseio a senha em texto).
- **Credenciamento** no ambiente de homologação da SEFIN Fortaleza + o **Manual de
  Integração** vigente (link/arquivo).
- **Confirmar o padrão:** Fortaleza está no **webservice próprio (ABRASF)** ou já no
  **padrão nacional**? (defino pelo manual, mas se você já souber, acelera.)
- **Dados fiscais por empresa/serviço:** item da lista **LC116**, **alíquota de ISS**
  por serviço, se é **Optante do Simples**, retenções aplicáveis.

## Riscos

- Integração **fiscal**: erro gera rejeição/nota inválida → homologar bem antes de prod.
- A **migração nacional (prazo dez/2025)** pode ter alterado o padrão de Fortaleza —
  confirmar antes de codar o transporte.
- **Certificado/senha são segredos sensíveis** — tratamento só no servidor, cifrado,
  nunca no cliente (regra de segurança do projeto).

**Esforço total:** G (grande, multi-fase).

---

## Fontes consultadas (item 2)
- NT 123/2025 (Web Service de testes ABRASF / transição): https://notagateway.com.br/blog/web-service-para-testes-de-nfs-e-no-padrao-abrasf-o-que-muda-com-a-nota-tecnica-123-2025/
- Manual do Sistema ISS Fortaleza (SEFIN): https://www.sefin.fortaleza.ce.gov.br/
- NFS-e Nacional — Manual de Integração (ABRASF): https://abrasf.org.br/biblioteca/arquivos-publicos/nfs-e/versao-2-02/nfse-nacional-manual-de-integracao-versao-2-02
