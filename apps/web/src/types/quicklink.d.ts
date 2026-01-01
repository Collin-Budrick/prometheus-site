declare module 'quicklink' {
  type IgnoreMatcher = ((href: string, element?: Element) => boolean) | RegExp

  interface ListenOptions {
    el?: Element | Document
    origins?: string[]
    ignores?: IgnoreMatcher[]
    hrefFn?: (element: HTMLAnchorElement) => string
    onError?: (error: unknown) => void
    priority?: boolean
    timeout?: number
    threshold?: number
    delay?: number
    prerender?: boolean
    prerenderAndPrefetch?: boolean
  }

  export function listen(options?: ListenOptions): () => void
  export function prefetch(urls: string | string[], priority?: boolean): Promise<unknown>
}
