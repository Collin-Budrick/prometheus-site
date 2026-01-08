import { unified } from 'unified'
import rehypeParse from 'rehype-parse'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'

import {
  allowedAttributes,
  ariaAttributePattern,
  customElementTags,
  dataAttributePattern,
  htmlAttributeAliases,
  mathTags,
  svgAttributeAliases,
  svgTags
} from './sanitize.shared'

const mergeAttributes = (
  base: Array<string | RegExp> | undefined,
  extra: Array<string | RegExp>
): Array<string | RegExp> => {
  const merged = new Set<string | RegExp>(base ?? [])
  extra.forEach((entry) => merged.add(entry))
  return Array.from(merged)
}

const sanitizeSchema = {
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
      dataAttributePattern,
      ariaAttributePattern
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
