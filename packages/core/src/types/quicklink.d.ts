declare module 'quicklink' {
  export type QuicklinkIgnore = (href: string, element?: Element) => boolean

  export type QuicklinkOptions = {
    el?: Element | Document
    origins?: string[]
    ignores?: QuicklinkIgnore[]
    hrefFn?: (anchor: HTMLAnchorElement) => string
    onError?: (error: unknown) => void
    priority?: boolean
    timeout?: number
  }

  export const listen: (options?: QuicklinkOptions) => () => void
  export const prefetch: (urls: string | string[], options?: QuicklinkOptions) => void
}
