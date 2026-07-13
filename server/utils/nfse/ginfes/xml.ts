// ============================================================================
// Montagem dos XML do padrão GINFES v03 (Fortaleza) — sem assinatura.
// A assinatura (InfRps + LoteRps) é aplicada depois por ginfes/sign.ts.
//
// ⚠️ A ordem/opcionalidade dos campos segue o layout GINFES v03/ABRASF. Como o
// XSD oficial da SEFIN não é público, valide contra o WSDL de homologação
// (ServiceGinfesImplService?wsdl) e ajuste se o município recusar algum campo.
// ============================================================================
import type { NfseConfig } from '../config'
import type { CancelarNfsePayload, ConsultarNfsePayload, EmitirNfsePayload, NfseEndereco } from '../types'

const NS_ENVIO = 'http://www.ginfes.com.br/servico_enviar_lote_rps_envio_v03.xsd'
const NS_CONSULTA_SIT = 'http://www.ginfes.com.br/servico_consultar_situacao_lote_rps_envio_v03.xsd'
const NS_CONSULTA_LOTE = 'http://www.ginfes.com.br/servico_consultar_lote_rps_envio_v03.xsd'
const NS_CONSULTA_RPS = 'http://www.ginfes.com.br/servico_consultar_nfse_rps_envio_v03.xsd'
const NS_CANCELAR = 'http://www.ginfes.com.br/servico_cancelar_nfse_envio_v03.xsd'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function digits(v?: string): string {
  return (v ?? '').replace(/\D/g, '')
}

function money(v?: number): string {
  return (v ?? 0).toFixed(2)
}

function esc(s?: string): string {
  return (s ?? '').replace(/[<>&'"]/g, c =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '\'': '&apos;', '"': '&quot;' }[c] as string))
}

/** Data no formato AAAA-MM-DD (GINFES v03). */
function dateOnly(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10)
}

/** Tag <Cpf>/<Cnpj> conforme o tamanho do documento. */
function cpfCnpjTag(doc: string): string {
  const d = digits(doc)

  return d.length === 11 ? `<Cpf>${d}</Cpf>` : `<Cnpj>${d}</Cnpj>`
}

function enderecoXml(e?: NfseEndereco): string {
  if (!e)
    return ''

  return `<Endereco>`
    + `<Endereco>${esc(e.logradouro)}</Endereco>`
    + `<Numero>${esc(e.numero) || 'S/N'}</Numero>`
    + (e.complemento ? `<Complemento>${esc(e.complemento)}</Complemento>` : '')
    + `<Bairro>${esc(e.bairro)}</Bairro>`
    + `<CodigoMunicipio>${digits(e.cidadeIbge)}</CodigoMunicipio>`
    + `<Uf>${esc(e.uf)}</Uf>`
    + `<Cep>${digits(e.cep)}</Cep>`
    + `</Endereco>`
}

// ---------------------------------------------------------------------------
// EnviarLoteRpsEnvio (sem assinatura)
// ---------------------------------------------------------------------------
export interface LoteIds { loteId: string; rpsId: string }

