import assert from 'node:assert/strict'
import {
  DEFAULT_BROKER_SPLIT_PERCENTAGE,
  DEFAULT_DEVELOPMENT_COMMISSION_PERCENTAGE,
  createDevelopmentDraft,
} from '../utils/developmentDefaults'

assert.equal(
  DEFAULT_DEVELOPMENT_COMMISSION_PERCENTAGE,
  4,
  'a comissão padrão de um novo empreendimento deve ser 4%',
)

assert.equal(
  DEFAULT_BROKER_SPLIT_PERCENTAGE,
  2,
  'o repasse padrão ao corretor deve ser 2%',
)

const fresh = createDevelopmentDraft()

assert.deepEqual(
  fresh,
  {
    type: 'launch',
    commissionPercentage: 4,
    brokerSplitPercentage: 2,
    isActive: true,
  },
  'um novo formulário deve iniciar com os defaults comerciais completos',
)

const customized = createDevelopmentDraft({
  commissionPercentage: 5.5,
  brokerSplitPercentage: 1.75,
  isActive: false,
})

assert.equal(customized.commissionPercentage, 5.5, 'uma comissão customizada deve ser preservada na edição')
assert.equal(customized.brokerSplitPercentage, 1.75, 'um repasse customizado deve ser preservado na edição')

const zeroed = createDevelopmentDraft({ commissionPercentage: 0, brokerSplitPercentage: 0 })

assert.equal(zeroed.commissionPercentage, 0, 'zero informado pelo usuário não pode ser substituído pelo default')
assert.equal(zeroed.brokerSplitPercentage, 0, 'repasse zero informado não pode ser substituído pelo default')

console.log('Development defaults: 7 passaram, 0 falharam.')
