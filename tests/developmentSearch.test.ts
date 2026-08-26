import assert from 'node:assert/strict'
import { developmentMatchesSearch } from '../utils/developmentSearch'

const vistaDiMari = {
  name: 'Vista di Mari',
  developer: null as unknown as string,
  address: undefined,
}

assert.equal(
  developmentMatchesSearch(vistaDiMari, 'Vista'),
  true,
  'a busca por nome deve funcionar mesmo quando a construtora estiver vazia',
)

assert.equal(
  developmentMatchesSearch({ name: 'Maré', developer: '', address: '' }, 'mare'),
  true,
  'a busca deve ignorar acentos',
)

assert.equal(
  developmentMatchesSearch({ name: 'Vista Costeira', developer: 'Victa', address: '' }, '  victa  '),
  true,
  'a busca deve ignorar espaços externos e considerar a construtora',
)

assert.equal(
  developmentMatchesSearch({ name: 'Vibe Meireles', developer: '', address: 'Meireles' }, 'aldeota'),
  false,
  'a busca não deve exibir empreendimentos sem correspondência',
)

console.log('Development search: 4 passaram, 0 falharam.')
