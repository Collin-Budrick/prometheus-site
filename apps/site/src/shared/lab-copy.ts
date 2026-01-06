import { getLanguagePack, type LabPageCopy, type Lang } from '../lang'

export const getLabCopy = (lang: Lang): LabPageCopy => getLanguagePack(lang).lab
