# RE9 Finanças — Plano de correções de UX com risco zero de perda de dados

> **Origem:** `docs/AUDITORIA-UX-2026-10.md`. Este plano **substitui** o roteiro da seção 6 daquele relatório.
> **Regras do dono do sistema (2026-10-19):**
> 1. Nenhum risco de perder dados: o sistema é usado todos os dias.
> 2. Nenhuma funcionalidade nova agora. Só corrigir e melhorar o que já existe.
>
> Os códigos (F-01, C-05…) são os do relatório de auditoria, onde estão a evidência e o detalhe de cada item.

---

## 1. O que significa "risco zero" aqui (explicação honesta)

Nenhuma mudança em software tem risco literalmente nulo. O que este plano garante é que **os dados guardados no banco não podem ser perdidos nem alterados pelas correções**. Isso vem de cinco travas:

| Trava | O que garante |
|---|---|
| **T1. Nenhuma mudança no banco** | Nesta fase não há migração, alteração de tabela, função SQL, `UPDATE` ou `DELETE` em dados existentes. Os scripts da pasta `scripts/` (sincronização e importação) **não serão executados**. Mudam só as telas. |
| **T2. Backup antes de cada publicação** | Uma cópia completa do banco é feita e conferida antes de cada deploy. |
| **T3. "Fotografia" antes e depois** | A quantidade de registros e a soma dos valores de cada tabela são anotadas antes e depois de cada deploy. Qualquer diferença inesperada aparece na hora. |
| **T4. Testes de gravação só numa cópia** | Hoje o app no computador de desenvolvimento aponta para o banco **real** (`.env`). Por isso, todo teste (e toda a conferência de telas durante o desenvolvimento) é feito numa **cópia local do banco**, nunca no banco real. |
| **T5. Voltar atrás em minutos** | Como o banco não muda, desfazer uma publicação é só reimplantar a versão anterior no Dokploy. Os dados ficam intactos. |

**Pior caso possível com essas travas:** uma tela nova apresenta um defeito visual ou de cálculo e voltamos à versão anterior em poucos minutos. Os dados ficam intactos.

**Risco que já existe hoje e que este plano reduz:** alguns defeitos atuais **já estão gravando dados errados todos os dias** (parcelamento, horário do recebimento, importador). Corrigi-los é parte de proteger os dados.

---

## 2. Cuidados imediatos de uso (valem desde hoje, sem mexer em nada)

Até as correções do Lote 2 entrarem no ar:

1. **Não use "Parcelar esta conta"** em Contas a Pagar. Hoje cada parcela recebe o valor **total** (R$ 3.000 em 3× gera 3 × R$ 3.000). Se precisar parcelar, digite **o valor de cada parcela** no campo Valor.
2. **Não use o Importador.** Ele pode multiplicar valores (`1234.56` vira 123.456) e gravar datas com um dia a menos.
3. **Ao registrar um recebimento**, confira a data e a hora sugeridas. A hora vem 3 horas adiantada, e depois das 21h a data sugerida já é a do dia seguinte. Corrija à mão se for preciso.
4. **Em Comissões, os botões "Receber" e "Pagar repasse" agem com um clique só**, sem confirmação, com a data de hoje e o valor integral. Clique só quando tiver certeza.
5. **Em Notas Fiscais, o botão de emitir envia a nota na hora**, sem tela de revisão.
6. **Histórico → "Restaurar"** desfaz **todas** as alterações feitas depois do ponto escolhido, inclusive as de outros usuários. Não use sem combinar antes.

---

## 3. Etapa 0 — Preparação (nada muda no sistema)

