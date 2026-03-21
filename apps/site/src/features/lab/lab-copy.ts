import { getLabCopy as getClientLabCopy } from '@site/lang/client'
import type { LabPageCopy, Lang } from '@site/lang'

export const getLabCopy = (lang: Lang): LabPageCopy => getClientLabCopy(lang)
