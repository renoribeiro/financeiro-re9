import type { Development } from '@/types/finance'

function normalizeSearchText(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .trim()
    .toLocaleLowerCase('pt-BR')
}

export function developmentMatchesSearch(
  development: Pick<Development, 'name' | 'developer' | 'address'>,
  search: string,
) {
  const query = normalizeSearchText(search)

  if (!query)
    return true

  return [development.name, development.developer, development.address]
    .some(value => normalizeSearchText(value).includes(query))
}
