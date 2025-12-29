import { beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { apiUrl, cacheKeysWritten, chatMessagesData, ensureApiReady, publishedMessages, resetTestState, storeItemsData } from './setup'

beforeAll(async () => {
  await ensureApiReady()
})

beforeEach(() => {
  resetTestState()
})

describe('health endpoint', () => {
  it('returns ok status and uptime', async () => {
    const response = await fetch(`${apiUrl}/health`)
    expect(response.status).toBe(200)

    const payload = await response.json()
    expect(payload.status).toBe('ok')
    expect(typeof payload.uptime).toBe('number')
  })
})

describe('store pagination', () => {
  it('paginates items and sets cache entries', async () => {
    const firstPage = await fetch(`${apiUrl}/store/items`)
    expect(firstPage.status).toBe(200)
    const firstPayload = await firstPage.json()

    expect(firstPayload.items.length).toBe(10)
    expect(firstPayload.items[0].id).toBe(1)
    expect(firstPayload.items.at(-1)?.id).toBe(10)
    expect(firstPayload.cursor).toBe(10)
    expect(cacheKeysWritten).toContain('store:items:0:10')

    const nextPage = await fetch(`${apiUrl}/store/items?cursor=${firstPayload.cursor}&limit=5`)
    expect(nextPage.status).toBe(200)
    const nextPayload = await nextPage.json()

    expect(nextPayload.items.length).toBe(5)
    expect(nextPayload.items[0].id).toBe(11)
    expect(nextPayload.items.at(-1)?.id).toBe(15)
    expect(nextPayload.cursor).toBe(15)

    const finalPage = await fetch(`${apiUrl}/store/items?cursor=${nextPayload.cursor}&limit=10`)
    expect(finalPage.status).toBe(200)
    const finalPayload = await finalPage.json()

    expect(finalPayload.items.length).toBe(0)
    expect(finalPayload.cursor).toBeNull()

    expect(storeItemsData.length).toBe(15)
  })
})

describe('echo endpoint validation', () => {
  it('rejects empty prompt', async () => {
    const response = await fetch(`${apiUrl}/ai/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '   ' })
    })

    expect(response.status).toBe(400)
    const payload = await response.json()
    expect(payload.error).toContain('Prompt cannot be empty')
  })

  it('rejects overly long prompt', async () => {
    const tooLong = 'a'.repeat(2001)
    const response = await fetch(`${apiUrl}/ai/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: tooLong })
    })

    expect(response.status).toBe(400)
    const payload = await response.json()
    expect(payload.error).toContain('Prompt too long')
  })

  it('responds with echoed prompt when valid', async () => {
    const response = await fetch(`${apiUrl}/ai/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Hello there' })
    })

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.echo).toBe('You said: Hello there')
  })
})

describe('chat websocket publish', () => {
  it('rejects unauthenticated websocket connections', async () => {
    const socket = new WebSocket(`${apiUrl.replace('http', 'ws')}/ws`)

    const firstMessage = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('auth timeout')), 1000)
      socket.addEventListener('message', (event) => {
        clearTimeout(timer)
        resolve(event.data.toString())
      })
      socket.addEventListener('error', (event) => reject(event instanceof ErrorEvent ? event.error : new Error('socket error')))
    })

    const payload = JSON.parse(firstMessage)
    expect(payload.error).toContain('Authentication required')
    socket.close()
  })

  it('publishes authenticated chat messages with user metadata', async () => {
    const login = await fetch(`${apiUrl}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'existing@example.com',
        password: 'password123',
        rememberMe: true
      }),
      redirect: 'manual'
    })

    expect(login.status).toBe(200)
    const cookie = login.headers.get('set-cookie') ?? ''
    const socket = new WebSocket(`${apiUrl.replace('http', 'ws')}/ws`, {
      headers: { cookie }
    } as any)

    const welcome = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('welcome timeout')), 1000)
      socket.addEventListener('message', (event) => {
        clearTimeout(timer)
        resolve(event.data.toString())
      })
      socket.addEventListener('error', (event) => reject(event instanceof ErrorEvent ? event.error : new Error('socket error')))
    })

    const welcomePayload = JSON.parse(welcome)
    expect(welcomePayload.type).toBe('welcome')

    socket.send(JSON.stringify({ type: 'chat', text: 'Hello chat' }))

    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(publishedMessages.length).toBe(1)
    const published = JSON.parse(publishedMessages[0])
    expect(published.type).toBe('chat')
    expect(published.text).toBe('Hello chat')
    expect(published.from).toBe('Existing User')
    expect(published.authorId).toBe('user-1')

    expect(chatMessagesData.at(-1)?.body).toBe('Hello chat')
    expect(chatMessagesData.at(-1)?.author).toBe('Existing User')

    socket.close()
  })
})
