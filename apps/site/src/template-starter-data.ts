import type { ContactInvitesSeed } from './shared/contact-invites-seed'

export const starterHomeNotes = [
  'Use the starter preset to keep the shell, nav, and a lightweight fragment walkthrough.',
  'Switch to the full preset when you want the richer showcase route and demo surface.'
] as const

export const starterStoreItems = [
  { id: 101, name: 'Launch Checklist Pack', price: 24, quantity: 14 },
  { id: 102, name: 'Narrative Landing Blocks', price: 39, quantity: 9 },
  { id: 103, name: 'Feature Flag Cookbook', price: 18, quantity: 26 }
] as const

export const starterContactInvites: ContactInvitesSeed = {
  invites: {
    incoming: [
      {
        id: 'starter-incoming-1',
        status: 'pending',
        user: {
          id: 'starter-user-1',
          name: 'Alex Rivera',
          handle: '@alex.template'
        }
      }
    ],
    outgoing: [
      {
        id: 'starter-outgoing-1',
        status: 'pending',
        user: {
          id: 'starter-user-2',
          name: 'Jules Chen',
          handle: '@jules.starter'
        }
      }
    ],
    contacts: [
      {
        id: 'starter-contact-1',
        status: 'accepted',
        user: {
          id: 'starter-user-3',
          name: 'Morgan Tate',
          handle: '@morgan.showcase'
        }
      }
    ]
  }
}

export type LabStarterCard = {
  id: string
  title: string
  description: string
  status: string
}

export const starterLabCards: readonly LabStarterCard[] = [
  {
    id: 'starter-lab-cache',
    title: 'Cache strategy spike',
    description: 'Swap cache TTLs and compare the fragment replay profile before shipping.',
    status: 'Ready for a product-specific experiment'
  },
  {
    id: 'starter-lab-copy',
    title: 'Editorial copy pass',
    description: 'Rewrite demo labels and route messaging without changing the underlying shell.',
    status: 'Starter-safe'
  },
  {
    id: 'starter-lab-motion',
    title: 'Motion tuning',
    description: 'Adjust stagger timing and transition density once the new brand direction is set.',
    status: 'Showcase upgrade'
  }
] as const
