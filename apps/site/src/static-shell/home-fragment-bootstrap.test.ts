import { describe, expect, it } from 'bun:test'
import {
  HOME_FRAGMENT_BOOTSTRAP_STATE_KEY,
  buildPrimeHomeFragmentBootstrapScript,
  buildHomeFragmentBootstrapEarlyHint,
  buildHomeFragmentBootstrapPreloadLink,
  fetchHomeFragmentBootstrapBytes
} from './home-fragment-bootstrap'

describe('home fragment bootstrap preload metadata', () => {
  it('marks the head preload as an anonymous fetch so the browser can reuse it', () => {
    expect(buildHomeFragmentBootstrapPreloadLink('en')).toMatchObject({
      rel: 'preload',
      as: 'fetch',
      crossorigin: 'anonymous'
    })
  })

  it('marks the early hint with matching crossorigin metadata', () => {
    expect(buildHomeFragmentBootstrapEarlyHint('en')).toMatchObject({
      as: 'fetch',
      crossorigin: 'anonymous'
    })
  })

  it('fetches the bootstrap bundle with matching cors and credentials settings', async () => {
    let requestInit: RequestInit | undefined

    await fetchHomeFragmentBootstrapBytes({
      href: 'https://prometheus.prod/api/fragments/bootstrap?protocol=2&ids=fragment://page/home/planner@v1',
      fetcher: async (_href, init) => {
        requestInit = init
        return new Response(new Uint8Array(0))
      }
    })

    expect(requestInit).toMatchObject({
      credentials: 'same-origin',
      mode: 'cors'
    })
  })

  it('builds an inline priming script that stores the bootstrap promise on window', () => {
    const href = '/api/fragments/bootstrap?protocol=2&ids=fragment://page/home/planner@v1'
    const script = buildPrimeHomeFragmentBootstrapScript(href)

    expect(script).toContain(HOME_FRAGMENT_BOOTSTRAP_STATE_KEY)
    expect(script).toContain('fetch(href,{cache:"default",credentials:"same-origin",mode:"cors"})')
    expect(script).toContain(JSON.stringify(href))
  })
})
