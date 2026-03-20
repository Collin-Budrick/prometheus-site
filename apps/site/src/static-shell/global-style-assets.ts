import { type DocumentLink } from '@builder.io/qwik-city'
import globalDeferredStylesheetHref from '@prometheus/ui/global-deferred.css?url'

type HeadLink = DocumentLink

export const buildGlobalStylesheetLinks = (links: HeadLink[] = []): HeadLink[] => [
  {
    rel: 'stylesheet',
    href: globalDeferredStylesheetHref
  },
  ...links
]

export { globalDeferredStylesheetHref }
