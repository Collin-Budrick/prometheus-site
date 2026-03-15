import {
  CSP_NONCE_ATTR,
  TRUSTED_TYPES_RUNTIME_SCRIPT_POLICY_NAME,
  TRUSTED_TYPES_SERVER_POLICY_NAME,
  TRUSTED_TYPES_TEMPLATE_POLICY_NAME,
  type TrustedHtml,
  type TrustedScriptValue
} from './shared'

type TrustedHtmlKind = 'server' | 'template'

type TrustedTypePolicyLike = {
  createHTML?: (input: string) => TrustedHtml
  createScript?: (input: string) => TrustedScriptValue
}

type TrustedTypePolicyFactoryLike = {
  createPolicy: (
    name: string,
    rules: {
      createHTML?: (input: string) => string
      createScript?: (input: string) => string
    }
  ) => TrustedTypePolicyLike
}

type TrustedTypesGlobal = typeof globalThis & {
  trustedTypes?: TrustedTypePolicyFactoryLike
  __PROM_TT_POLICIES__?: Partial<Record<string, TrustedTypePolicyLike>>
  __PROM_TT_FUNCTION_BRIDGE__?: {
    installed: boolean
    original: FunctionConstructor
  }
}

type InnerHtmlTarget = {
  innerHTML: string
}

const getTrustedTypesGlobal = () => globalThis as TrustedTypesGlobal
const TRUSTED_HTML_KINDS: TrustedHtmlKind[] = ['server', 'template']

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

const getTrustedTypesRuntimeScriptPolicy = () => {
  const target = getTrustedTypesGlobal()
  const cached = target.__PROM_TT_POLICIES__?.[TRUSTED_TYPES_RUNTIME_SCRIPT_POLICY_NAME]
  if (cached?.createScript) {
    return cached
  }

  const factory = target.trustedTypes
  if (!factory?.createPolicy) {
    return null
  }

  try {
    const policy = factory.createPolicy(TRUSTED_TYPES_RUNTIME_SCRIPT_POLICY_NAME, {
      createScript: (input: string) => input
    })
    target.__PROM_TT_POLICIES__ = {
      ...(target.__PROM_TT_POLICIES__ ?? {}),
      [TRUSTED_TYPES_RUNTIME_SCRIPT_POLICY_NAME]: policy
    }
    return policy
  } catch {
    return target.__PROM_TT_POLICIES__?.[TRUSTED_TYPES_RUNTIME_SCRIPT_POLICY_NAME] ?? null
  }
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
  return policy.createHTML?.(html) ?? html
}

export const asTrustedScript = (script: string): TrustedScriptValue => {
  const policy = getTrustedTypesRuntimeScriptPolicy()
  if (!policy?.createScript) {
    return script
  }
  return policy.createScript(script)
}

export const primeTrustedTypesPolicies = (
  kinds: ReadonlyArray<TrustedHtmlKind> = TRUSTED_HTML_KINDS
) => {
  const policies: Partial<Record<TrustedHtmlKind, TrustedTypePolicyLike | null>> = {}
  kinds.forEach((kind) => {
    policies[kind] = getTrustedTypesPolicy(kind)
  })
  return policies
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

export const installTrustedTypesFunctionBridge = () => {
  const target = getTrustedTypesGlobal()
  if (target.__PROM_TT_FUNCTION_BRIDGE__?.installed) {
    return true
  }

  if (typeof target.Function !== 'function') {
    return false
  }

  const policy = getTrustedTypesRuntimeScriptPolicy()
  if (!policy?.createScript) {
    return false
  }

  const originalFunction = target.Function
  const toTrustedArgs = (args: unknown[]) =>
    args.map((arg) => (typeof arg === 'string' ? policy.createScript?.(arg) ?? arg : arg))

  const bridgedFunction = new Proxy(originalFunction as unknown as Function, {
    apply(targetFunction, thisArg, argArray) {
      return Reflect.apply(targetFunction, thisArg, toTrustedArgs(Array.from(argArray ?? [])))
    },
    construct(targetFunction, argArray, newTarget) {
      return Reflect.construct(
        targetFunction as unknown as FunctionConstructor,
        toTrustedArgs(Array.from(argArray ?? [])),
        newTarget
      )
    }
  }) as unknown as FunctionConstructor

  target.Function = bridgedFunction
  target.__PROM_TT_FUNCTION_BRIDGE__ = {
    installed: true,
    original: originalFunction
  }
  return true
}
