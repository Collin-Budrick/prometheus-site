import type { DocumentHead } from '@builder.io/qwik-city'
import { LabRoute, LabSkeleton, type LabCopy } from '../lab-route'

export type { LabCopy }
export { LabRoute, LabSkeleton }

export const head: DocumentHead = {
  title: 'Lab',
  meta: [
    {
      name: 'description',
      content: 'Prototype new fragment systems and validate edge behaviors.'
    }
  ]
}

export const skeleton = LabSkeleton

export default LabRoute