| # | Passo | Quem faz | Risco |
|---|---|---|---|
| 0.1 | **Guardar o trabalho local ainda não salvo no Git.** Existem alterações locais (o card "Saldo total a pagar" de Contas a Pagar, a função `totalPayableOutstanding` com testes e ajustes nos scripts de importação) e um commit local ainda não enviado (`f3ad07a`). Tudo será preservado num commit **antes** de qualquer outra mudança, para nada se perder ou se misturar, e enviado ao GitHub (cópia fora deste computador). Antes, confirmo que nenhum desses arquivos contém senha ou chave de acesso. |  Claude, **com sua confirmação** | Nenhum |
| 0.2 | **Conferir os backups automáticos do Supabase** (painel → Database → Backups): se há backup diário e se há restauração para um momento exato (PITR) no plano contratado. | Você (Claude orienta) | Nenhum |
| 0.3 | **Fazer um backup completo manual** (dados e estrutura) e guardar fora do servidor (ex.: Google Drive). Feito junto com o passo 0.4 e fora do horário de uso, para os dois retratarem o mesmo momento. Depois, conferir se o arquivo abre e se as contagens batem com a fotografia. | Claude via Supabase CLI, depois que você autorizar o acesso | Nenhum (só leitura) |
| 0.4 | **Fotografia do banco:** quantidade de registros e soma dos valores de cada tabela financeira (contas a pagar, a receber, lançamentos, comissões, parcelas, vendas, notas). | Claude, só consultas de leitura | Nenhum |
| 0.5 | **Verificar o limite de 1.000 linhas** (F-16). O app carrega cada tabela sem paginação, e o Supabase costuma devolver no máximo 1.000 linhas por consulta. Se alguma tabela da empresa já passou disso, **os dados existem no banco, mas a tela não mostra todos**, e o saldo em caixa sai errado. | Claude, só leitura | Nenhum |
| 0.6 | **Montar a cópia local do banco** (Supabase local + restauração do backup do 0.3). O app de desenvolvimento passa a apontar para a cópia. **Integrações desligadas na cópia:** o app local roda com um `.env` próprio, sem as credenciais reais de NFS-e, Google Drive e notificações, e na cópia o ambiente fiscal fica em "homologação" e o armazenamento sem provedor. Assim, nenhum teste emite uma nota de verdade, envia arquivo ao Drive real ou dispara mensagem. | Claude | Nenhum para o banco real nem para os serviços externos |
| 0.7 | **Relatório só-leitura de dados antigos possivelmente afetados** pelos defeitos: parcelas "(n/N)" com valor igual ao total, recebimentos com horário gravado entre 0h e 3h (o defeito adianta a hora em 3h, então podem ter sido feitos entre 21h e meia-noite do dia anterior) e registros vindos do importador. **Nada é corrigido automaticamente.** Você decide caso a caso, e a correção é feita pelas próprias telas, que já registram histórico e estorno. | Claude gera, você decide | Nenhum |

> **Acesso necessário:** o banco do RE9 Finanças (`nzrwlmjhbbmqlwfxqgsd`) não aparece na conta Supabase conectada a esta sessão. Para os passos 0.3 a 0.6 é preciso autorizar o conector do Supabase deste projeto (no Claude Code: `/mcp` → supabase) ou fazer login no Supabase CLI.

**Regra de prioridade:** se o passo 0.5 confirmar o corte de 1.000 linhas, a correção da leitura (paginação, só leitura) passa para o **início do Lote 1**, porque hoje esse defeito pode esconder dados.

---

### Resultado da Etapa 0 (executada em 2026-10-19)

