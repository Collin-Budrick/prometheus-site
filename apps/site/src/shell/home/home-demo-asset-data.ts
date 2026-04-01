import { STATIC_HOME_DATA_SCRIPT_ID } from '../core/static-shell-dom-constants'
import type { HomeDemoAssetMap } from './home-demo-runtime-types'

type JsonScriptElement = {
  textContent: string | null
}

type StaticHomeDemoAssetsDocument = Pick<Document, 'getElementById'>

type HomeDemoAssetPayload = {
  homeDemoAssets?: HomeDemoAssetMap | null
}

const isJsonScriptElement = (value: unknown): value is JsonScriptElement => {
  if (!value || typeof value !== 'object') {
    return false
  }
  return 'textContent' in value
}

export const readStaticHomeDemoAssets = ({
  doc = typeof document !== 'undefined' ? document : null
}: {
  doc?: StaticHomeDemoAssetsDocument | null
} = {}): HomeDemoAssetMap | null => {
  const element = doc?.getElementById(STATIC_HOME_DATA_SCRIPT_ID)
  if (!element || !isJsonScriptElement(element) || !element.textContent) {
    return null
  }

  try {
    const payload = JSON.parse(element.textContent) as HomeDemoAssetPayload
    return payload.homeDemoAssets ?? null
  } catch {
    return null
  }
}
