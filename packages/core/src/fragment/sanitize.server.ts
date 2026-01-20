import { unified } from 'unified'
import rehypeParse from 'rehype-parse'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import type { Schema } from 'hast-util-sanitize'

import {
  allowedAttributes,
  ariaAttributes,
  customElementTags,
  dataAttributeWildcard,
  htmlAttributeAliases,
  mathTags,
  svgAttributeAliases,
  svgTags
} from './sanitize.shared'

type AttributeDefinition = NonNullable<Schema['attributes']>[string][number]

const mergeAttributes = (
  base: Array<AttributeDefinition> | undefined,
  extra: Array<AttributeDefinition>
): Array<AttributeDefinition> => {
  const merged = new Map<string, AttributeDefinition>()
  ;(base ?? []).forEach((entry) => {
    merged.set(typeof entry === 'string' ? entry : entry[0], entry)
  })
  extra.forEach((entry) => {
    merged.set(typeof entry === 'string' ? entry : entry[0], entry)
  })
  return Array.from(merged.values())
}

const sanitizeSchema: Schema = {
  ...defaultSchema,
  tagNames: Array.from(
    new Set([...(defaultSchema.tagNames ?? []), ...customElementTags, ...svgTags, ...mathTags])
  ),
  attributes: {
    ...defaultSchema.attributes,
    '*': mergeAttributes(defaultSchema.attributes?.['*'], [
      ...allowedAttributes,
      ...svgAttributeAliases,
      ...htmlAttributeAliases,
      dataAttributeWildcard,
      ...ariaAttributes
    ])
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto', 'tel'],
    src: ['http', 'https'],
    action: ['http', 'https'],
    formaction: ['http', 'https']
  }
}

export const sanitizeHtml = (html: string): string => {
  if (!html) return ''
  const file = unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeStringify)
    .processSync(html)
  return String(file)
}