| Passo | Situação | Resultado |
|---|---|---|
| 0.1 | ✅ Feito | O trabalho local pendente e os documentos foram commitados e enviados ao GitHub (ramo `codex/development-defaults-quick-create`, commit `3d16f85`). Antes, conferi que não há senhas nos arquivos e que todos os testes passam. Esse ramo não publica o sistema: só a `main` publica. |
| 0.2 | ✅ Verificado | **O plano do Supabase é o gratuito, que não tem backup automático nem PITR.** Os backups manuais deste plano são a única proteção. Por isso: (a) a trava T2 (backup manual antes de cada deploy) é **obrigatória e não pode ser pulada**; (b) recomendação de rotina: um backup manual por semana, mesmo sem deploy, sempre com uma cópia fora do computador (ex.: Google Drive). |
| 0.3 | ✅ Feito | Os arquivos `schema.sql`, `data.sql` e `roles.sql` estão em `Documents\backups-re9\2026-10-19`, cada um terminando com a marca de "dump complete". A impressão digital de cada arquivo está em `impressao-digital.sha256`. **O backup foi restaurado com sucesso numa cópia isolada:** nas 19 tabelas com dados, a cópia tem exatamente o mesmo número de registros que o arquivo. A cópia simples não tem as tabelas internas de login e de arquivos (`auth`, `storage`), que serão montadas no passo 0.6. |
| 0.4 | ✅ Feito | A fotografia (registros e somas de todas as colunas numéricas de todas as tabelas) está em `fotografia-2026-10-19.csv`. Principais números: 214 contas a pagar (R$ 561.335,90), 47 contas a receber (R$ 636.532,54), 242 lançamentos (R$ 1.059.227,41) e 29 vendas (R$ 14.432.436,29). As somas de lançamentos e de baixas são iguais, o que indica consistência. |
| 0.5 | ✅ Verificado | **Hoje nenhum dado está escondido.** Todas as tabelas financeiras têm menos de 1.000 registros (a maior, de baixas e lançamentos, tem 242). A única com mais é o Histórico (3.164), que já carrega de propósito só os 1.000 mais recentes. No ritmo atual, cerca de 46 lançamentos por mês, o limite seria atingido em mais ou menos 16 meses. A correção (F-16) continua no plano, mas **não é urgente**. |
| 0.6 | 🟡 Parcial | A cópia local isolada (contêiner `re9-copia-local`, acessível só deste computador) já tem todos os dados financeiros. Para testar as telas falta montar o login e o armazenamento, com as integrações desligadas. Isso será feito antes do Lote 1. |
| 0.7 | ✅ Feito | **Nenhum registro antigo foi danificado pelos defeitos.** (a) Nenhuma conta foi criada pelo "Parcelar". (b) Nenhum recebimento caiu na data errada: nenhuma baixa tem horário entre 0h e 3h. Sete recebimentos de ago–set têm horários de tarde ou noite, que podem estar adiantados em 3h, mas a **data está certa**, e só a data entra nos relatórios. (c) Não há sinal de uso do Importador. O único lote de inclusões em massa (15 contas em 05/10, 15h29) coincide com a sincronização oficial "Financeiro V2". |

## 4. Como cada correção é classificada

| Tipo | Significado | Como é testado |
|---|---|---|
| **A — Só tela** | Muda o que se vê (texto, cor, cálculo exibido, confirmação, mensagem). Não muda nada do que é gravado. | Testes automáticos, verificação de tipos e lint, build, e conferência visual na **cópia local do banco** |
| **B — Gravação nova** | Corrige como os **próximos** registros são gravados. Os registros antigos não são tocados. | Tudo do tipo A **mais** o fluxo completo de gravação na **cópia local do banco**, comparando registro a registro com o resultado esperado |

Não existe tipo C (mudança no banco) nesta fase.

---

## 5. Lotes de correção

Cada lote é um conjunto pequeno, publicado e conferido antes do próximo. Ordem: primeiro o que **protege contra erro e perda**, depois o que **para de gravar errado**, depois o que **deixa os números coerentes** e por fim o **conforto de uso**.

### Lote 1 — Proteção contra erro e contexto da empresa (tipo A)

