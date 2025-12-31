import { getLocale } from '@builder.io/qwik'
import { inlineTranslate, useSpeakContext } from 'qwik-speak'
import { normalizeLocale } from './locale'
import { defaultLocale, type Locale } from './locales'
import { getClientLocaleSignal, useRenderLocaleSignal } from './locale-context'
import { getClientSpeakContext } from './speak-context'

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

const separateKeyValue = (key: string, keyValueSeparator = '@@') => key.split(keyValueSeparator)

const transpileParams = (value: string, params?: Record<string, unknown>) => {
  if (!params) return value
  return value.replace(/{{\s?([^{}\s]*)\s?}}/g, (substring, parsedKey) => {
    const replacer = params[parsedKey]
    return replacer !== undefined ? String(replacer) : substring
  })
}

const getValue = (
  key: string,
  data: Record<string, unknown>,
  params?: Record<string, unknown>,
  keySeparator = '.',
  keyValueSeparator = '@@'
) => {
  let defaultValue: string | undefined
  ;[key, defaultValue] = separateKeyValue(key, keyValueSeparator)
  const value = key
    .split(keySeparator)
    .reduce<any>((acc, cur) => (acc && acc[cur] !== undefined ? acc[cur] : undefined), data)
  if (value) {
    if (typeof value === 'string') return transpileParams(value, params)
    if (typeof value === 'object') {
      const serialized = JSON.stringify(value)
      return params ? JSON.parse(transpileParams(serialized, params)) : JSON.parse(serialized)
    }
  }
  if (defaultValue) {
    const trimmed = defaultValue.trim()
    if (!/^[[{].*[\\]}]$/.test(trimmed) || trimmed.startsWith('{{')) {
      return transpileParams(defaultValue, params)
    }
    const parsed = params ? transpileParams(trimmed, params) : trimmed
    return JSON.parse(parsed)
  }
  return key
}

const resolveActiveLocale = (): Locale => {
  const signal = getClientLocaleSignal()
  if (signal) return signal.value
  const fallback = getLocale(defaultLocale)
  return normalizeLocale(fallback) ?? defaultLocale
}

type TranslateState = {
  translation?: Record<string, Record<string, unknown>>
  config?: {
    keySeparator?: string
    keyValueSeparator?: string
  }
}

const translateWithState = (
  keys: string | string[],
  params: Record<string, unknown> | undefined,
  locale: Locale,
  state: TranslateState
) => {
  const translations = state.translation?.[locale] ?? {}
  const keySeparator = (state.config?.keySeparator as string | undefined) ?? '.'
  const keyValueSeparator = (state.config?.keyValueSeparator as string | undefined) ?? '@@'
  if (Array.isArray(keys)) {
    return keys.map((key) => getValue(key, translations, params, keySeparator, keyValueSeparator))
  }
  return getValue(keys, translations, params, keySeparator, keyValueSeparator)
}

const translateRuntime = (keys: string | string[], params: Record<string, unknown> | undefined, locale: Locale) => {
  const state = getClientSpeakContext()
  if (state) return translateWithState(keys, params, locale, state)
  const translate = inlineTranslate()
  if (Array.isArray(keys)) return translate(keys, params, locale)
  return translate(keys, params, locale)
}

export const useInlineTranslate = () => {
  const speak = useSpeakContext()
  const renderLocaleSignal = useRenderLocaleSignal()
  return ((keys: string | string[], params?: Record<string, unknown>) => {
    const locale = renderLocaleSignal.value
    return translateWithState(keys, params, locale, speak) as string | string[]
  }) as ReturnType<typeof inlineTranslate>
}

export const translateStatic = (keys: string | string[], params?: Record<string, unknown>) => {
  const locale = resolveActiveLocale()
  return translateRuntime(keys, params, locale)
}

export const _ = (strings: TemplateStringsArray, ...values: unknown[]) => {
  const key = buildTemplate(strings)
  const params = buildParams(values)
  const lookup = `${key}@@${key}`
  const locale = resolveActiveLocale()
  return translateRuntime(lookup, params, locale)
}
