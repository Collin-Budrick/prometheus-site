import '@site/fragment/definitions/home.server'
import '@site/fragment/definitions/store'
import '@site/fragment/definitions/chat'
import { createFragmentTranslator } from '@site/fragment/definitions/i18n'
import { startApiServer, type ApiServerOptions } from '../server/app'

const testOverrides =
  (globalThis as typeof globalThis & { __PROM_API_TEST__?: ApiServerOptions['server'] })
    .__PROM_API_TEST__

void startApiServer({
  fragment: {
    createTranslator: createFragmentTranslator
  },
  server: testOverrides
})