| ID | O que muda (só tela) | Tipo |
|---|---|---|
| F-16 | *(só se o 0.5 confirmar)* Carregar as tabelas em páginas de 1.000 até o fim, para a tela mostrar todos os dados. A contagem da tela é conferida contra a fotografia. | A (leitura) |
| C-01, C-02 | "Receber" e "Pagar repasse" em Comissões passam a pedir confirmação, mostrando valor, data e beneficiário. A gravação continua a mesma de hoje. | A |
| N-01 | Emitir NFS-e passa a pedir confirmação, mostrando tomador, valor, empresa emissora e o ambiente (Produção/Homologação). A mensagem final passa a respeitar o status real ("processando" ≠ "emitida"). | A |
| S-02 | "Restaurar" no Histórico passa a mostrar quantas ações e de quantos usuários serão desfeitas, a empresa afetada, e exige digitar **RESTAURAR**. | A |
| G-07 | O diálogo de confirmação espera a ação terminar, mostra "carregando", bloqueia o duplo clique e mostra o erro dentro dele. O botão de fechar passa a dizer "Voltar" ou "Manter conta" quando a ação é um cancelamento. | A |
| G-05, C-03, C-04 | Erros aparecem **dentro** do diálogo aberto (Comissões, Funil, Fornecedores, Colaboradores, Vendas). O botão Salvar e os botões "Receber" e "Pagar repasse" mostram "carregando" e bloqueiam o duplo clique. | A |
| C-17 | Quem só tem leitura abre o lead do funil em modo visualização, sem o botão "Salvar" que não faz nada. | A |
| C-25 | Ao mudar uma venda para "Distratada", aparece um aviso explicando o que acontece com a comissão e as contas. O texto só é escrito depois de conferir no código do servidor (só leitura) o que de fato acontece. | A |
| F-25 (parte) | O lançamento rápido (botão "+") passa a mostrar qual regra de NFS-e vai usar e bloqueia o duplo clique no Salvar. As regras não mudam. | A |
| G-03 | A empresa escolhida fica lembrada depois de recarregar a página (hoje volta para a primeira). Ao trocar de empresa aparece o aviso "Agora você está em X" e as permissões da página são reavaliadas. | A |
| G-04 | Faixa com a cor da empresa no topo da tela, nome curto visível no celular, e "Empresa: X" no topo de todo diálogo que grava dados. | A |
| G-02 | O saldo em caixa fica escondido para o corretor, e o corretor vai direto ao Portal (menu, guarda de rotas e pós-login). | A |
| C-05 | O corretor deixa de poder alterar parcelas, % do gerente e % do captador numa venda (campos só leitura para quem não é financeiro). | A |
| C-09, C-10 | O Portal do Corretor passa a mostrar **a parte dele** da comissão e o status do **repasse dele**, em vez do total da imobiliária e das parcelas da construtora. | A |
| C-16 | O corretor não pode passar o próprio lead a outro corretor; corretores inativos somem da lista. | A |
| F-20 | A lixeira some (ou fica desabilitada com explicação) nos títulos que o servidor já recusaria excluir. | A |
| G-09 (parte) | Perguntar "Descartar alterações?" ao fechar um formulário alterado (evita perder o que foi digitado). | A |

### Lote 2 — Parar de gravar dados errados (principalmente tipo B, tudo testado na cópia)

