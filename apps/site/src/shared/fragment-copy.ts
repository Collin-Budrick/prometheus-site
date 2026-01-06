import { getLanguagePack, type FragmentHeaderCopy, type Lang } from '../lang'

export type { FragmentHeaderCopy }

export const getFragmentHeaderCopy = (lang: Lang): Record<string, FragmentHeaderCopy> => getLanguagePack(lang).fragmentHeaders
