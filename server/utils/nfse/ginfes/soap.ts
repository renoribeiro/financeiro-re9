// ============================================================================
// Transporte SOAP 1.2 para o webservice GINFES v03 (SEFIN Fortaleza).
//
// O GINFES recebe DOIS parâmetros por operação, ambos como XML "escapado":
//   • nfseCabecMsg → <cabecalho ...><versaoDados>3</versaoDados></cabecalho>
//   • nfseDadosMsg → a mensagem já ASSINADA (EnviarLoteRpsEnvio, etc.)
//
// mTLS: se o endpoint for HTTPS, apresentamos o certificado cliente A1 (.pfx).
// O endpoint de produção responde com hostname divergente no certificado do
// SERVIDOR — por isso o hostname check do servidor pode ser ignorado (a cadeia
// continua validada). Homologação costuma ser HTTP puro (sem TLS).
// ============================================================================
import http from 'node:http'
import https from 'node:https'
import { URL } from 'node:url'
import type { NfseConfig } from '../config'
import { getTlsOptions } from '../certificate'

const NS_CABECALHO = 'http://www.ginfes.com.br/cabecalho_v03.xsd'
// Namespace (tns) do serviço GINFES v03 — usado no elemento da operação.
const NS_SERVICE = 'http://ginfes.com.br/service_v03'

/** Operações do webservice GINFES v03 (sufixo V3). */
export type GinfesOperation =
  | 'RecepcionarLoteRpsV3'
  | 'ConsultarSituacaoLoteRpsV3'
  | 'ConsultarLoteRpsV3'
  | 'ConsultarNfsePorRpsV3'
  | 'CancelarNfseV3'

function esc(s: string): string {
  return s.replace(/[<>&'"]/g, c =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '\'': '&apos;', '"': '&quot;' }[c] as string))
}

function buildCabecalho(versao: string): string {
  return `<cabecalho xmlns="${NS_CABECALHO}" versao="${versao}"><versaoDados>${versao}</versaoDados></cabecalho>`
}

function buildEnvelope(op: GinfesOperation, cabec: string, dados: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>`
    + `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="${NS_SERVICE}">`
    + `<soap:Body>`
    + `<ns:${op}>`
    + `<ns:nfseCabecMsg>${esc(cabec)}</ns:nfseCabecMsg>`
    + `<ns:nfseDadosMsg>${esc(dados)}</ns:nfseDadosMsg>`
    + `</ns:${op}>`
    + `</soap:Body>`
    + `</soap:Envelope>`
}

async function post(endpoint: string, body: string, cfg: NfseConfig): Promise<string> {
  const url = new URL(endpoint)
  const isHttps = url.protocol === 'https:'

  const options: https.RequestOptions = {
    method: 'POST',
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname + url.search,
    timeout: cfg.timeoutMs,
    headers: {
      'Content-Type': 'application/soap+xml; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
    },
  }

  if (isHttps) {
    const tls = getTlsOptions()
    options.pfx = tls.pfx
    options.passphrase = tls.passphrase
    if (cfg.skipServerHostnameCheck)
      options.checkServerIdentity = () => undefined // ignora hostname do servidor; cadeia segue validada
  }

  const transport = isHttps ? https : http

  return new Promise<string>((resolve, reject) => {
    const req = transport.request(options, res => {
      const chunks: Buffer[] = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        // SOAP Fault ou HTTP >= 400: propaga para o parser lidar.
        if ((res.statusCode ?? 0) >= 400 && !text.includes('Fault') && !text.includes('Msg'))
          reject(new Error(`HTTP ${res.statusCode} do webservice SEFIN: ${text.slice(0, 500)}`))
        else
          resolve(text)
      })
    })

    req.on('timeout', () => req.destroy(new Error('Timeout na conexão com o webservice SEFIN.')))
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function postWithRetry(endpoint: string, body: string, cfg: NfseConfig): Promise<string> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= cfg.retries; attempt++) {
    try {
      return await post(endpoint, body, cfg)
    }
    catch (err) {
      lastErr = err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Falha de rede com o webservice SEFIN.')
}

/**
 * Executa uma operação GINFES: monta o envelope, envia via mTLS e devolve o
 * XML de retorno já DESESCAPADO (o conteúdo dentro de ...Response/return).
 */
export async function callGinfes(op: GinfesOperation, dadosMsg: string, cfg: NfseConfig): Promise<string> {
  const envelope = buildEnvelope(op, buildCabecalho(cfg.ginfesVersao), dadosMsg)
  const responseBody = await postWithRetry(cfg.soapEndpoint, envelope, cfg)

  return extractReturn(responseBody)
}

/**
 * Extrai o XML de retorno de dentro do envelope SOAP. O GINFES devolve o XML de
 * resposta escapado dentro de <...Result>/<return>/<outputXML>. Também detecta
 * SOAP Fault.
 */
export function extractReturn(soapResponse: string): string {
  const fault = soapResponse.match(/<(?:\w+:)?(?:Text|faultstring|Reason)>([\s\S]*?)<\/(?:\w+:)?(?:Text|faultstring|Reason)>/i)
  if (soapResponse.includes('Fault') && fault)
    throw new Error(`SOAP Fault do webservice SEFIN: ${unescapeXml(fault[1]).trim()}`)

  // Conteúdo do primeiro elemento *Result/return/outputXML dentro do Body.
  const m = soapResponse.match(/<(?:\w+:)?(?:\w*Result|return|outputXML)>([\s\S]*?)<\/(?:\w+:)?(?:\w*Result|return|outputXML)>/i)
  const inner = m?.[1] ?? soapResponse

  return unescapeXml(inner).trim()
}

export function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, '\'')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')
}
