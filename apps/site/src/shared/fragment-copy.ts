export type FragmentHeaderCopy = {
  heading: 'h1' | 'h2'
  metaLine?: string | string[]
  title: string
  description?: string
}

import { defaultLanguage, fragmentHeaderCopy, type Lang } from '../config'

export const getFragmentHeaderCopy = (lang: Lang) => fragmentHeaderCopy[lang] ?? fragmentHeaderCopy[defaultLanguage]
