import { inlineTranslate } from 'qwik-speak'

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

export const _ = (strings: TemplateStringsArray, ...values: unknown[]) => {
  const t = inlineTranslate()
  const key = buildTemplate(strings)
  const params = buildParams(values)
  const lookup = `${key}@@${key}`
  return params ? t(lookup, params) : t(lookup)
}
