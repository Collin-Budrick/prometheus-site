import { Slot, component$ } from '@builder.io/qwik'
import { useCspNonce } from '../../security/qwik'
import { STATIC_PAGE_ROOT_ATTR } from './constants'

type StaticPageRootProps = {
  routeDataScriptId?: string
  routeData?: unknown
}

const serializeJson = (value: unknown) =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')

export const StaticPageRoot = component$<StaticPageRootProps>(({ routeDataScriptId, routeData }) => {
  const nonce = useCspNonce()

  return (
    <div
      {...{
        [STATIC_PAGE_ROOT_ATTR]: 'true'
      }}
    >
      <Slot />
      {routeDataScriptId ? (
        <script
          id={routeDataScriptId}
          type="application/json"
          nonce={nonce || undefined}
          dangerouslySetInnerHTML={serializeJson(routeData ?? {})}
        />
      ) : null}
    </div>
  )
})
