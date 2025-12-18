export {}

declare global {
  interface ViewTransitionUpdateCallback {
    (): any
  }

  interface ViewTransitionTypeSet extends Set<string> {}

  interface ViewTransition {
    readonly finished: Promise<void>
    readonly ready: Promise<void>
    readonly updateCallbackDone: Promise<void>
    types: ViewTransitionTypeSet
    skipTransition(): void
  }

  interface StartViewTransitionOptions {
    types?: string[] | null
    update?: ViewTransitionUpdateCallback | null
  }

  interface Document {
    startViewTransition(callbackOptions?: ViewTransitionUpdateCallback | StartViewTransitionOptions): ViewTransition
  }
}

