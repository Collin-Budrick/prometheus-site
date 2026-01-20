declare module 'preact' {
  export type ComponentChild = unknown
  export type ComponentChildren = ComponentChild
  export type FunctionComponent<P = Record<string, unknown>> = (props: P) => ComponentChild

  export function h(type: unknown, props?: Record<string, unknown> | null, children?: ComponentChildren): ComponentChild
  export function render(
    vnode: ComponentChild,
    parent: Element | Document | ShadowRoot | DocumentFragment | null
  ): void
}

declare module 'preact/hooks' {
  export function useState<T>(initial: T): [T, (next: T | ((prev: T) => T)) => void]
  export function useEffect(effect: () => void | (() => void), deps?: unknown[]): void
  export function useRef<T>(initialValue: T): { current: T }
  export function useRef<T>(initialValue: T | null): { current: T | null }
}
