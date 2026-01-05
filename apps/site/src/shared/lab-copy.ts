import { defaultLanguage, labCopy, type LabPageCopy, type Lang } from '../config'

export const getLabCopy = (lang: Lang = defaultLanguage): LabPageCopy =>
  labCopy[lang] ?? labCopy[defaultLanguage]
