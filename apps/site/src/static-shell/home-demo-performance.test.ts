import { describe, expect, it } from 'bun:test'
import { shouldMarkDetailedHomeDemoPerformance } from './home-demo-performance'

describe('home-demo-performance', () => {
  it('does not assume import.meta.env is available in the static-shell runtime', () => {
    expect(() => shouldMarkDetailedHomeDemoPerformance()).not.toThrow()
  })
})
