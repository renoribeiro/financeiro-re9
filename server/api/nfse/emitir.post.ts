// ============================================================================
// POST /api/nfse/emitir
// Emite uma NFS-e real na SEFIN Fortaleza (GINFES v03) a partir dos dados do
// prestador + nota. Roda server-side; o certificado A1 nunca sai do servidor.
// ============================================================================
import { getNfseConfig } from '../../utils/nfse/config'
import { isCertificateConfigured } from '../../utils/nfse/certificate'
import type { EmitirNfsePayload, EmitirNfseResult } from '../../utils/nfse/types'
import { emitirNfse } from '../../utils/nfse/ginfes/client'

interface EmitirRequest {
  company: {
    cnpj: string
    municipalRegistration?: string
    razaoSocial: string
    nomeFantasia?: string
    cnaeCode?: string
    cityIbge?: string
    optanteSimplesNacional?: boolean
    address?: EmitirNfsePayload['prestador']['endereco']
  }
  invoice: {
    rpsNumber: string
    rpsSeries?: string
    rpsType?: number
    dataEmissao?: string
    competencia?: string
    lc116Item: string
    ctiss?: string
    cnaeCode?: string
    issRate: number
    issRetido?: boolean
    serviceDescription: string
    amount: number
    deductionsAmount?: number
    municipioIbge?: string
    taker: {
      name: string
      document: string
      email?: string
      inscricaoMunicipal?: string
      address?: EmitirNfsePayload['tomador']['endereco']
    }
  }
}

export default defineEventHandler(async (event): Promise<EmitirNfseResult> => {
  const cfg = getNfseConfig()

  if (!isCertificateConfigured()) {
    return {
      success: false,
      status: 'error',
      errors: [{ code: 'NAO_CONFIGURADO', message: 'Emissão real não configurada: certificado A1 ausente no servidor.' }],
      environment: cfg.ambiente,
    }
  }

  if (cfg.provider === 'nacional') {
    return {
      success: false,
      status: 'error',
      errors: [{ code: 'PROVIDER_NACIONAL', message: 'NFS-e Nacional (DPS/REST) ainda não habilitada nesta versão. Use NFSE_PROVIDER=ginfes (Fortaleza).' }],
      environment: cfg.ambiente,
    }
  }

  const body = await readBody<EmitirRequest>(event)
  const err = validate(body)
  if (err) {
    return { success: false, status: 'error', errors: [{ code: 'DADOS_INVALIDOS', message: err }], environment: cfg.ambiente }
  }

  const c = body.company
  const inv = body.invoice
  const municipio = inv.municipioIbge || c.cityIbge || cfg.municipioIbge

  const payload: EmitirNfsePayload = {
    prestador: {
      cnpj: c.cnpj,
      inscricaoMunicipal: c.municipalRegistration,
      razaoSocial: c.razaoSocial,
      nomeFantasia: c.nomeFantasia,
      cnaeCode: c.cnaeCode,
      optanteSimplesNacional: c.optanteSimplesNacional,
      cityIbge: c.cityIbge || cfg.municipioIbge,
      endereco: c.address,
    },
    tomador: {
      razaoSocial: inv.taker.name,
      documento: inv.taker.document,
      inscricaoMunicipal: inv.taker.inscricaoMunicipal,
      email: inv.taker.email,
      endereco: inv.taker.address,
    },
    servico: {
      itemListaServico: inv.lc116Item,
      codigoTributacaoMunicipio: inv.ctiss,
      cnaeCode: inv.cnaeCode || c.cnaeCode,
      discriminacao: inv.serviceDescription,
      valorServicos: inv.amount,
      valorDeducoes: inv.deductionsAmount,
      aliquota: inv.issRate,
      issRetido: inv.issRetido ?? false,
      codigoMunicipio: municipio,
      exigibilidadeIss: 1,
    },
    rps: {
      numero: inv.rpsNumber,
      serie: inv.rpsSeries || '1',
      tipo: inv.rpsType || 1,
      dataEmissao: inv.dataEmissao || new Date().toISOString(),
      competencia: inv.competencia,
      naturezaOperacao: 1,
    },
  }

  try {
    return await emitirNfse(payload, cfg)
  }
  catch (e) {
    return {
      success: false,
      status: 'error',
      errors: [{ code: 'FALHA_EMISSAO', message: (e as Error).message }],
      environment: cfg.ambiente,
    }
  }
})

function validate(b: EmitirRequest | undefined): string | null {
  if (!b?.company || !b.invoice)
    return 'Payload incompleto: informe company e invoice.'
  if (!b.company.cnpj)
    return 'CNPJ do prestador ausente.'
  if (!b.company.municipalRegistration)
    return 'Inscrição Municipal do prestador ausente (obrigatória para NFS-e Fortaleza).'
  if (!b.invoice.rpsNumber)
    return 'Número do RPS ausente.'
  if (!b.invoice.lc116Item)
    return 'Item da Lista de Serviços (LC 116) ausente.'
  if (!b.invoice.amount || b.invoice.amount <= 0)
    return 'Valor do serviço inválido.'
  if (!b.invoice.taker?.document)
    return 'Documento do tomador ausente.'

  return null
}
