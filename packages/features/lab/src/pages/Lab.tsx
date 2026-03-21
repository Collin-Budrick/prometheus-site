import type { DocumentHead } from '@builder.io/qwik-city'
import { LabRoute, LabSkeleton, type LabCopy, type LabStarterCard } from '../lab-route'

export type { LabCopy, LabStarterCard }
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
