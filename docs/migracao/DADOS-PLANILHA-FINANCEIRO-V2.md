# Fonte de verdade — Planilha "Financeiro V2" (RE9 Imob)

Extraído de https://docs.google.com/spreadsheets/d/1eEiKBuKgsNLPr-GiWRpsclCJZ20_zbzjGfwcvA0EiZw
(owner reno@re9.online) em 16/07/2026. Regime: **caixa** (tudo aqui é realizado).

## Resumo (aba Dashboard — calculado, não é dado de entrada)
- Total Entradas: **R$ 171.721,12** · Total Saídas: **R$ 150.316,86** · Lucro: **R$ 21.404,26**
- Posição prevista: A Receber (pendente) R$ 100.438,96 · A Pagar (pendente) R$ 25.310,01 · Saldo previsto R$ 75.128,95
- Config imposto: **ISS/Simples 3,6%** da receita bruta · **Provisão IR/CSLL 15%** sobre lucro operacional
- Contas usadas: **Reno PF** e **C6 — RE9 Imob**

## Custos Fixos mensais (recorrentes)
| Descrição | Valor/mês | Venc (dia) | Categoria |
|---|---|---|---|
| VPS Hostinger | 94,91 | 1 | Infraestrutura Web |
| Chips dos Agentes (29 × 6,66) | 193,14 | 1 | Comunicação |
| Pagamento Mensal Angélica | 2.500,00 | 5 | Pessoal |
| Mensalidade Zaia | 250,00 | 1 | Software |
| **TOTAL** | **3.038,05** | | |

## Entradas (13 — todas recebidas, R$ 171.721,12)
| Data | Descrição | Cliente | Categoria | Parcela | Conta | Valor |
|---|---|---|---|---|---|---|
| 18/04/2026 | Comissão 3 Vendas Soraya (Vista di Mari 1303,1213 / MLar Cambeba 705) Pt1 | Vista di Mari | Comissão | 1/2 | Reno PF | 5.655,57 |
| 23/04/2026 | Comissão 3 Vendas Soraya … Pt2 | Vista di Mari | Comissão | 2/2 | Reno PF | 4.891,00 |
| 30/04/2026 | Aporte Reno | Reno | Outros/Aporte | — | C6 — RE9 Imob | 5.000,00 |
| 05/05/2026 | Comissão Venda Reno — Vibe Meireles Ap. 2103 | Vibe Meireles | Comissão | 1/1 | C6 — RE9 Imob | 24.006,42 |
| 18/05/2026 | Bônus Venda Reno — Bella Aldeota (Mateus J.) | Bella Aldeota | Comissão | 1/1 | C6 | 2.990,57 |
| 18/05/2026 | Comissão Venda Reno — Bella Aldeota (Mateus J.) | Bella Aldeota | Comissão | 1/2 | C6 | 10.800,53 |
| 18/05/2026 | Comissão Venda Reno — Maré — Beatriz | Maré | Comissão | 1/1 | C6 | 29.365,41 |
| 18/06/2026 | Comissão Venda Reno — MLar Kennedy — Lia e Jonathan | MLar Kennedy | Comissão | 1/1 | C6 | 14.933,56 |
| 23/06/2026 | Comissão Venda Reno — MLar — Rafael Herminio | Mlar Jacarey | Comissão | 2/1 | C6 | 13.505,80 |
| 01/07/2026 | Bônus Venda Reno — MLar Kennedy — Lia e Jonathan | MLar Kennedy | Comissão | 1/1 | C6 | 2.894,10 |
| 01/06/2026 | Comissão Venda Reno — Gilson — Beatriz | Maré | Comissão | 1/1 | C6 | 27.351,44 |
| 13/07/2026 | Comissão Venda Reno — Bella Aldeota (Jaime) | Bella Aldeota | Comissão | 1/1 | C6 | 19.526,19 |
| 13/07/2026 | Comissão Venda Reno — Bella Aldeota (Mateus J.) | Bella Aldeota | Comissão | 2/2 | C6 | 10.800,53 |

## Saídas (94 — todas pagas, R$ 150.316,86)
Categorias na planilha (inconsistentes): Marketing (Meta/Google), Equipamento, Comissão/Vendas
(repasses a corretores), Formação, Pessoal/Funcionário/Funcionária, Contabilidade, Financeiro
(impostos), Captação. Fornecedores/beneficiários: Amazon, Meta, Google, Mercado Livre, CE Placas,
CFCI, Bruno, Souza (Contabilidade), Receita Federal, e corretores Reno/Angélica/Felipe/Pedro/Assis.

> Linhas completas capturadas na sessão (browser → gviz html). Total confere: R$ 150.316,86.
> Observação: várias linhas de "Saldo Google" em jun/jul estão com Categoria "Marketing" porém
> Fornecedor rotulado "Meta" (erro de digitação na planilha) — normalizar para Google no import.

Principais agrupamentos (para o plano de contas / centros de custo):
- **Marketing/Tráfego (Meta + Google):** maioria das linhas, ~R$ 55k+.
- **Repasse de comissão a corretores (Reno, Angélica, Felipe, Pedro, Assis):** ~R$ 74k.
- **Pessoal (Salário/Adiantamento Angélica):** 2.500 + 2.500 + 1.200.
- **Impostos (Receita Federal):** Maio 4.700,39 + Junho 6.331,53.
- **Equipamento (Amazon/Mercado Livre/CE Placas):** ~R$ 1,2k.
- **Formação (CFCI):** 485,00 · **Contabilidade (Souza):** 300,00 · **Captação (Assis):** 100,00 · **Chips:** 1.500,00.

(As 94 linhas na íntegra estão no histórico da migração/DB; este arquivo é o resumo de referência.)

## Mapeamento para o app (proposto)
| Planilha | Entidade do app |
|---|---|
| Entradas (Comissão) | `receivables` (status=received, receivedAt=Data) + opcional `sales`+`commissions` |
| Entradas (Aporte/Outros) | `receivables`/`transactions` categoria "Aporte de sócio" |
| Saídas | `payables` (status=paid, paidAt=Data) + `suppliers`/`employees` |
| Custos Fixos | `payables` recorrentes (recurrence=monthly) a partir do dia de vencimento |
| Categorias | `chart_accounts` (plano de contas) |
| Contas (Reno PF / C6) | conta bancária / origem (campo em transactions) |
| Config imposto | parâmetros fiscais da empresa |

Empresas: manter **RE9 Imóveis** (dados desta planilha) + **RE9 Online** (sem dados por ora).
