import { createFragmentTranslator } from '@site/fragment/definitions/i18n'
import { registerSiteFragmentBundles } from '@site/fragment/definitions/register'
import { platformConfig } from '../config'
import { startApiServer, type ApiServerOptions } from '../server/app'

const testOverrides =
  (globalThis as typeof globalThis & { __PROM_API_TEST__?: ApiServerOptions['server'] })
    .__PROM_API_TEST__

registerSiteFragmentBundles({ template: platformConfig.template })

void startApiServer({
  fragment: {
    createTranslator: createFragmentTranslator
  },
  server: testOverrides
})
