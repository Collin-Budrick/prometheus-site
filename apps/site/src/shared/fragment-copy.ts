import { getFragmentHeaderCopy as getClientFragmentHeaderCopy } from '../lang/client'
import type { FragmentHeaderCopy, Lang } from '../lang'

export type { FragmentHeaderCopy }

export const getFragmentHeaderCopy = (lang: Lang): Record<string, FragmentHeaderCopy> =>
  getClientFragmentHeaderCopy(lang)
