# Emissão de NFS-e — SEFIN Fortaleza (ISS) com Certificado A1

Integração real de emissão de **Nota Fiscal de Serviço eletrônica (NFS-e)** para
o município de **Fortaleza-CE**, usando o **certificado digital A1**.

Enquanto o certificado não estiver configurado no servidor, a tela de Notas
Fiscais opera em **modo simulado** (mock) — nada muda para quem só está
demonstrando o sistema. Ao configurar o A1 + variáveis da SEFIN, a mesma tela
passa a **emitir de verdade**, sem alterar código.

---

## 1. Como Fortaleza funciona (2026)

Fortaleza mantém um **webservice próprio** no padrão **GINFES v03** (SOAP 1.2,
derivado do ABRASF) — o sistema **ISS Fortaleza / GRPFOR**. É o caminho de
integração prático hoje. Por força da **LC 214/2025** (Reforma Tributária), o
município também passou a transmitir as notas ao **ADN Nacional**; a rota
**NFS-e Nacional (REST + DPS)** é a estratégia de médio prazo.

| Item | Valor |
|------|-------|
| Padrão | GINFES v03 (SOAP 1.2, ABRASF-like) |
| Município IBGE | **2304400** |
| Homologação | `http://isshomo.sefin.fortaleza.ce.gov.br/grpfor-iss/ServiceGinfesImplService` |
| Produção | `https://iss.fortaleza.ce.gov.br/grpfor-iss/ServiceGinfesImplService` |
| Assinatura | XMLDSig **RSA-SHA1**, C14N, enveloped — assina `InfRps` **e** `LoteRps` |
| Autenticação | **mTLS** (certificado cliente A1) nas chamadas HTTPS |
| Fluxo de emissão | **assíncrono**: envia lote → protocolo → consulta situação → consulta NFS-e |
| Consulta pública | `https://iss.fortaleza.ce.gov.br/grpfor/pagesPublic/validarNota.seam` |

### ⚠️ Pré-requisito obrigatório: liberação do CNPJ

Antes de qualquer emissão via webservice, o **CNPJ precisa ser credenciado e
autorizado** pela SEFIN (senão retorna erro `E156 – CNPJ do prestador não
autorizado`). Solicita-se por e-mail à SEFIN (assunto “Solicitação Ambiente
Produção Webservice CNPJ [CNPJ]” + Razão Social + Inscrição Municipal).

---

## 2. Arquitetura no projeto

Tudo que toca o certificado roda **exclusivamente no servidor** (`server/` nunca
vai ao bundle do cliente). O browser só vê números e status.

```
server/utils/nfse/
├── config.ts          # ambiente, endpoints, IBGE, algoritmo (lê env em runtime)
├── certificate.ts     # carrega o .pfx (base64/volume), PEM p/ assinatura, mTLS
├── types.ts           # contrato de dados (payloads e resultados)
└── ginfes/
    ├── xml.ts         # monta EnviarLoteRps / consultas / cancelamento (GINFES v03)
    ├── sign.ts        # assinatura XMLDSig (xml-crypto): InfRps + LoteRps
    ├── soap.ts        # envelope SOAP 1.2 + POST mTLS + extração do retorno
    ├── parse.ts       # parse tolerante das respostas (fast-xml-parser)
    └── client.ts      # orquestra emitir/consultar/cancelar (com polling)

server/api/nfse/
├── status.get.ts      # diz se está configurado (sem expor segredos)
├── emitir.post.ts     # emite a NFS-e
├── consultar.post.ts  # reconsulta por RPS (retoma "processando")
└── cancelar.post.ts   # cancela a NFS-e

stores/finance.ts      # issueInvoice/cancelInvoice: real quando configurado, senão mock
pages/notas-fiscais.vue# alerta dinâmico, download de XML, consulta pública
```

Bibliotecas adicionadas: `node-forge` (lê o .pfx), `xml-crypto` (assinatura),
`fast-xml-parser` (respostas), `xmlbuilder2`, `@xmldom/xmldom`.

---

## 3. Ativando a emissão real

### 3.1 Preparar o certificado A1

O A1 é um arquivo `.pfx`/`.p12` protegido por senha. Converta para base64:

```sh
# Linux/macOS
base64 -w0 meu-certificado.pfx > cert.b64

# Windows (PowerShell)
[Convert]::ToBase64String([IO.File]::ReadAllBytes("meu-certificado.pfx")) > cert.b64
```

### 3.2 Configurar no Dokploy (aba *Environment* da aplicação)

| Variável | Valor |
|----------|-------|
| `NFSE_CERT_PFX_BASE64` | conteúdo de `cert.b64` (uma linha) |
| `NFSE_CERT_PASSWORD` | senha do certificado |
| `NFSE_AMBIENTE` | `homologacao` (troque para `producao` quando validar) |
| `NFSE_PROVIDER` | `ginfes` |
| `NFSE_MUNICIPIO_IBGE` | `2304400` |

Alternativa ao base64: monte o `.pfx` num volume e aponte `NFSE_CERT_PFX_PATH`.

> Não suba arquivo `.env` com o certificado/senha. Use a UI do Dokploy — as
> variáveis são injetadas no container em runtime. O `.gitignore` já bloqueia
> `*.pfx`, `*.p12`, `*.pem`, etc.

