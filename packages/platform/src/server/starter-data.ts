import {
  buildDefaultStarterChatMessages,
  buildDefaultStarterStoreItems,
  type StarterChatMessage,
  type StarterStoreItem
} from '@prometheus/template-config'

type StarterShowcaseState = {
  starterStoreItems: StarterStoreItem[]
  starterChatMessages: StarterChatMessage[]
  nextStarterChatId: number
}

const starterShowcaseStateKey = '__PROM_STARTER_SHOWCASE_STATE__'

const readStarterShowcaseState = () => {
  const globalState = globalThis as typeof globalThis & {
    [starterShowcaseStateKey]?: StarterShowcaseState
  }

  if (!globalState[starterShowcaseStateKey]) {
    const starterStoreItems = buildDefaultStarterStoreItems()
    const starterChatMessages = buildDefaultStarterChatMessages()
    globalState[starterShowcaseStateKey] = {
      starterStoreItems,
      starterChatMessages,
      nextStarterChatId: starterChatMessages.length + 1
    }
  }

  return globalState[starterShowcaseStateKey] as StarterShowcaseState
}

const starterShowcaseState = readStarterShowcaseState()

export const starterStoreItems = starterShowcaseState.starterStoreItems
export const starterChatMessages = starterShowcaseState.starterChatMessages

export const resetStarterShowcaseData = () => {
  starterStoreItems.splice(0, starterStoreItems.length, ...buildDefaultStarterStoreItems())
  starterChatMessages.splice(0, starterChatMessages.length, ...buildDefaultStarterChatMessages())
  starterShowcaseState.nextStarterChatId = starterChatMessages.length + 1
}

export const listStarterStoreItems = () => starterStoreItems

export const listStarterChatMessages = (limit = 20) =>
  [...starterChatMessages]
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    .slice(-Math.max(1, limit))

export const appendStarterChatMessage = (message: { author: string; body: string }) => {
  const nextMessage: StarterChatMessage = {
    id: starterShowcaseState.nextStarterChatId,
    author: message.author,
    body: message.body,
    createdAt: new Date()
  }
  starterShowcaseState.nextStarterChatId += 1
  starterChatMessages.push(nextMessage)
  return nextMessage
}

export const searchStarterStoreItems = (query: string) => {
  const normalized = query.trim().toLowerCase()
  if (normalized === '') return []
  return starterStoreItems.filter((item) => item.name.toLowerCase().includes(normalized))
}
