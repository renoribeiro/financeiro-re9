// ============================================================================
// Contrato de dados da emissão de NFS-e (compartilhado entre endpoints e utils).
// ============================================================================

export interface NfsePrestador {
  cnpj: string
  inscricaoMunicipal?: string
  razaoSocial: string
  nomeFantasia?: string
  cnaeCode?: string
  /** Optante pelo Simples Nacional (1 = sim, 2 = não). */
  optanteSimplesNacional?: boolean
  cityIbge: string
  endereco?: NfseEndereco
}

export interface NfseEndereco {
  logradouro?: string
  numero?: string
  complemento?: string
  bairro?: string
  cidadeIbge?: string
  uf?: string
  cep?: string
}

export interface NfseTomador {
  razaoSocial: string
  documento: string // CPF/CNPJ (com ou sem máscara)
  inscricaoMunicipal?: string
  email?: string
  endereco?: NfseEndereco
}

export interface NfseServico {
  /** Item da Lista de Serviços (LC 116/2003), ex.: '10.05'. */
  itemListaServico: string
  /** Código de Tributação do Município (CTISS Fortaleza), se aplicável. */
  codigoTributacaoMunicipio?: string
  cnaeCode?: string
  discriminacao: string
  valorServicos: number
  valorDeducoes?: number
  aliquota: number // % do ISS (ex.: 2 = 2%)
  issRetido: boolean
  /** Código IBGE do município de incidência do ISS. */
  codigoMunicipio: string
  /** Exigibilidade do ISS (1 = exigível). */
  exigibilidadeIss?: number
}

export interface NfseRps {
  numero: string
  serie: string
  tipo: number // 1 = RPS
  dataEmissao: string // ISO
  competencia?: string // AAAA-MM
  naturezaOperacao?: number // 1 = tributação no município
  regimeEspecialTributacao?: number
}

export interface EmitirNfsePayload {
  prestador: NfsePrestador
  tomador: NfseTomador
  servico: NfseServico
  rps: NfseRps
}

export interface CancelarNfsePayload {
  prestador: Pick<NfsePrestador, 'cnpj' | 'inscricaoMunicipal' | 'cityIbge'>
  numeroNfse: string
  codigoVerificacao?: string
  codigoMunicipio: string
  /** Código do motivo do cancelamento (1 = erro na emissão). */
  codigoCancelamento: string
  motivo?: string
}

export interface ConsultarNfsePayload {
  prestador: Pick<NfsePrestador, 'cnpj' | 'inscricaoMunicipal' | 'cityIbge'>
  rpsNumero: string
  rpsSerie: string
  rpsTipo: number
}

// ----------------------------------------------------------------------------

export interface NfseError {
  code: string
  message: string
  correction?: string
}

export interface EmitirNfseResult {
  success: boolean
  status: 'issued' | 'error'
  invoiceNumber?: string
  verificationCode?: string
  protocol?: string
  issuedAt?: string
  publicUrl?: string
  xmlBase64?: string
  environment?: 'homologacao' | 'producao'
  errors?: NfseError[]
}

export interface CancelarNfseResult {
  success: boolean
  cancelledAt?: string
  xmlBase64?: string
  errors?: NfseError[]
}
