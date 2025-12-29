export {}

declare global {
  interface Navigator {
    connection?: {
      saveData?: boolean
      effectiveType?: string
    }
  }
}
