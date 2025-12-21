import { mock } from 'bun:test'
import { chatMessages, storeItems } from '../src/db/schema'

const defaultStoreItems = Array.from({ length: 15 }, (_, index) => ({
  id: index + 1,
  name: `Item ${index + 1}`,
  price: Number(((index + 1) * 3).toFixed(2)),
  createdAt: new Date(2024, 0, index + 1)
}))

const defaultChatMessages = [
  { id: 1, author: 'alice', body: 'Hello from Alice', createdAt: new Date('2024-01-01T00:00:00Z') },
  { id: 2, author: 'bob', body: 'Reply from Bob', createdAt: new Date('2024-01-02T00:00:00Z') }
]

export const storeItemsData = structuredClone(defaultStoreItems)
export const chatMessagesData = structuredClone(defaultChatMessages)

let nextChatId = chatMessagesData.length + 1

const cacheStorage = new Map<string, string>()
export const cacheKeysWritten: string[] = []
export const publishedMessages: string[] = []
const subscribers: ((message: string) => void)[] = []

const extractThreshold = (condition: unknown) => {
  if (condition && typeof condition === 'object' && 'queryChunks' in condition) {
    const sql = (condition as { queryChunks?: unknown[] }).queryChunks
    if (Array.isArray(sql)) {
      for (const chunk of sql) {
        if (chunk && typeof chunk === 'object' && 'value' in chunk && typeof (chunk as { value: unknown }).value === 'number') {
          return (chunk as { value: number }).value
        }
      }
    }
  }
  return null
}

const buildQuery = <TRow extends { id: number; createdAt?: Date }>(rows: TRow[], table: unknown) => ({
  where(condition: unknown) {
    const threshold = extractThreshold(condition)
    if (typeof threshold === 'number') {
      const filtered = rows.filter((row) => row.id > threshold)
      return buildQuery(filtered, table)
    }
    return buildQuery(rows, table)
  },
  orderBy(_order: unknown) {
    const sorted = [...rows]
    if (table === chatMessages) {
      sorted.sort((a, b) => b.createdAt!.getTime() - a.createdAt!.getTime())
    } else {
      sorted.sort((a, b) => a.id - b.id)
    }
    return buildQuery(sorted, table)
  },
  async limit(limit: number) {
    return rows.slice(0, limit)
  }
})

const fakeDb = {
  select() {
    return {
      from(table: unknown) {
        const rows = table === storeItems ? storeItemsData : chatMessagesData
        return buildQuery(rows, table)
      }
    }
  },
  insert(table: unknown) {
    return {
      async values(rows: { author: string; body: string } | { author: string; body: string }[]) {
        if (table === chatMessages) {
          const payloads = Array.isArray(rows) ? rows : [rows]
          payloads.forEach((row) => {
            chatMessagesData.push({ id: nextChatId, createdAt: new Date(), ...row })
            nextChatId += 1
          })
        }
      }
    }
  }
}

mock.module('../src/db/client', () => ({ db: fakeDb }))
mock.module('../src/db/prepare', () => ({ prepareDatabase: async () => {} }))

let valkeyReady = true

const valkey = {
  isOpen: true,
  async get(key: string) {
    return cacheStorage.get(key) ?? null
  },
  async set(key: string, value: string) {
    cacheStorage.set(key, value)
    cacheKeysWritten.push(key)
  },
  async publish(_channel: string, message: string) {
    publishedMessages.push(message)
    for (const handler of subscribers) {
      handler(message)
    }
    return 1
  },
  duplicate() {
    return {
      async connect() {},
      async subscribe(_channel: string, handler: (message: string) => void) {
        subscribers.push(handler)
      },
      async quit() {}
    }
  },
  async connect() {},
  async quit() {}
}

mock.module('../src/services/cache', () => ({
  valkey,
  isValkeyReady: () => valkeyReady,
  async connectValkey() {
    valkeyReady = true
  }
}))

export const apiPort = 4110
export const apiUrl = `http://127.0.0.1:${apiPort}`

let startPromise: Promise<void> | null = null

export const resetTestState = () => {
  storeItemsData.splice(0, storeItemsData.length, ...structuredClone(defaultStoreItems))
  chatMessagesData.splice(0, chatMessagesData.length, ...structuredClone(defaultChatMessages))
  nextChatId = chatMessagesData.length + 1
  cacheStorage.clear()
  cacheKeysWritten.splice(0, cacheKeysWritten.length)
  publishedMessages.splice(0, publishedMessages.length)
  subscribers.splice(0, subscribers.length)
}

export const ensureApiReady = async () => {
  if (!startPromise) {
    process.env.API_PORT = String(apiPort)
    process.env.API_HOST = '127.0.0.1'
    process.env.RUN_MIGRATIONS = '0'
    startPromise = import('../src/index.ts').then(() => new Promise((resolve) => setTimeout(resolve, 50)))
  }
  await startPromise
}
