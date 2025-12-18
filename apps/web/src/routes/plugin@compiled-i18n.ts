import type { RequestHandler } from '@builder.io/qwik-city'
import { resolveLocale } from '../i18n/locale'
import { createI18nOnRequest } from './i18n-on-request'

// Resolve locale from query param, cookie, or Accept-Language header.
export const onRequest: RequestHandler = createI18nOnRequest(resolveLocale)
