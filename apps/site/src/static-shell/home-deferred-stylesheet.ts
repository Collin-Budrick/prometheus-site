import {
  readStaticHomeBootstrapData,
  type StaticHomeBootstrapDocument
} from './home-bootstrap-data'
import { ensureHomeDemoStylesheet } from './home-demo-runtime-loader'

type HomeDeferredStylesheetDocument = StaticHomeBootstrapDocument &
  Pick<Document, 'createElement' | 'head' | 'querySelector'>

type EnsureStaticHomeDeferredStylesheetOptions = {
  href?: string | null
  doc?: HomeDeferredStylesheetDocument | null
}

export const readStaticHomeDeferredStylesheetHref = (
  doc: StaticHomeBootstrapDocument | null = typeof document !== 'undefined' ? document : null
) => readStaticHomeBootstrapData({ doc })?.homeDemoStylesheetHref ?? null

export const ensureStaticHomeDeferredStylesheet = ({
  href = null,
  doc = typeof document !== 'undefined' ? (document as HomeDeferredStylesheetDocument) : null
}: EnsureStaticHomeDeferredStylesheetOptions = {}) =>
  ensureHomeDemoStylesheet({
    doc,
    href: href ?? readStaticHomeDeferredStylesheetHref(doc)
  })
