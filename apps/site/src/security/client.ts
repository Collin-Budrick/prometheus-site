import {
  CSP_NONCE_ATTR,
  TRUSTED_TYPES_SERVER_POLICY_NAME,
  TRUSTED_TYPES_TEMPLATE_POLICY_NAME,
  type TrustedHtml
} from './shared'

type TrustedHtmlKind = 'server' | 'template'

type TrustedTypePolicyLike = {
  createHTML: (input: string) => TrustedHtml
}

type TrustedTypePolicyFactoryLike = {
  createPolicy: (
    name: string,
    rules: {
      createHTML: (input: string) => string
    }
  ) => TrustedTypePolicyLike
}

type TrustedTypesGlobal = typeof globalThis & {
  trustedTypes?: TrustedTypePolicyFactoryLike
  __PROM_TT_POLICIES__?: Partial<Record<string, TrustedTypePolicyLike>>
}

type InnerHtmlTarget = {
  innerHTML: string
}

const getTrustedTypesGlobal = () => globalThis as TrustedTypesGlobal

const getTrustedTypesPolicyName = (kind: TrustedHtmlKind) =>
  kind === 'server' ? TRUSTED_TYPES_SERVER_POLICY_NAME : TRUSTED_TYPES_TEMPLATE_POLICY_NAME

const getTrustedTypesPolicy = (kind: TrustedHtmlKind) => {
  const target = getTrustedTypesGlobal()
  const cached = target.__PROM_TT_POLICIES__?.[getTrustedTypesPolicyName(kind)]
  if (cached) {
    return cached
  }

  const factory = target.trustedTypes
  if (!factory?.createPolicy) {
    return null
  }

  try {
    const policy = factory.createPolicy(getTrustedTypesPolicyName(kind), {
      createHTML: (input: string) => input
    })
    target.__PROM_TT_POLICIES__ = {
      ...(target.__PROM_TT_POLICIES__ ?? {}),
      [getTrustedTypesPolicyName(kind)]: policy
    }
    return policy
  } catch {
    return target.__PROM_TT_POLICIES__?.[getTrustedTypesPolicyName(kind)] ?? null
  }
}

const assignInnerHtml = (target: InnerHtmlTarget, value: TrustedHtml) => {
  ;(target as unknown as { innerHTML: string | TrustedHTML }).innerHTML = value
}

export const getCspNonce = (
  documentRef: Pick<Document, 'documentElement'> | null | undefined =
    typeof document !== 'undefined' ? document : null
) => documentRef?.documentElement.getAttribute(CSP_NONCE_ATTR) ?? null

export const applyCspNonce = <
  T extends {
    nonce: string
  }
>(
  element: T,
  nonce = getCspNonce()
) => {
  if (nonce) {
    element.nonce = nonce
  }
  return element
}

export const asTrustedHtml = (html: string, kind: TrustedHtmlKind = 'server'): TrustedHtml => {
  const policy = getTrustedTypesPolicy(kind)
  if (!policy) {
    return html
  }
  return policy.createHTML(html)
}

export const setTrustedInnerHtml = (
  target: InnerHtmlTarget,
  html: string,
  kind: TrustedHtmlKind = 'server'
) => {
  assignInnerHtml(target, asTrustedHtml(html, kind))
}

export const setTrustedTemplateHtml = (
  template: Pick<HTMLTemplateElement, 'innerHTML'>,
  html: string,
  kind: TrustedHtmlKind = 'server'
) => {
  assignInnerHtml(template as InnerHtmlTarget, asTrustedHtml(html.trim(), kind))
}
