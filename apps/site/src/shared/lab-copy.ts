import { getLabCopy as getClientLabCopy } from '../lang/client'
import type { LabPageCopy, Lang } from '../lang'

export const getLabCopy = (lang: Lang): LabPageCopy => getClientLabCopy(lang)
