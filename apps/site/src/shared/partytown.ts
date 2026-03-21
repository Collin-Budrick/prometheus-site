import { partytownSnippet, type PartytownConfig } from '@qwik.dev/partytown/integration'
import type { PartytownAppConfig } from '../site-config'

type PartytownHeadScriptOptions = {
  config: PartytownAppConfig
  lib: string
  nonce?: string
}

export const buildPartytownHeadScript = ({ config, lib, nonce }: PartytownHeadScriptOptions) => {
  if (!config.enabled) return null

  const partytownConfig: PartytownConfig = {
    lib,
    ...(config.forward.length ? { forward: config.forward } : {}),
    ...(nonce ? { nonce } : {})
  }

  return partytownSnippet(partytownConfig)
}
