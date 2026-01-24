export type StoreSortKey = 'id' | 'name' | 'price'
export type StoreSortDir = 'asc' | 'desc'

export const defaultStoreSortKey: StoreSortKey = 'id'
export const defaultStoreSortDir: StoreSortDir = 'asc'

export const normalizeStoreSortKey = (value?: string | null): StoreSortKey => {
  if (value === 'name' || value === 'price' || value === 'id') return value
  return defaultStoreSortKey
}

export const normalizeStoreSortDir = (value?: string | null): StoreSortDir => (value === 'desc' ? 'desc' : 'asc')

export const buildStoreSortToken = (key: StoreSortKey, dir: StoreSortDir) => `${key}:${dir}`

export const parseStoreSortToken = (value: string) => {
  const [key, dir] = value.split(':')
  return {
    key: normalizeStoreSortKey(key),
    dir: normalizeStoreSortDir(dir)
  }
}