| ID | O que muda | Cuidado especial |
|---|---|---|
| F-01 | **Parcelamento:** o formulário passa a exigir que você diga se o valor digitado é **o total** ou **o de cada parcela** (não há opção pré-marcada, porque hoje o costume é o contrário). Uma prévia mostra "3 parcelas de R$ 1.000,00 = total R$ 3.000,00" antes de salvar. Divisão em centavos, com o resto na última parcela. Vencimento no dia 31 cai no último dia do mês, em vez de pular de mês. Aceita de 2 a 120 parcelas. A recorrência fica escondida quando a conta é parcelada (F-22: hoje é ignorada sem aviso). | Teste com 2, 3, 7 e 12 parcelas e com valores que não dividem exato (R$ 100 em 3×) |
| F-02 | Data e hora sugeridas no recebimento e na emissão manual passam a ser as de Brasília, não UTC. | Teste às 20h59, 21h01 e 23h59, e no último dia do mês |
| F-13 | Baixa de pagamento com chave anti-duplicidade estável (igual à que Contas a Receber já usa). Repetir o clique depois de uma queda de rede não paga duas vezes. | Simular falha de rede na cópia e repetir o clique |
| I-01 | Importador: números com ponto ou vírgula decimal lidos corretamente, com escolha do formato e a prévia do valor interpretado. | Teste com `1234.56`, `1.234,56`, `1,234.56`, `1234` e `R$ 1.234,56` |
| I-02 | Importador: datas `aaaa-mm-dd`, `dd/mm/aaaa`, `dd/mm/aa` e `dd-mm-aaaa` lidas no fuso local; formatos ambíguos são rejeitados com mensagem clara. | Teste com cada formato, 29/02 e 31/12 |
| I-03 | Importador: prévia das primeiras 50 linhas já convertidas antes de confirmar (é uma melhoria de segurança no fluxo que já existe). | — |
| I-04 | Importador: o número da linha com erro passa a corresponder à linha do arquivo. | — |
| I-07 (parte) | Importador: o mapeamento manual não é mais apagado ao voltar de etapa; duas colunas no mesmo campo são bloqueadas. | — |
| C-13 | Mudar o estágio de um lead pelo formulário passa a registrar o histórico e o tempo no estágio (como já faz o arrastar). | Comparar o histórico gravado nos dois caminhos |
| C-14 | Salvar um lead sem nome mostra a mensagem de campo obrigatório, em vez de não fazer nada. | — |
| C-27 | Parcelas da comissão e os % passam a ter validação (inteiros de 1 a 120, o maior limite já aceito hoje, e % entre 0 e 100). | Conferir que vendas antigas com valores fora da regra continuam abrindo e podem ser salvas sem mudar esses campos |
| G-08 (versão segura) | Campos de dinheiro **continuam como estão**, mas a roda do mouse deixa de alterar o valor e aparece embaixo do campo o valor formatado ("= R$ 1.250.000,00"), para conferência. *(Trocar o campo por uma máscara nova foi descartado agora, por ser uma mudança grande no ponto mais sensível.)* | Teste em todos os formulários com valor |
| G-09 (parte) | Campos obrigatórios marcados com `*`. A validação acontece no próprio campo, em vez de só num aviso que some. | — |

> **Validação de documentos e cadastros (C-22, C-35, S-10):** CPF/CNPJ do comprador, de fornecedores e colaboradores, a chave PIX, o e-mail do convite e o CNPJ/UF da empresa passam a ser validados **só quando o campo for alterado**. A forma de digitar não muda (sem máscara nova). Assim, cadastros antigos com documento fora do padrão continuam podendo ser editados e salvos.

### Lote 3 — Números coerentes entre as telas (tipo A)

Antes de publicar, uma lista diz **quais números vão mudar na tela e por quê**, para você não estranhar. Nenhum dado gravado muda.

