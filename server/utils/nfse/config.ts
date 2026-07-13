// ============================================================================
// Configuração da integração NFS-e (SEFIN Fortaleza / ISS).
//
// Lê tudo do ambiente (env do Dokploy) em runtime.
//
// Fortaleza mantém WEBSERVICE PRÓPRIO no padrão GINFES v03 (SOAP 1.2, derivado
// do ABRASF), o sistema "ISS Fortaleza / GRPFOR". É o caminho de integração
// prático hoje. A NFS-e NACIONAL (REST + DPS / ADN gov.br) é a rota de médio
// prazo (LC 214/2025). Ambos são suportados via `provider`.
//
//   • provider = 'ginfes'   → webservice SOAP GINFES v03 da SEFIN Fortaleza
//   • provider = 'nacional' → API REST da NFS-e Nacional (ADN / gov.br)
//
// Referências (ver docs/NFSE-FORTALEZA.md):
//   Homologação: http://isshomo.sefin.fortaleza.ce.gov.br/grpfor-iss/ServiceGinfesImplService
//   Produção:    https://iss.fortaleza.ce.gov.br/grpfor-iss/ServiceGinfesImplService
//   IBGE Fortaleza = 2304400
// ============================================================================

export type NfseProvider = 'ginfes' | 'nacional'
export type NfseAmbiente = 'homologacao' | 'producao'

export interface NfseConfig {
  provider: NfseProvider
  ambiente: NfseAmbiente
  municipioIbge: string
  /** Versão do layout GINFES (Fortaleza usa '3'). */
  ginfesVersao: string
  /** Algoritmo de assinatura. GINFES v03 = 'sha1' (RSA-SHA1). */
  signAlgorithm: 'sha1' | 'sha256'
  /** Endpoint SOAP do webservice GINFES (conforme ambiente). */
  soapEndpoint: string
  /**
   * Alíquota de ISS enviada como fração decimal (0.05) — padrão GINFES/ABRASF.
   * Se o município exigir percentual inteiro (5), defina NFSE_ALIQUOTA_PERCENT=1.
   */
  aliquotaAsFraction: boolean
  /**
   * Ignora a verificação de HOSTNAME do certificado do SERVIDOR (não do cliente).
   * O endpoint da SEFIN responde com subject "noticias.sefin.fortaleza.ce.gov.br",
   * o que quebra a validação de hostname. NÃO desabilita a validação da cadeia.
   */
  skipServerHostnameCheck: boolean
  /** Base URL da API REST da NFS-e Nacional (conforme ambiente). */
  nacionalBaseUrl: string
  /** Timeout de rede (ms). */
  timeoutMs: number
  /** Nº de tentativas em falha de rede/timeout. */
  retries: number
  /** Máximo de tentativas de consulta da situação do lote (polling). */
  pollAttempts: number
  /** Intervalo entre consultas do lote (ms). */
  pollIntervalMs: number
}

// Endpoints do webservice GINFES de Fortaleza (alvo do POST SOAP = URL do
// serviço, sem "?wsdl"). Sobrescrevíveis por env conforme o WSDL vigente.
const FORTALEZA_GINFES_SOAP = {
  homologacao: 'http://isshomo.sefin.fortaleza.ce.gov.br/grpfor-iss/ServiceGinfesImplService',
  producao: 'https://iss.fortaleza.ce.gov.br/grpfor-iss/ServiceGinfesImplService',
}

// NFS-e Nacional (ADN / gov.br).
const NACIONAL_BASE = {
  homologacao: 'https://sefin.producaorestrita.nfse.gov.br',
  producao: 'https://sefin.nfse.gov.br',
}

function envAmbiente(): NfseAmbiente {
  return process.env.NFSE_AMBIENTE === 'producao' ? 'producao' : 'homologacao'
}

function envProvider(): NfseProvider {
  return process.env.NFSE_PROVIDER === 'nacional' ? 'nacional' : 'ginfes'
}

export function getNfseConfig(): NfseConfig {
  const ambiente = envAmbiente()
  const provider = envProvider()

  return {
    provider,
    ambiente,
    municipioIbge: process.env.NFSE_MUNICIPIO_IBGE?.trim() || '2304400',
    ginfesVersao: process.env.NFSE_GINFES_VERSAO?.trim() || '3',
    signAlgorithm: process.env.NFSE_SIGN_ALGORITHM === 'sha256' ? 'sha256' : 'sha1',
    soapEndpoint: process.env.NFSE_SOAP_ENDPOINT?.trim()
      || (ambiente === 'producao' ? FORTALEZA_GINFES_SOAP.producao : FORTALEZA_GINFES_SOAP.homologacao),
    aliquotaAsFraction: process.env.NFSE_ALIQUOTA_PERCENT !== '1',
    skipServerHostnameCheck: process.env.NFSE_SKIP_SERVER_HOSTNAME_CHECK !== '0',
    nacionalBaseUrl: process.env.NFSE_NACIONAL_BASE_URL?.trim()
      || (ambiente === 'producao' ? NACIONAL_BASE.producao : NACIONAL_BASE.homologacao),
    timeoutMs: Number(process.env.NFSE_TIMEOUT_MS) || 30000,
    retries: Number(process.env.NFSE_RETRIES) || 2,
    pollAttempts: Number(process.env.NFSE_POLL_ATTEMPTS) || 6,
    pollIntervalMs: Number(process.env.NFSE_POLL_INTERVAL_MS) || 4000,
  }
}