export function buildEnviarLoteRps(p: EmitirNfsePayload, cfg: NfseConfig, ids: LoteIds): string {
  const aliquota = cfg.aliquotaAsFraction ? (p.servico.aliquota / 100).toFixed(4) : String(p.servico.aliquota)
  const issRetido = p.servico.issRetido ? 1 : 2
  const valorServicos = p.servico.valorServicos
  const valorIss = Number((valorServicos * (p.servico.aliquota / 100)).toFixed(2))

  const infRps = `<InfRps Id="${ids.rpsId}">`
    + `<IdentificacaoRps>`
    + `<Numero>${esc(p.rps.numero)}</Numero>`
    + `<Serie>${esc(p.rps.serie)}</Serie>`
    + `<Tipo>${p.rps.tipo}</Tipo>`
    + `</IdentificacaoRps>`
    + `<DataEmissao>${dateOnly(p.rps.dataEmissao)}</DataEmissao>`
    + `<NaturezaOperacao>${p.rps.naturezaOperacao ?? 1}</NaturezaOperacao>`
    + (p.rps.regimeEspecialTributacao ? `<RegimeEspecialTributacao>${p.rps.regimeEspecialTributacao}</RegimeEspecialTributacao>` : '')
    + `<OptanteSimplesNacional>${p.prestador.optanteSimplesNacional === false ? 2 : 1}</OptanteSimplesNacional>`
    + `<IncentivadorCultural>2</IncentivadorCultural>`
    + `<Status>1</Status>`
    + `<Servico>`
    + `<Valores>`
    + `<ValorServicos>${money(valorServicos)}</ValorServicos>`
    + `<ValorDeducoes>${money(p.servico.valorDeducoes)}</ValorDeducoes>`
    + `<ValorPis>0.00</ValorPis>`
    + `<ValorCofins>0.00</ValorCofins>`
    + `<ValorInss>0.00</ValorInss>`
    + `<ValorIr>0.00</ValorIr>`
    + `<ValorCsll>0.00</ValorCsll>`
    + `<IssRetido>${issRetido}</IssRetido>`
    + `<ValorIss>${money(valorIss)}</ValorIss>`
    + (p.servico.issRetido ? `<ValorIssRetido>${money(valorIss)}</ValorIssRetido>` : '')
    + `<OutrasRetencoes>0.00</OutrasRetencoes>`
    + `<BaseCalculo>${money(valorServicos - (p.servico.valorDeducoes ?? 0))}</BaseCalculo>`
    + `<Aliquota>${aliquota}</Aliquota>`
    + `<DescontoIncondicionado>0.00</DescontoIncondicionado>`
    + `<DescontoCondicionado>0.00</DescontoCondicionado>`
    + `</Valores>`
    + `<ItemListaServico>${esc(p.servico.itemListaServico)}</ItemListaServico>`
    + (p.servico.cnaeCode ? `<CodigoCnae>${digits(p.servico.cnaeCode)}</CodigoCnae>` : '')
    + (p.servico.codigoTributacaoMunicipio ? `<CodigoTributacaoMunicipio>${esc(p.servico.codigoTributacaoMunicipio)}</CodigoTributacaoMunicipio>` : '')
    + `<Discriminacao>${esc(p.servico.discriminacao)}</Discriminacao>`
    + `<CodigoMunicipio>${digits(p.servico.codigoMunicipio)}</CodigoMunicipio>`
    + `</Servico>`
    + `<Prestador>`
    + `<Cnpj>${digits(p.prestador.cnpj)}</Cnpj>`
    + `<InscricaoMunicipal>${digits(p.prestador.inscricaoMunicipal)}</InscricaoMunicipal>`
    + `</Prestador>`
    + `<Tomador>`
    + `<IdentificacaoTomador><CpfCnpj>${cpfCnpjTag(p.tomador.documento)}</CpfCnpj>`
    + (p.tomador.inscricaoMunicipal ? `<InscricaoMunicipal>${digits(p.tomador.inscricaoMunicipal)}</InscricaoMunicipal>` : '')
    + `</IdentificacaoTomador>`
    + `<RazaoSocial>${esc(p.tomador.razaoSocial)}</RazaoSocial>`
    + enderecoXml(p.tomador.endereco)
    + (p.tomador.email ? `<Contato><Email>${esc(p.tomador.email)}</Email></Contato>` : '')
    + `</Tomador>`
    + `</InfRps>`

  const rps = `<Rps>${infRps}</Rps>`

  const lote = `<LoteRps Id="${ids.loteId}" versao="${cfg.ginfesVersao}">`
    + `<NumeroLote>${esc(p.rps.numero)}</NumeroLote>`
    + `<Cnpj>${digits(p.prestador.cnpj)}</Cnpj>`
    + `<InscricaoMunicipal>${digits(p.prestador.inscricaoMunicipal)}</InscricaoMunicipal>`
    + `<QuantidadeRps>1</QuantidadeRps>`
    + `<ListaRps>${rps}</ListaRps>`
    + `</LoteRps>`

  return `<?xml version="1.0" encoding="UTF-8"?>`
    + `<EnviarLoteRpsEnvio xmlns="${NS_ENVIO}">${lote}</EnviarLoteRpsEnvio>`
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------
function prestadorTag(cnpj: string, im?: string): string {
  return `<Prestador><Cnpj>${digits(cnpj)}</Cnpj><InscricaoMunicipal>${digits(im)}</InscricaoMunicipal></Prestador>`
}

export function buildConsultarSituacaoLote(cnpj: string, im: string | undefined, protocolo: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>`
    + `<ConsultarSituacaoLoteRpsEnvio xmlns="${NS_CONSULTA_SIT}">`
    + prestadorTag(cnpj, im)
    + `<Protocolo>${esc(protocolo)}</Protocolo>`
    + `</ConsultarSituacaoLoteRpsEnvio>`
}

export function buildConsultarLote(cnpj: string, im: string | undefined, protocolo: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>`
    + `<ConsultarLoteRpsEnvio xmlns="${NS_CONSULTA_LOTE}">`
    + prestadorTag(cnpj, im)
    + `<Protocolo>${esc(protocolo)}</Protocolo>`
    + `</ConsultarLoteRpsEnvio>`
}

export function buildConsultarNfsePorRps(p: ConsultarNfsePayload): string {
  return `<?xml version="1.0" encoding="UTF-8"?>`
    + `<ConsultarNfseRpsEnvio xmlns="${NS_CONSULTA_RPS}">`
    + `<IdentificacaoRps><Numero>${esc(p.rpsNumero)}</Numero><Serie>${esc(p.rpsSerie)}</Serie><Tipo>${p.rpsTipo}</Tipo></IdentificacaoRps>`
    + prestadorTag(p.prestador.cnpj, p.prestador.inscricaoMunicipal)
    + `</ConsultarNfseRpsEnvio>`
}

// ---------------------------------------------------------------------------
// CancelarNfseEnvio (sem assinatura — o <Pedido> é assinado depois)
// ---------------------------------------------------------------------------
export function buildCancelarNfse(p: CancelarNfsePayload, pedidoId: string): string {
  const infPedido = `<InfPedidoCancelamento Id="${pedidoId}">`
    + `<IdentificacaoNfse>`
    + `<Numero>${esc(p.numeroNfse)}</Numero>`
    + `<Cnpj>${digits(p.prestador.cnpj)}</Cnpj>`
    + `<InscricaoMunicipal>${digits(p.prestador.inscricaoMunicipal)}</InscricaoMunicipal>`
    + `<CodigoMunicipio>${digits(p.codigoMunicipio)}</CodigoMunicipio>`
    + `</IdentificacaoNfse>`
    + `<CodigoCancelamento>${esc(p.codigoCancelamento)}</CodigoCancelamento>`
    + `</InfPedidoCancelamento>`

  return `<?xml version="1.0" encoding="UTF-8"?>`
    + `<CancelarNfseEnvio xmlns="${NS_CANCELAR}">`
    + `<Pedido>${infPedido}</Pedido>`
    + `</CancelarNfseEnvio>`
}
