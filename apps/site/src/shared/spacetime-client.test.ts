import { describe, expect, it } from 'bun:test'

import { resolveCandidateUris } from './spacetime-client'

describe('resolveCandidateUris', () => {
  it('prefers the same-origin Caddy proxy before the sibling db host on fresh sessions', () => {
    expect(
      resolveCandidateUris({
        uri: 'https://db.prometheus.dev/',
        moduleName: 'prometheus-site-local',
        currentOrigin: 'https://prometheus.dev',
        storedPreferredUri: null
      })
    ).toEqual(['https://prometheus.dev/', 'https://db.prometheus.dev/'])
  })

  it('keeps the configured direct uri first when it is not a sibling db host', () => {
    expect(
      resolveCandidateUris({
        uri: 'https://db.example.com/',
        moduleName: 'prometheus-site-local',
        currentOrigin: 'https://prometheus.dev',
        storedPreferredUri: null
      })
    ).toEqual(['https://db.example.com/', 'https://prometheus.dev/'])
  })

  it('preserves a stored preferred uri ahead of the fallback order', () => {
    expect(
      resolveCandidateUris({
        uri: 'https://db.prometheus.dev/',
        moduleName: 'prometheus-site-local',
        currentOrigin: 'https://prometheus.dev',
        storedPreferredUri: 'https://db.prometheus.dev/'
      })
    ).toEqual(['https://db.prometheus.dev/', 'https://prometheus.dev/'])
  })
})
