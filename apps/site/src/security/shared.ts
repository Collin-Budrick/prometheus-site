export const CSP_NONCE_SHARED_MAP_KEY = 'prometheus:csp-nonce'
export const CSP_NONCE_ATTR = 'data-csp-nonce'

export const TRUSTED_TYPES_SERVER_POLICY_NAME = 'prometheus-server-html'
export const TRUSTED_TYPES_TEMPLATE_POLICY_NAME = 'prometheus-template-html'
export const TRUSTED_TYPES_RUNTIME_SCRIPT_POLICY_NAME = 'prometheus-runtime-script'

export type TrustedHtml = string | TrustedHTML
export type TrustedScriptValue = string | TrustedScript
