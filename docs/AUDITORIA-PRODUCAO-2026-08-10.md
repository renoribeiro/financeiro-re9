# Auditoria de produção — RE9 Finanças

Data: 10/08/2026

## Resumo executivo

A auditoria cobriu o código autoral executável, páginas, componentes, stores,
composables, endpoints, configuração, CI/CD, Docker, testes e todas as migrações
Supabase. Dependências instaladas, saídas geradas (`.nuxt`/`.output`) e arquivos de
dados históricos foram inventariados e verificados por ferramentas, mas não tratados
como lógica autoral linha a linha.

Foram corrigidas falhas de autorização, persistência, contabilização parcial,
integração fiscal, tratamento assíncrono, importação, documentação e cadeia de
dependências. Nenhuma funcionalidade de produto nova foi criada.

O código local ficou apto para a etapa de homologação. Após a reconexão do conector,
a migração corretiva foi aplicada no projeto Supabase remoto como versão
`20260811005921` e validada por consultas de catálogo, advisors e teste transacional
das regras de leitura do corretor.

## Escopo revisado

- 360 arquivos inventariados, aproximadamente 90 mil linhas incluindo lockfile,
  migrações, documentação e dados de importação.
- 145 arquivos autorais nos diretórios principais de runtime.
- 24 páginas e seus fluxos de acesso, carregamento, gravação e erro.
- 15 migrações existentes e 1 nova migração corretiva.
- APIs de autenticação administrativa, armazenamento e NFS-e.
- Dockerfile, Compose, GitHub Actions, variáveis de ambiente e dependências.
- Scripts históricos de importação foram auditados, mas não alterados porque já
  continham mudanças locais do usuário antes desta auditoria.

## Correções aplicadas

### 1. Isolamento de dados do corretor — crítico

O frontend filtrava as vendas do corretor, mas a policy de `SELECT` permitia a todo
membro consultar todas as vendas, comissões, parcelas e splits da empresa diretamente
pela API. A nova migração cria helpers de leitura e policies que preservam a visão
integral dos perfis financeiro/administrativo/contábil, limitando o corretor ao
colaborador vinculado ao próprio usuário.

Também foram corrigidos o fallback do Portal do Corretor, que podia selecionar o
primeiro corretor quando não existia vínculo, e as restrições por URL direta.

### 2. Contas a pagar parcialmente baixadas — alto

O banco e o store aceitavam status `partial`, mas a tela, projeção, dashboard,
consolidado e fluxo de caixa ignoravam a conta após a primeira baixa. Isso impedia
baixar o saldo restante e distorcia caixa previsto, vencidos e pago no mês.

Agora todas as métricas usam o saldo `valor - pago`, contas parciais continuam
operáveis, o status possui rótulo, a tabela exibe o saldo e valores de baixa são
validados contra o restante. O total pago no mês passa a usar transações realizadas,
incluindo baixas parciais e estornos.

### 3. Persistência incompleta de cadastros — alto

Fornecedor e colaborador exibiam campos que não existiam no schema ou eram omitidos
na gravação. A migração e os mapeadores agora persistem categoria e dados bancários do
fornecedor, além de CNPJ PJ, dados bancários, cargo e datas do colaborador.

O sanitizador de payload também deixou de descartar string vazia, permitindo limpar
campos opcionais durante uma edição.

### 4. NFS-e e fonte de verdade fiscal — crítico

Parte dos dados necessários à emissão existia somente no objeto Pinia e desaparecia
após recarregar a página. Consulta e cancelamento confiavam em número/RPS enviados
pelo navegador e a consulta não persistia o retorno.

Foram adicionadas colunas fiscais duráveis, mapeamento completo e campos de
configuração já previstos no domínio. Emissão, consulta e cancelamento agora validam
empresa e nota persistida, usam os identificadores do banco, persistem respostas e
impedem reenvio quando já existe RPS reservado. A interface não afirma mais que há
emissão simulada.

O certificado A1 passou a ser rejeitado fora do período de validade, inclusive quando
está em cache, e a opção de ignorar hostname TLS ficou restrita à homologação.

### 5. Importador CSV — alto

O importador disparava Promises sem aguardar, avançava para “concluído” antes do banco
e contabilizava falhas como sucesso. Agora a execução é aguardada linha a linha,
retorna erros individualizados, aceita data `dd/mm/aaaa` e só conta registros
persistidos. Vendas importadas voltaram a passar pelo fluxo atômico que gera comissão
e contas vinculadas.

### 6. Hidratação e estado local — alto

- Regras de notificação usavam `name/daysBefore` enquanto a UI esperava
  `label/advanceDays`.
- Notificações guardavam canal/severidade em `metadata`, mas a UI lia colunas
  inexistentes e podia quebrar.
- Perfis disponíveis eram descartados e a tela de acesso mostrava apenas o usuário
  atual.
- Criações rápidas e cadastro de cliente gravavam direto no banco sem atualizar o
  store, fazendo o registro sumir até um reload.

Os mapeamentos e fluxos de gravação foram unificados. Notificações do painel agora
são persistidas por uma policy restrita a perfis financeiros. WhatsApp e e-mail foram
marcados como indisponíveis porque não existe entrega server-side completa.