### 3.3 Redeploy e verificação

Após salvar as variáveis, faça o **redeploy**. A tela **Notas Fiscais** passa a
mostrar o alerta verde “Emissão real conectada à SEFIN Fortaleza (Homologação)”
com o titular e a validade do certificado. Isso confirma que o servidor leu o A1.

`GET /api/nfse/status` retorna o diagnóstico (sem segredos):

```json
{ "configured": true, "provider": "ginfes", "ambiente": "homologacao",
  "certificate": { "present": true, "subjectCN": "EMPRESA:32198745000110", "daysToExpire": 210 } }
```

### 3.4 Testar em homologação

1. Garanta o CNPJ **credenciado na homologação** da SEFIN (item 1).
2. Em **Notas Fiscais**, gere uma nota a partir de um recebível e clique
   **Emitir**. A nota entra em **Processando** (fluxo assíncrono do lote).
3. Quando a SEFIN processa, o número da NFS-e + código de verificação aparecem
   e o status vira **Emitida**. Se ficar em Processando, use **Atualizar
   situação** para reconsultar.
4. Em erro, a mensagem da SEFIN aparece no status **Com erro** (tooltip) — ajuste
   os dados/credenciamento e **Reenvie**.

---

## 4. Dados fiscais por empresa

Configurados em `data/seed.ts` (`Company.invoiceConfig` + `address`) e ajustáveis:

- `defaultLc116Item` — item da Lista da **LC 116/2003** (ex.: `10.05` corretagem
  de imóveis, `17.06` propaganda/publicidade).
- `defaultCtiss` — **Código de Tributação do ISS de Fortaleza** (obtenha de um XML
  de nota já emitida pelo portal, pois o formato exato varia por item).
- `defaultIssRate` — alíquota do ISS (%).
- `municipalRegistration` — Inscrição Municipal **sem dígito verificador**.
- `address` / `cityIbge` — endereço fiscal do prestador (IBGE 2304400).

O CNAE, regime (Simples Nacional) e IBGE já vêm da empresa.

---

## 5. Pontos de atenção

- **Reforma Tributária (RTC):** desde a competência **01/2026** a SEFIN exige
  campos novos (NBS obrigatório; IBS/CBS). O layout GINFES atual cobre o núcleo
  ABRASF; se a homologação recusar por falta de NBS/RTC, esses campos precisam
  ser incluídos no builder (`server/utils/nfse/ginfes/xml.ts`) conforme a NT
  vigente. Ver NT 004/007 do CGNFS-e.
- **Hostname TLS da SEFIN:** o servidor da SEFIN responde com hostname divergente
  no seu certificado; por isso `NFSE_SKIP_SERVER_HOSTNAME_CHECK=1` (padrão) ignora
  só o **hostname do servidor** — a cadeia de confiança continua validada. O
  certificado **cliente** (seu A1) é sempre apresentado.
- **Alíquota:** enviada como fração decimal (`0.05`) por padrão. Se a SEFIN
  recusar, use `NFSE_ALIQUOTA_PERCENT=1` para enviar `5`.
- **XSD/WSDL oficiais:** não são públicos; baixe o WSDL de homologação
  (`ServiceGinfesImplService?wsdl`) e valide a ordem/opcionalidade dos campos.
- **Certificado vencendo:** a tela avisa quando faltam ≤ 30 dias.

---

## 6. Caminho futuro: NFS-e Nacional (DPS/REST)

O provider `nacional` está previsto no `config.ts` mas ainda **não implementado**
(retorna erro claro se selecionado). Envolve: montar a **DPS** (JSON/XML),
assinar (XMLDSig, `Id` no `infDPS`), GZip + Base64, `POST /nfse` via mTLS na API
do ADN (`sefin.producaorestrita.nfse.gov.br` em homologação), e ler a **chave de
acesso (50 dígitos)** + DANFSe. Referência: Manual do Contribuinte da API do
Sistema Nacional NFS-e (gov.br/nfse).

---

## 7. Fontes

- Focus NFe — Fortaleza-CE (mapeamento de campos, IBGE, URLs): <https://focusnfe.com.br/guides/nfse/municipios-integrados/fortaleza-ce/>
- ndd HelpCenter — Fortaleza (endpoints WSDL homolog/prod): <https://helpcenter-nddidocs.ndd.tech/pt/municipios-nfse/Current/fortaleza>
- Assinatura GINFES (RSA-SHA1, InfRps + LoteRps): <https://groups.google.com/g/nfephp/c/8esHje8TcIc>
- SEFIN Fortaleza — nova versão NFS-e / RTC 01/2026: <https://www.taxpratico.com.br/detalhes-artigo/sefin-fortaleza-nova-versao-nfs-e-campos-da-reforma-tributaria-obrigatorios-a-partir-da-competencia-01-2026>
- Liberação do CNPJ (E156): <https://ajuda.webmania.com.br/pt-BR/articles/12680506>
- NFS-e Nacional — APIs e manual: <https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao>
- Consulta pública ISS Fortaleza: <https://iss.fortaleza.ce.gov.br/grpfor/pagesPublic/validarNota.seam>