| ID | O que muda |
|---|---|
| G-01, D-18 | Enquanto carrega aparece um "esqueleto" no lugar de "R$ 0,00". Se falhar, aparece uma mensagem de erro com "Tentar novamente". "Tudo em ordem" só aparece depois de carregar com sucesso. Gráfico sem dados mostra "Sem movimentações no período". |
| D-07 | O topo do Dashboard troca "Entradas/Saídas (total de todo o histórico)" por "Entradas/Saídas do mês", que já são calculadas hoje. |
| D-17 | O Consolidado passa a usar as mesmas regras e cores do Dashboard para inadimplência e resultado. |
| D-01 | "Faturamento mensal" (agência) passa a somar só as parcelas do mês atual. |
| D-02 | Remover o KPI repetido ("Resultado do mês" = "Saldo realizado") e pôr no lugar os **vencidos**, que já são calculados hoje. |
| D-03 | "A pagar (7 dias)" passa a usar o saldo em aberto, igual ao alerta e ao "A receber". |
| D-04, FC-02 | Uma regra única para a projeção no Dashboard e no Fluxo de Caixa: o valor projetado considera só o que vence de hoje em diante, e os vencidos aparecem numa linha separada "Em atraso" nas duas telas. Com isso, o número projetado do Dashboard muda. |
| FC-01 | O Fluxo de Caixa passa a mostrar o saldo de hoje, que já existe no Dashboard, como ponto de partida da projeção. |
| F-03 | Escolher "Vencido" mostra todos os vencidos, não só os do mês. |
| F-04 | "Pago no mês" passa a incluir o dia 1º e só contar pagamentos de contas a pagar. |
| F-07 | Rodapé da lista com "N títulos · Total · Em aberto" do filtro atual. |
| F-08 | Os cards de Pagar e Receber passam a filtrar a lista ao clicar. |
| G-10 (parte) | Os KPIs e alertas do Dashboard levam à lista já filtrada (ex.: "3 contas vencidas" abre Contas a Pagar com o filtro Vencido). |
| C-24, C-11 (parte) | Os KPIs de Vendas e do Portal deixam de somar vendas distratadas. |
| D-06 | Gráfico de 30 dias com eixo próprio para o saldo, para entradas e saídas aparecerem. |
| D-11 | Certificado vencido aparece como "Vencido há N dias — emissão bloqueada". |
| D-12 | "NFS-e emitidas" passa a dizer "Total emitidas" (o número conta todo o histórico). |
| R-01 | As abas de Relatórios que não usam o período passam a avisar "Posição em hoje", em vez de fingir que respeitam o filtro. |
| R-02 (parte) | A DRE agrupa por conta do plano (não pelo nome), para que contas com o mesmo nome não se misturem, e ordena por código. |
| R-03 | Linhas "Sem categoria" e "Sem centro de custo" nos relatórios, para os totais baterem entre DRE, balancete e centros. |
| R-05 | Centros de Custo ganha o mesmo filtro de período de Relatórios (padrão: mês atual), para os dois mostrarem o mesmo número. |
| R-06 | O plano de contas deixa de oferecer como "conta-pai" uma subconta da própria conta ou uma conta de outro tipo (impede a árvore corrompida). |
| R-07 (parte) | Aviso (sem bloquear) quando o código não começa pelo código da conta-pai ou já existe. |
| R-14 | Desativar uma conta ou um centro mostra quantas subcontas e lançamentos em aberto o usam. |
| C-19 (parte) | A "Taxa de fechamento" ganha uma explicação de como é calculada. |
| C-29 | "Editar comissão" mostra antes de abrir quando a edição será recusada. |

### Lote 4 — Conforto de uso e acessibilidade (tipo A)

