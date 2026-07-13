// ============================================================================
// Parse das respostas GINFES v03 (envio de lote, situação, consulta, cancelar).
// Navegação tolerante (busca por local-name recursiva) porque o aninhamento e
// os prefixos de namespace variam entre operações/provedores.
// ============================================================================
import { XMLParser } from 'fast-xml-parser'
import type { NfseError } from '../types'

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
})

export interface LoteEnvioResult {
  protocolo?: string
  numeroLote?: string
  errors: NfseError[]
}

export interface SituacaoResult {
  /** 1=não recebido, 2=não processado, 3=processado c/ erro, 4=processado c/ sucesso. */
  situacao?: number
  errors: NfseError[]
}

export interface NfseData {
  numero?: string
  codigoVerificacao?: string
  dataEmissao?: string
  errors: NfseError[]
  /** XML bruto da NFS-e, quando presente. */
  rawXml?: string
}

// ---------------------------------------------------------------------------
// Navegação tolerante
// ---------------------------------------------------------------------------
type AnyObj = Record<string, unknown>

function findFirst(node: unknown, localName: string): unknown {
  if (node == null || typeof node !== 'object')
    return undefined

  if (Array.isArray(node)) {
    for (const item of node) {
      const r = findFirst(item, localName)
      if (r !== undefined)
        return r
    }

    return undefined
  }

  const obj = node as AnyObj
  for (const key of Object.keys(obj)) {
    if (key === localName || key.endsWith(`:${localName}`))
      return obj[key]
  }
  for (const key of Object.keys(obj)) {
    const r = findFirst(obj[key], localName)
    if (r !== undefined)
      return r
  }

  return undefined
}

function findAll(node: unknown, localName: string, acc: unknown[] = []): unknown[] {
  if (node == null || typeof node !== 'object')
    return acc

  if (Array.isArray(node)) {
    for (const item of node) findAll(item, localName, acc)

    return acc
  }

  const obj = node as AnyObj
  for (const key of Object.keys(obj)) {
    if (key === localName || key.endsWith(`:${localName}`)) {
      const v = obj[key]
      if (Array.isArray(v))
        acc.push(...v)
      else acc.push(v)
    }
  }
  for (const key of Object.keys(obj)) findAll(obj[key], localName, acc)

  return acc
}

function text(v: unknown): string | undefined {
  if (v == null)
    return undefined
  if (typeof v === 'string')
    return v
  if (typeof v === 'number')
    return String(v)
  if (typeof v === 'object' && '#text' in (v as AnyObj))
    return String((v as AnyObj)['#text'])

  return undefined
}

function extractErrors(root: unknown): NfseError[] {
  const mensagens = findAll(root, 'MensagemRetorno')

  return mensagens.map(m => ({
    code: text(findFirst(m, 'Codigo')) ?? '',
    message: text(findFirst(m, 'Mensagem')) ?? '',
    correction: text(findFirst(m, 'Correcao')) || undefined,
  })).filter(e => e.code || e.message)
}

// ---------------------------------------------------------------------------
// Parsers por operação
// ---------------------------------------------------------------------------
export function parseEnvioLote(xml: string): LoteEnvioResult {
  const root = parser.parse(xml)

  return {
    protocolo: text(findFirst(root, 'Protocolo')),
    numeroLote: text(findFirst(root, 'NumeroLote')),
    errors: extractErrors(root),
  }
}

export function parseSituacao(xml: string): SituacaoResult {
  const root = parser.parse(xml)
  const s = text(findFirst(root, 'Situacao'))

  return {
    situacao: s != null ? Number(s) : undefined,
    errors: extractErrors(root),
  }
}

/** Extrai a NFS-e (número, código de verificação, data) de qualquer resposta. */
export function parseNfse(xml: string): NfseData {
  const root = parser.parse(xml)
  const errors = extractErrors(root)

  // O nó da NFS-e pode vir como Nfse > InfNfse, ou CompNfse > Nfse > InfNfse.
  const inf = findFirst(root, 'InfNfse') ?? root

  return {
    numero: text(findFirst(inf, 'Numero')),
    codigoVerificacao: text(findFirst(inf, 'CodigoVerificacao')),
    dataEmissao: text(findFirst(inf, 'DataEmissao')),
    errors,
    rawXml: xml,
  }
}

export function parseCancelamento(xml: string): { success: boolean; dataHora?: string; errors: NfseError[] } {
  const root = parser.parse(xml)
  const errors = extractErrors(root)
  const dataHora = text(findFirst(root, 'DataHora')) ?? text(findFirst(root, 'DataHoraCancelamento'))
  const confirmado = findFirst(root, 'Confirmacao') !== undefined || dataHora !== undefined

  return { success: confirmado && errors.length === 0, dataHora, errors }
}
