import { beforeEach, describe, expect, it } from 'bun:test'
import { apiUrl, cacheKeysWritten, chatMessagesData, ensureApiReady, publishedMessages, resetTestState, storeItemsData } from './setup'
import { decodeFragmentPayload } from '@core/fragment/binary'
import { parseFragmentFrames } from '@core/fragment/frames'
import { encodeFragmentKnownVersions } from '@core/fragment/known-versions'
import { buildFragmentCacheKey } from '@core/fragment/store'
import { platformConfig } from '@platform/config'

await ensureApiReady()

beforeEach(() => {
  resetTestState()
})

const featureFlags = platformConfig.template.features
const protocolTwoPath = featureFlags.store ? '/store' : '/'
const describeStore = featureFlags.store ? describe : describe.skip
const describeMessaging = featureFlags.messaging ? describe : describe.skip

const buildKnownVersions = (plan: { fragments: Array<{ id: string; cache?: { updatedAt?: number } }> }) =>
  encodeFragmentKnownVersions(
    plan.fragments.reduce<Record<string, number>>((acc, fragment) => {
      if (typeof fragment.cache?.updatedAt === 'number') {
        acc[fragment.id] = fragment.cache.updatedAt
      }
      return acc
    }, {})
  )

describe('health endpoint', () => {
  it('returns ok status and uptime', async () => {
    const response = await fetch(`${apiUrl}/health`)
    expect(response.status).toBe(200)

    const payload = await response.json()
    expect(payload.status).toBe('ok')
    expect(typeof payload.uptime).toBe('number')
  })
})

