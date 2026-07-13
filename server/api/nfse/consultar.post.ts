// ============================================================================
// POST /api/nfse/consultar
// Consulta a NFS-e por RPS (retoma emissões que ficaram "em processamento").
// ============================================================================
import { getNfseConfig } from '../../utils/nfse/config'
import { isCertificateConfigured } from '../../utils/nfse/certificate'
import type { ConsultarNfsePayload, EmitirNfseResult } from '../../utils/nfse/types'
import { consultarPorRps } from '../../utils/nfse/ginfes/client'

interface ConsultarRequest {
  company: { cnpj: string; municipalRegistration?: string; cityIbge?: string }
  rpsNumber: string
  rpsSeries?: string
  rpsType?: number
}

export default defineEventHandler(async (event): Promise<EmitirNfseResult> => {
  const cfg = getNfseConfig()

  if (!isCertificateConfigured())
    return { success: false, status: 'error', errors: [{ code: 'NAO_CONFIGURADO', message: 'Consulta real não configurada: certificado A1 ausente.' }], environment: cfg.ambiente }

  if (cfg.provider === 'nacional')
    return { success: false, status: 'error', errors: [{ code: 'PROVIDER_NACIONAL', message: 'Consulta via NFS-e Nacional ainda não habilitada. Use NFSE_PROVIDER=ginfes.' }], environment: cfg.ambiente }

  const body = await readBody<ConsultarRequest>(event)
  if (!body?.company?.cnpj || !body.rpsNumber)
    return { success: false, status: 'error', errors: [{ code: 'DADOS_INVALIDOS', message: 'Informe company.cnpj e rpsNumber.' }], environment: cfg.ambiente }

  const payload: ConsultarNfsePayload = {
    prestador: {
      cnpj: body.company.cnpj,
      inscricaoMunicipal: body.company.municipalRegistration,
      cityIbge: body.company.cityIbge || cfg.municipioIbge,
    },
    rpsNumero: body.rpsNumber,
    rpsSerie: body.rpsSeries || '1',
    rpsTipo: body.rpsType || 1,
  }

  try {
    return await consultarPorRps(payload, cfg)
  }
  catch (e) {
    return { success: false, status: 'error', errors: [{ code: 'FALHA_CONSULTA', message: (e as Error).message }], environment: cfg.ambiente }
  }
})
