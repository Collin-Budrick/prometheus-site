export type StarterStoreItem = {
  id: number
  name: string
  price: number
  quantity: number
  createdAt: Date
}

export type StarterChatMessage = {
  id: number
  author: string
  body: string
  createdAt: Date
}

export type StarterLabCard = {
  id: string
  title: string
  summary: string
  status: 'ready' | 'draft'
}

const buildDefaultStoreItems = () =>
  Array.from({ length: 15 }, (_, index) => ({
    id: index + 1,
    name: `Item ${index + 1}`,
    price: Number(((index + 1) * 3).toFixed(2)),
    quantity: index + 1,
    createdAt: new Date(2024, 0, index + 1)
  }))

const buildDefaultChatMessages = () => [
  { id: 1, author: 'alice', body: 'Hello from Alice', createdAt: new Date('2024-01-01T00:00:00Z') },
  { id: 2, author: 'bob', body: 'Reply from Bob', createdAt: new Date('2024-01-02T00:00:00Z') }
]

const buildDefaultLabCards = (): StarterLabCard[] => [
  {
    id: 'fragment-audit',
    title: 'Fragment audit',
    summary: 'Inspect fragment payloads, shell timing, and cache behavior.',
    status: 'ready'
  },
  {
    id: 'motion-pass',
    title: 'Motion pass',
    summary: 'Tune route transitions and stagger timings for the starter shell.',
    status: 'draft'
  }
]

export const starterStoreItems = buildDefaultStoreItems()
export const starterChatMessages = buildDefaultChatMessages()
export const starterLabCards = buildDefaultLabCards()

let nextStarterChatId = starterChatMessages.length + 1

export const resetStarterShowcaseData = () => {
  starterStoreItems.splice(0, starterStoreItems.length, ...buildDefaultStoreItems())
  starterChatMessages.splice(0, starterChatMessages.length, ...buildDefaultChatMessages())
  starterLabCards.splice(0, starterLabCards.length, ...buildDefaultLabCards())
  nextStarterChatId = starterChatMessages.length + 1
}

export const listStarterStoreItems = () => starterStoreItems

export const listStarterChatMessages = (limit = 20) =>
  [...starterChatMessages]
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    .slice(-Math.max(1, limit))

export const appendStarterChatMessage = (message: { author: string; body: string }) => {
  const nextMessage: StarterChatMessage = {
    id: nextStarterChatId,
    author: message.author,
    body: message.body,
    createdAt: new Date()
  }
  nextStarterChatId += 1
  starterChatMessages.push(nextMessage)
  return nextMessage
}

export const searchStarterStoreItems = (query: string) => {
  const normalized = query.trim().toLowerCase()
  if (normalized === '') return []
  return starterStoreItems.filter((item) => item.name.toLowerCase().includes(normalized))
}