| ID | O que muda |
|---|---|
| G-06 | Um único aviso de sucesso e erro em todas as telas: mesma posição, mesma duração, e erros ficam até você fechar. |
| G-11, R-10 | Filtros, abas e período (inclusive em Relatórios) guardados no endereço da página (sobrevivem ao F5 e ao voltar). |
| G-12 (parte), R-10 | Atalhos de período (Este mês, Mês anterior, Trimestre, Ano) nos filtros que já existem, mais a validação "de ≤ até". |
| D-14 | Ícone ⓘ nos KPIs explicando, em linguagem simples, como cada número é calculado. |
| C-07 | Explicação embaixo dos campos "% gerente" e "% captador" dizendo sobre qual valor o % é aplicado. O texto só é escrito depois de confirmar a regra no código do servidor (só leitura). |
| C-26 | O formulário de venda é dividido em seções com título (Imóvel, Comprador, Condições, Comissão), os botões ficam fixos no rodapé e ele ocupa a tela inteira no celular. Os campos e a ordem não mudam. |
| S-17 | Telas de login e de convite com o mesmo visual, e botão "mostrar senha" na ativação do convite. |
| G-13 | Cores de sucesso, aviso, informação e erro mais escuras, para a leitura ficar fácil (contraste WCAG AA). |
| G-14 | Idioma pt-BR declarado na página, foco visível no menu, menu do usuário e troca de tema acessíveis pelo teclado, rótulos nos botões de ícone (Notas Fiscais, "Dar baixa") e gráficos em português. |
| G-15 | Números alinhados nas colunas (algarismos de largura fixa) e fonte carregada sem "piscar". |
| G-17 | No celular, cada título vira um cartão com descrição e valor em destaque e **um** botão principal; as outras ações vão para o menu "⋯". |
| F-17 | Ordenar por Categoria ou Centro passa a ordenar pelo nome. |
| F-18 | A busca passa a ignorar acentos ("agua" encontra "Água"). |
| F-19 | "Dar baixa" em Pagar vira um botão com o texto "Pagar", igual ao "Receber". |
| F-21 | O diálogo de baixa mostra "Saldo em aberto: R$ X" e explica por que o botão está desabilitado. |
| F-23 | A coluna de vencimento é igual nos dois módulos; um título parcial vencido mostra "Parcial · Vencido". |
| F-26 | A mesma regra de "pode cancelar" em Pagar e Receber. |
| F-10 (parte) | Fornecedor, cliente e categoria com busca por digitação (mesma lista de hoje, sem cadastro novo pelo campo). |
| C-12 | Funil: opção "Mover para…" em cada card, que funciona no celular e no teclado. Usa a mesma gravação do arrastar. |
| C-20 (parte) | O destaque da coluna deixa de piscar ao arrastar. |
| C-31 | A validação do repasse é refeita quando o % da construtora muda; rótulos padronizados. |
| C-33 | Desativar um empreendimento ou fornecedor explica o efeito. |
| D-10, D-19 | Os alertas do Dashboard deixam de ser cortados no celular, e o selo de saldo aparece compacto no celular. |
| R-08 | O balancete deixa de pintar toda despesa de vermelho. |
| R-09 (parte) | Arquivos exportados com o nome da empresa e do período (sem sobrescrever) e datas em pt-BR no PDF. |
| R-15, R-16 (parte) | Plano de contas sem rótulos repetidos, com estado vazio explicado e descrição do centro com quebra de linha. |
| S-01 (parte) | O link morto "Esqueceu a senha?" passa a dizer "Peça a um administrador para redefinir". |
| S-03 | Depois do login, você volta para a página que tentou abrir. |
| S-04 | O "Lembrar de mim", que não faz nada, é removido. |
| S-05 | Mensagens de login e de convite em português. |
| S-06 | Ao ser bloqueado numa página, aparece o motivo ("Seu perfil não tem acesso a X"). |
| S-07 | A mensagem de erro geral fica amigável e não cobre o seletor de empresa. |
| S-08 (parte) | "Marcar como lidas" no sino mostra o erro se falhar. |
| S-11 | Configurações avisa antes de descartar alterações ao trocar de empresa, e pede confirmação para desconectar o Google Drive. |
| S-12 | Quem só tem leitura vê os campos legíveis e copiáveis, com o aviso "Somente leitura". |
| S-13 (parte) | O Histórico mostra "campo: antes → depois" com nomes em português, em vez de JSON cru. |
| S-14 | O tema claro ou escuro fica lembrado. |
| S-15, S-16, S-18, S-19, S-20 | Nomes do menu mais claros, página de erro com "Voltar" e "Recarregar", "Sem acesso" com "Verificar novamente", textos técnicos escondidos do usuário final, e rodapé escondido no celular. |

---

## 6. Ficou de fora (funcionalidades novas, para decidir no futuro)

Estes itens do relatório **criam algo que não existe hoje** e por isso não entram agora:

- **Financeiro:**
  - juros, multa, desconto, data, forma e conta na baixa de pagamento (F-05);
  - ações em lote (F-06, C-28);
  - contas bancárias e conciliação (F-09);
  - cadastro rápido dentro do campo (F-10, parte);
  - nova ordem de campos e categoria obrigatória (F-11; mudaria um hábito diário);
  - estorno por baixa individual (F-12);
  - recorrência automática (F-14; geraria registros sozinha);
  - exportar das listas (F-15);
  - enviar o comprovante só ao confirmar a baixa (F-24; o teste mexeria no armazenamento de arquivos, e o problema atual não perde dados, só deixa arquivos soltos).
