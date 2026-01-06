import '@site/fragments/home'
import { createFragmentTranslator } from '@site/fragments/i18n'
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