describe('fragment plan includeInitial', () => {
  it('returns initial fragment payloads and preserves cache headers', async () => {
    const response = await fetch(`${apiUrl}/fragments/plan?path=/&includeInitial=1`)
    expect(response.status).toBe(200)
    const payload = await response.json()

    const initialFragments = payload.initialFragments as Record<string, string> | undefined
    expect(initialFragments).toBeTruthy()
    const initialIds = initialFragments ? Object.keys(initialFragments) : []
    expect(initialIds.length).toBeGreaterThan(0)

    const planIds = payload.fragments.map((fragment: { id: string }) => fragment.id)
    const criticalIds = payload.fragments
      .filter((fragment: { id: string; critical?: boolean }) => fragment.critical)
      .map((fragment: { id: string }) => fragment.id)
    initialIds.forEach((id) => {
      expect(planIds).toContain(id)
    })
    criticalIds.forEach((id) => {
      expect(initialIds).toContain(id)
    })

    const sampleId = initialIds[0]
    const samplePayload = initialFragments?.[sampleId] ?? ''
    const bytes = Buffer.from(samplePayload, 'base64')
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    expect(view.getUint32(0, false)).toBe(0x46524147)

    const fragmentResponse = await fetch(`${apiUrl}/fragments?id=${encodeURIComponent(sampleId)}`)
    expect(fragmentResponse.status).toBe(200)
    const cacheControl = fragmentResponse.headers.get('cache-control')
    expect(cacheControl).toBeTruthy()
    expect(cacheControl).toContain('s-maxage=')
    expect(cacheControl).toContain('stale-while-revalidate=')
    expect(fragmentResponse.headers.get('x-fragment-cache')).toBeTruthy()
  })

  it('returns protocol 2 plans without base64 initial fragments', async () => {
    const response = await fetch(
      `${apiUrl}/fragments/plan?path=${encodeURIComponent(protocolTwoPath)}&includeInitial=1&protocol=2`
    )
    expect(response.status).toBe(200)

    const payload = await response.json()
    expect(payload.initialFragments).toBeUndefined()
    const hasHtmlBoot = payload.fragments.some((fragment: { bootMode?: string }) => fragment.bootMode === 'html')
    expect(Boolean(payload.initialHtml)).toBe(hasHtmlBoot)
    expect(
      payload.fragments.some(
        (fragment: { bootMode?: string }) =>
          fragment.bootMode === 'html' || fragment.bootMode === 'binary'
      )
    ).toBe(true)
  })

  it('returns a protocol 2 bootstrap bundle', async () => {
    const response = await fetch(
      `${apiUrl}/fragments/bootstrap?path=${encodeURIComponent(protocolTwoPath)}&protocol=2`
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/octet-stream')

    const frames = parseFragmentFrames(new Uint8Array(await response.arrayBuffer()))
    expect(frames.length).toBeGreaterThan(0)

    const [firstFrame] = frames
    const payload = decodeFragmentPayload(firstFrame!.payloadBytes)
    expect(payload.meta.cacheKey).toBe(buildFragmentCacheKey(firstFrame!.id, 'en'))
  })

  it('supports explicit protocol 2 bootstrap ids with stable ordering', async () => {
    const requestedIds = [
      'fragment://page/home/react@v1',
      'fragment://page/home/planner@v1',
      'fragment://page/home/react@v1'
    ]
    const response = await fetch(
      `${apiUrl}/fragments/bootstrap?path=/&protocol=2&ids=${encodeURIComponent(requestedIds.join(','))}`
    )
    expect(response.status).toBe(200)

    const frames = parseFragmentFrames(new Uint8Array(await response.arrayBuffer()))
    expect(frames.map((frame) => frame.id)).toEqual([
      'fragment://page/home/react@v1',
      'fragment://page/home/planner@v1'
    ])
  })

  it('filters already-known fragments from protocol 2 batch responses', async () => {
    await fetch(`${apiUrl}/fragments/bootstrap?path=${encodeURIComponent(protocolTwoPath)}&protocol=2`)
    const planResponse = await fetch(
      `${apiUrl}/fragments/plan?path=${encodeURIComponent(protocolTwoPath)}&protocol=2&refresh=1`
    )
    expect(planResponse.status).toBe(200)
    const plan = await planResponse.json()
    let known = buildKnownVersions(plan)

    const batchResponse = await fetch(`${apiUrl}/fragments/batch?protocol=2&known=${known}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(
        plan.fragments.map((fragment: { id: string }) => ({
          id: fragment.id
        }))
      )
    })

    expect(batchResponse.status).toBe(200)
    let frames = parseFragmentFrames(new Uint8Array(await batchResponse.arrayBuffer()))
    if (frames.length > 0) {
      const refreshedPlan = await (
        await fetch(
          `${apiUrl}/fragments/plan?path=${encodeURIComponent(protocolTwoPath)}&protocol=2&refresh=1`
        )
      ).json()
      known = buildKnownVersions(refreshedPlan)
      const retryResponse = await fetch(`${apiUrl}/fragments/batch?protocol=2&known=${known}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          refreshedPlan.fragments.map((fragment: { id: string }) => ({
            id: fragment.id
          }))
        )
      })
      expect(retryResponse.status).toBe(200)
      frames = parseFragmentFrames(new Uint8Array(await retryResponse.arrayBuffer()))
    }
    expect(frames.length).toBe(0)
  })

  it('filters already-known fragments from protocol 2 stream responses', async () => {
    await fetch(`${apiUrl}/fragments/bootstrap?path=${encodeURIComponent(protocolTwoPath)}&protocol=2`)
    const planResponse = await fetch(
      `${apiUrl}/fragments/plan?path=${encodeURIComponent(protocolTwoPath)}&protocol=2&refresh=1`
    )
    expect(planResponse.status).toBe(200)
    const plan = await planResponse.json()
    let known = buildKnownVersions(plan)

    let streamResponse = await fetch(
      `${apiUrl}/fragments/stream?path=${encodeURIComponent(protocolTwoPath)}&protocol=2&known=${known}&live=0`
    )
    expect(streamResponse.status).toBe(200)

    let frames = parseFragmentFrames(new Uint8Array(await streamResponse.arrayBuffer()))
    if (frames.length > 0) {
      const refreshedPlan = await (
        await fetch(
          `${apiUrl}/fragments/plan?path=${encodeURIComponent(protocolTwoPath)}&protocol=2&refresh=1`
        )
      ).json()
      known = buildKnownVersions(refreshedPlan)
      streamResponse = await fetch(
        `${apiUrl}/fragments/stream?path=${encodeURIComponent(protocolTwoPath)}&protocol=2&known=${known}&live=0`
      )
      expect(streamResponse.status).toBe(200)
      frames = parseFragmentFrames(new Uint8Array(await streamResponse.arrayBuffer()))
    }
    expect(frames.length).toBe(0)
  })

  it('returns protocol 2 one-shot stream bundles when live updates are disabled', async () => {
    const response = await fetch(`${apiUrl}/fragments/stream?path=/&protocol=2&live=0`)
    expect(response.status).toBe(200)

    const frames = parseFragmentFrames(new Uint8Array(await response.arrayBuffer()))
    expect(frames.length).toBeGreaterThan(0)
    expect(frames.every((frame) => frame.id !== '')).toBe(true)
  })
})

describeStore('store pagination', () => {
  it('paginates items and sets cache entries', async () => {
    const firstPage = await fetch(`${apiUrl}/store/items`)
    expect(firstPage.status).toBe(200)
    const firstPayload = await firstPage.json()

    expect(firstPayload.items.length).toBe(10)
    expect(firstPayload.items[0].id).toBe(1)
    expect(firstPayload.items.at(-1)?.id).toBe(10)
    expect(firstPayload.cursor).toBe(10)
    expect(cacheKeysWritten).toContain('store:items:0:10:id:asc')

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

describeMessaging('chat websocket publish', () => {
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
    const login = await fetch(`${apiUrl}/auth/session/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        idToken: 'mock-id-token'
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

    const publishedCountBefore = publishedMessages.length
    socket.send(JSON.stringify({ type: 'chat', text: 'Hello chat' }))

    await new Promise((resolve) => setTimeout(resolve, 50))

    const published = publishedMessages
      .slice(publishedCountBefore)
      .map((message) => JSON.parse(message))
      .find((message) => message.type === 'chat' && message.text === 'Hello chat')
    expect(published).toBeTruthy()
    expect(published.type).toBe('chat')
    expect(published.text).toBe('Hello chat')
    expect(published.from).toBe('Existing User')
    expect(published.authorId).toBe('user-1')

    expect(chatMessagesData.at(-1)?.body).toBe('Hello chat')
    expect(chatMessagesData.at(-1)?.author).toBe('Existing User')

    socket.close()
  })
})
