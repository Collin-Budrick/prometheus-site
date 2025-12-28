import type { RequestEventBase } from '@builder.io/qwik-city'
import { describe, expect, it } from 'bun:test'

import { forwardAuthCookies } from './session'

const createEvent = () => {
  const forwarded: string[] = []
  const event = {
    headers: {
      append: (_name: string, value: string) => {
        forwarded.push(value)
      }
    }
  } as unknown as RequestEventBase

  return { event, forwarded }
}

describe('forwardAuthCookies', () => {
  it('forwards all cookies when the header string includes Expires commas', () => {
    const response = new Response('ok', {
      headers: {
        'set-cookie':
          'session=abc; Path=/; Expires=Wed, 21 Oct 2015 07:28:00 GMT, refresh=def; Path=/; Expires=Wed, 21 Oct 2015 07:28:00 GMT'
      }
    })
    const { event, forwarded } = createEvent()

    forwardAuthCookies(response, event)

    expect(forwarded).toEqual([
      'session=abc; Path=/; Expires=Wed, 21 Oct 2015 07:28:00 GMT',
      'refresh=def; Path=/; Expires=Wed, 21 Oct 2015 07:28:00 GMT'
    ])
  })

  it('uses getSetCookie when it is available on the response headers', () => {
    const cookies = [
      'session=abc; Path=/; Expires=Wed, 21 Oct 2015 07:28:00 GMT',
      'refresh=def; Path=/; Expires=Wed, 21 Oct 2015 07:28:00 GMT'
    ]
    const response = {
      headers: {
        getSetCookie: () => cookies
      }
    } as unknown as Response
    const { event, forwarded } = createEvent()

    forwardAuthCookies(response, event)

    expect(forwarded).toEqual(cookies)
  })
})