### 7. Falhas assíncronas ocultas — médio/alto

Cadastros base, comissões, funil, notas fiscais e notificações fechavam diálogos ou
alteravam a interface sem aguardar o Supabase. Os fluxos agora aguardam a operação e
mostram o erro, evitando falso sucesso e estado divergente.

### 8. Exportação de relatório — alto

A impressão HTML interpolava nomes e descrições sem escape em uma janela de mesma
origem, permitindo XSS armazenado. Títulos, empresa, período, cabeçalhos e células
passaram a ser escapados antes de `document.write`.

O relatório de comissões também passou a considerar recebimentos parciais reais.

### 9. Dependências e CI — alto

Havia cinco vulnerabilidades altas (`fast-uri`, duas linhas de `brace-expansion`,
`js-yaml` e `nanoid`). Um override mantinha deliberadamente uma versão vulnerável e o
CI aceitava falhas de severidade alta. As versões foram corrigidas, a exceção foi
removida e o pipeline agora bloqueia vulnerabilidades altas e críticas.

O pacote também deixou de usar a identidade do template Materio.

### 10. Navegação, documentação e deploy — médio

Foram alinhadas as permissões do menu e do middleware, incluído o acesso ao cadastro
de clientes já existente, ocultado o atalho global de escrita para perfis sem permissão
e corrigida a documentação que ainda descrevia dados em memória, senha demo e backend
“futuro”. Scripts e seed legados foram excluídos do contexto Docker.

## Validações locais

- ESLint de produção: aprovado.
- Typecheck Nuxt: aprovado.
- Testes automatizados: 92 verificações aprovadas.
- Auditoria de dependências de produção: nenhuma vulnerabilidade conhecida.
- Build Nuxt/Nitro: aprovado.
- Smoke test da saída compilada: `/api/health` e `/login` responderam HTTP 200.
- `git diff --check`: aprovado.
- Varredura de assinaturas de segredo: nenhuma chave secreta privada versionada.
- Migração Supabase remota: aplicada e registrada como `20260811005921`.
- Validação remota de schema, constraints, índice, policies e privilégios: aprovada.
- Teste transacional de RLS: corretor autorizado nos próprios registros e bloqueado
  nos registros de outro colaborador; todas as alterações de teste foram revertidas.

## Pendências e limites conhecidos

### Validações operacionais pendentes

1. Homologar os perfis super admin, financeiro, contador, visualizador e corretor no
   banco real, incluindo tentativa direta pela API.
2. Validar NFS-e em homologação com certificado e credenciais reais antes de ativar
   `NFSE_ENABLED=1` em produção.
3. Ativar a proteção contra senhas vazadas nas configurações do Supabase Auth. O
   advisor de segurança classificou essa configuração como `WARN`.

Os dois avisos informativos de RLS sem policy referem-se a
`company_storage_settings` e `storage_oauth_states`. Elas são tabelas exclusivamente
server-side e foi confirmado que `anon` e `authenticated` não possuem privilégios
diretos sobre elas. Os avisos de performance restantes são informativos: concentram-se
no schema histórico de backup sem chaves primárias e em índices ainda não utilizados
em um banco com pouco histórico de consultas; nenhum índice foi removido sem evidência
de carga real.

### Dívida técnica não bloqueante para o comportamento atual

- `noImplicitAny` ainda está desativado. O typecheck normal passa, mas uma execução
  estrita encontra parâmetros implícitos principalmente no tema legado e slots de
  tabelas. Ativar modo estrito exige uma migração de tipagem separada.
- A hidratação inicial busca todas as linhas acessíveis de várias tabelas. Para grande
  volume, deve evoluir para paginação/carga por módulo.
- O histórico carrega até 1.000 eventos recentes por sessão; a interface agora deixa
  esse limite explícito.
- O rate limit dos endpoints fiscais é por processo Nitro. Múltiplas réplicas exigem
  contador compartilhado.
- A CSP protege framing, objetos e base URI, mas ainda não é uma política completa com
  nonce para scripts/estilos do Nuxt.
- Não há suíte E2E autenticada. Os testes atuais cobrem regras puras, datas, ledger,
  defaults e invariantes textuais das migrações.
- `views/`, `data/seed.ts` e `infra/` contêm referências históricas não importadas.
  Os scripts de importação incluem operações destrutivas e schema legado; permanecem
  fora da imagem Docker e devem ser executados somente com revisão manual e backup.
- Entrega externa por WhatsApp/SMTP não está implementada; a interface não permite
  mais ativar esses canais como se estivessem operacionais.

## Observações Supabase

O projeto já concede privilégios explicitamente às tabelas existentes. Isso também é
importante diante da mudança anunciada pelo Supabase para 30/10/2026, quando tabelas
novas deixam de ser expostas automaticamente à Data API:

- https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/deployment/going-into-prod

## Veredito

O código e a migração corretiva passaram nas verificações locais e remotas disponíveis.
A validação integral do ambiente de produção ainda depende da homologação autenticada
de cada perfil e da emissão NFS-e com certificado e credenciais reais.
