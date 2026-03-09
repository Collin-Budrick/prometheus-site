import { Slot, component$ } from '@builder.io/qwik'
import { STATIC_PAGE_ROOT_ATTR } from './constants'

export const StaticPageRoot = component$(() => (
  <div
    {...{
      [STATIC_PAGE_ROOT_ATTR]: 'true'
    }}
  >
    <Slot />
  </div>
))
