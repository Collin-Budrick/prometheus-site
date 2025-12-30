import { getLocale } from '@builder.io/qwik'
import { inlineTranslate } from 'qwik-speak'
import { normalizeLocale } from './locale'
import { defaultLocale, type Locale } from './locales'
import { getClientLocaleSignal } from './locale-context'

const buildTemplate = (strings: TemplateStringsArray) => {
  let key = strings[0] ?? ''
  for (let i = 1; i < strings.length; i += 1) {
    key += `{{p${i}}}${strings[i] ?? ''}`
  }
  return key
}

const buildParams = (values: unknown[]) => {
  if (!values.length) return undefined
  const params: Record<string, unknown> = {}
  values.forEach((value, index) => {
    params[`p${index + 1}`] = value
  })
  return params
}

const resolveActiveLocale = (): Locale => {
  const signal = getClientLocaleSignal()
  if (signal) {
    return signal.value
  }
  const fallback = getLocale(defaultLocale)
  return normalizeLocale(fallback) ?? defaultLocale
}

export const useInlineTranslate = () => {
  const translate = inlineTranslate()
  return ((keys: string | string[], params?: Record<string, unknown>) => {
    const locale = resolveActiveLocale()
    if (Array.isArray(keys)) return translate(keys, params, locale)
    return translate(keys, params, locale)
  }) as typeof translate
}

export const _ = (strings: TemplateStringsArray, ...values: unknown[]) => {
  const t = inlineTranslate()
  const key = buildTemplate(strings)
  const params = buildParams(values)
  const lookup = `${key}@@${key}`
  const locale = resolveActiveLocale()
  return params ? t(lookup, params, locale) : t(lookup, undefined, locale)
}
