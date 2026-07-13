// ============================================================================
// Orquestração das operações de NFS-e no padrão GINFES v03 (Fortaleza).
// Fluxo de emissão é ASSÍNCRONO: envia o lote → recebe protocolo → consulta a
// situação (polling) → consulta a NFS-e gerada (número + código de verificação).
// ============================================================================
import type { NfseConfig } from '../config'
import { loadCertificate } from '../certificate'
import type {
  CancelarNfsePayload,
  CancelarNfseResult,
  ConsultarNfsePayload,
  EmitirNfsePayload,
  EmitirNfseResult,
  NfseData,
} from '../types'
import { signElement } from './sign'
import {
  buildCancelarNfse,
  buildConsultarLote,
  buildConsultarNfsePorRps,
  buildConsultarSituacaoLote,
  buildEnviarLoteRps,
} from './xml'
import { callGinfes } from './soap'
import { parseCancelamento, parseEnvioLote, parseNfse, parseSituacao } from './parse'

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

function uid(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

/** Consulta pública da NFS-e no portal ISS Fortaleza. */
function publicUrl(numero?: string, codigo?: string): string | undefined {
  if (!numero || !codigo)
    return undefined

  return `https://iss.fortaleza.ce.gov.br/grpfor/pagesPublic/validarNota.seam?numero=${numero}&codigo=${codigo}`
}

export async function emitirNfse(payload: EmitirNfsePayload, cfg: NfseConfig): Promise<EmitirNfseResult> {
  const cert = loadCertificate()
  const signOpts = { privateKeyPem: cert.privateKeyPem, certificatePem: cert.certificatePem, algo: cfg.signAlgorithm }

  // 1) Monta o lote e assina InfRps (RPS) e depois LoteRps (lote).
  const ids = { loteId: uid('lote'), rpsId: uid('rps') }
  let xml = buildEnviarLoteRps(payload, cfg, ids)
  xml = signElement(xml, 'InfRps', signOpts)
  xml = signElement(xml, 'LoteRps', signOpts)

  // 2) Envia o lote.
  const envioXml = await callGinfes('RecepcionarLoteRpsV3', xml, cfg)
  const envio = parseEnvioLote(envioXml)

  if (envio.errors.length)
    return { success: false, status: 'error', errors: envio.errors, environment: cfg.ambiente }

  if (!envio.protocolo) {
    return {
      success: false,
      status: 'error',
      errors: [{ code: 'SEM_PROTOCOLO', message: 'Webservice não retornou protocolo do lote.' }],
      environment: cfg.ambiente,
    }
  }

  // 3) Consulta a situação do lote (polling).
  const cnpj = payload.prestador.cnpj
  const im = payload.prestador.inscricaoMunicipal
  let processado = false

  for (let i = 0; i < cfg.pollAttempts; i++) {
    await delay(cfg.pollIntervalMs)
    const sitXml = await callGinfes('ConsultarSituacaoLoteRpsV3', buildConsultarSituacaoLote(cnpj, im, envio.protocolo), cfg)
    const sit = parseSituacao(sitXml)

    if (sit.situacao === 4) {
      processado = true
      break
    }
    if (sit.situacao === 3) {
      // Processado com erro — consulta o lote para obter as mensagens.
      const loteXml = await callGinfes('ConsultarLoteRpsV3', buildConsultarLote(cnpj, im, envio.protocolo), cfg)
      const nfse = parseNfse(loteXml)

      return {
        success: false,
        status: 'error',
        protocol: envio.protocolo,
        errors: nfse.errors.length ? nfse.errors : [{ code: 'LOTE_ERRO', message: 'Lote processado com erro na SEFIN.' }],
        environment: cfg.ambiente,
      }
    }
  }

  // 4) Consulta a NFS-e gerada (por RPS).
  const consulta: ConsultarNfsePayload = {
    prestador: { cnpj, inscricaoMunicipal: im, cityIbge: payload.prestador.cityIbge },
    rpsNumero: payload.rps.numero,
    rpsSerie: payload.rps.serie,
    rpsTipo: payload.rps.tipo,
  }
  const nfseXml = await callGinfes('ConsultarNfsePorRpsV3', buildConsultarNfsePorRps(consulta), cfg)
  const nfse = parseNfse(nfseXml)

  if (!nfse.numero) {
    // Ainda em processamento — devolve o protocolo para nova consulta posterior.
    return {
      success: false,
      status: 'error',
      protocol: envio.protocolo,
      errors: nfse.errors.length
        ? nfse.errors
        : [{ code: processado ? 'NFSE_NAO_LOCALIZADA' : 'EM_PROCESSAMENTO', message: processado ? 'Lote processado, porém a NFS-e não foi localizada na consulta.' : 'Lote ainda em processamento na SEFIN. Tente consultar novamente em instantes.' }],
      environment: cfg.ambiente,
    }
  }

  return buildIssuedResult(nfse, envio.protocolo, cfg)
}

function buildIssuedResult(nfse: NfseData, protocolo: string | undefined, cfg: NfseConfig): EmitirNfseResult {
  return {
    success: true,
    status: 'issued',
    invoiceNumber: nfse.numero,
    verificationCode: nfse.codigoVerificacao,
    protocol: protocolo,
    issuedAt: nfse.dataEmissao ? new Date(nfse.dataEmissao).toISOString() : new Date().toISOString(),
    publicUrl: publicUrl(nfse.numero, nfse.codigoVerificacao),
    xmlBase64: nfse.rawXml ? Buffer.from(nfse.rawXml, 'utf8').toString('base64') : undefined,
    environment: cfg.ambiente,
  }
}

/** Consulta uma NFS-e por RPS (usada para retomar emissões que ficaram em processamento). */
export async function consultarPorRps(payload: ConsultarNfsePayload, cfg: NfseConfig): Promise<EmitirNfseResult> {
  loadCertificate() // valida certificado antes de chamar
  const nfseXml = await callGinfes('ConsultarNfsePorRpsV3', buildConsultarNfsePorRps(payload), cfg)
  const nfse = parseNfse(nfseXml)

  if (!nfse.numero) {
    return {
      success: false,
      status: 'error',
      errors: nfse.errors.length ? nfse.errors : [{ code: 'NAO_LOCALIZADA', message: 'NFS-e ainda não disponível para este RPS.' }],
      environment: cfg.ambiente,
    }
  }

  return buildIssuedResult(nfse, undefined, cfg)
}

export async function cancelarNfse(payload: CancelarNfsePayload, cfg: NfseConfig): Promise<CancelarNfseResult> {
  const cert = loadCertificate()
  const pedidoId = uid('canc')

  let xml = buildCancelarNfse(payload, pedidoId)
  xml = signElement(xml, 'InfPedidoCancelamento', {
    privateKeyPem: cert.privateKeyPem,
    certificatePem: cert.certificatePem,
    algo: cfg.signAlgorithm,
  })

  const respXml = await callGinfes('CancelarNfseV3', xml, cfg)
  const result = parseCancelamento(respXml)

  return {
    success: result.success,
    cancelledAt: result.dataHora ? new Date(result.dataHora).toISOString() : (result.success ? new Date().toISOString() : undefined),
    xmlBase64: Buffer.from(respXml, 'utf8').toString('base64'),
    errors: result.errors.length ? result.errors : undefined,
  }
}
