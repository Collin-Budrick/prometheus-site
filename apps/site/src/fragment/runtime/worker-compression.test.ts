import { describe, expect, it } from 'bun:test'

import {
  canReadWorkerStreamEncoding,
  shouldAdvertiseZstdForWorkerLiveStream,
  shouldUseCompressedWorkerBootStream
} from './worker-compression'

describe('worker compression helpers', () => {
  it('only treats native encodings as stream-readable', () => {
    expect(canReadWorkerStreamEncoding(null, ['gzip'])).toBe(true)
    expect(canReadWorkerStreamEncoding('gzip', ['gzip', 'zstd'])).toBe(true)
    expect(canReadWorkerStreamEncoding('br', ['gzip', 'zstd'])).toBe(false)
    expect(canReadWorkerStreamEncoding('zstd', ['gzip', 'zstd'])).toBe(false)
  })

  it('only enables compressed boot streams before the first worker commit', () => {
    expect(
      shouldUseCompressedWorkerBootStream({
        firstWorkerCommitSent: false,
        supportedEncodingCount: 1
      })
    ).toBe(true)
    expect(
      shouldUseCompressedWorkerBootStream({
        firstWorkerCommitSent: true,
        supportedEncodingCount: 1
      })
    ).toBe(false)
    expect(
      shouldUseCompressedWorkerBootStream({
        firstWorkerCommitSent: false,
        supportedEncodingCount: 0
      })
    ).toBe(false)
  })

  it('keeps zstd off long-lived live streams until the worker can stream-read it directly', () => {
    expect(shouldAdvertiseZstdForWorkerLiveStream()).toBe(false)
  })
})
