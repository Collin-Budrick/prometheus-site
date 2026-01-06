import type { DocumentHead } from '@builder.io/qwik-city'
import { StoreRoute, StoreSkeleton, type StoreCopy } from '../store-route'

export type { StoreCopy }
export { StoreRoute, StoreSkeleton }

export const head: DocumentHead = {
  title: 'Store',
  meta: [
    {
      name: 'description',
      content: 'Browse curated modules, fragments, and templates.'
    }
  ]
}

export const skeleton = StoreSkeleton

export default StoreRoute
