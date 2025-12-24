import Home from '../[locale]/index'
import { LocaleEntry, usePreferredLocale } from '../_shared/locale-entry'
import { onRequest as rootOnRequest } from './on-request'

export { head } from '../[locale]/index'
export const onRequest = rootOnRequest
export { usePreferredLocale }

export default LocaleEntry(Home)