- **Dashboard e relatórios:**
  - comparação com o mês anterior, metas e runway (D-05);
  - saldo por conta (D-08);
  - seletor de período no Dashboard (D-09);
  - funil com valores (D-13);
  - novos KPIs e navegação no Consolidado (D-15, D-16);
  - gráfico projetado e "dia em que fica negativo" (FC-03, FC-04);
  - cenários (FC-05);
  - colunas novas no Fluxo (FC-06);
  - um controle único de horizonte no Fluxo (FC-07);
  - tendência de VGV (D-20);
  - detalhe ao clicar numa linha de relatório (R-04);
  - DRE com comparação (R-02, parte);
  - Comparativo e Inadimplência ampliados (R-11, R-12);
  - árvore do plano de contas com busca (R-13).
- **Comercial:**
  - escolher a pessoa do gerente ou captador (C-06);
  - prévia da divisão (C-08);
  - ações no Portal (C-11, parte);
  - funil gerando venda, "Perdido" e arquivar (C-15);
  - atalhos de WhatsApp e e-mail (C-18);
  - vínculo de comprador com Clientes (C-21);
  - busca e filtros novos (C-20, C-23);
  - estoque de unidades (C-30);
  - métricas do empreendimento (C-32);
  - editar e inativar clientes (C-34);
  - vincular usuário a corretor (C-36);
  - observações e totais em Vendas (C-37).
- **Importador e notas:**
  - lote com "desfazer" (I-05);
  - novos campos (I-06);
  - Excel e codificação (I-07, parte);
  - modelos (I-08);
  - status automático, XML em lote e PDF, e vínculos da nota (N-02, N-03, N-04);
  - mudar as regras do lançamento rápido "+" (F-25, parte).
- **Sistema:**
  - recuperação de senha por e-mail (S-01);
  - links nas notificações (S-08);
  - gestão de usuários (S-09);
  - busca global Ctrl+K (G-16).

> **Atenção a um item:** C-05 também precisaria de uma trava no servidor (a função `save_sale_with_commission`). Ela é uma mudança no banco e fica para uma fase futura, com aprovação à parte. A trava na tela (Lote 1) já resolve o uso normal.

---

## 7. Roteiro de cada publicação (vale para todos os lotes)

1. Implementar o lote num ramo separado, sem tocar no trabalho local preservado no passo 0.1.
2. **Testes automáticos novos** para cada cálculo corrigido (parcelas, datas, parser do importador, métricas).
3. Rodar `pnpm lint:ci`, `pnpm typecheck`, `pnpm test` e `pnpm build`. Tudo precisa passar, e a saída é mostrada a você.
4. **Revisão completa do diff:** confirmar que nenhum arquivo de banco (`supabase/`) ou de script (`scripts/`) foi alterado e que nenhuma função nova de gravação foi criada (as telas só usam as funções de gravação que já existem hoje).
5. Tipo B: rodar cada fluxo de gravação na **cópia local** e comparar os registros gravados com o esperado.
6. Tipo A: conferir as telas também na **cópia local**, que tem os mesmos dados do backup. Durante o desenvolvimento, o banco real não é usado em nenhum momento.
7. **Pedir sua confirmação** para commit, push e deploy (uma confirmação para cada coisa).
8. Antes do deploy: backup do dia conferido e fotografia "antes".
9. Deploy fora do horário de uso.
10. Depois do deploy: fotografia "depois" (precisa bater com a de antes, salvo o uso normal do dia) e passada rápida, só olhando, pelas telas principais.
11. Se algo estranhar: reimplantar a versão anterior no Dokploy (minutos). Os dados não são afetados.

---

## 8. Decisões que preciso de você

1. **Autorizar o commit do trabalho local pendente** (passo 0.1), para não correr o risco de perdê-lo.
2. **Liberar o acesso ao banco** do RE9 Finanças para as etapas de leitura e backup (passos 0.3 a 0.6).
3. **Aprovar este plano** e a ordem dos lotes.
