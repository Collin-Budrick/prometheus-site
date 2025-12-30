import { createContextId, type Signal, useContext } from '@builder.io/qwik'
import type { Locale } from './locales'

export type LocaleContextState = {
  locale: Signal<Locale>
}

export const LocaleContext = createContextId<LocaleContextState>('app.locale')

export const useLocaleSignal = () => useContext(LocaleContext).locale
