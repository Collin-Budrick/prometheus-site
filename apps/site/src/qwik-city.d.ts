import '@builder.io/qwik-city'

declare module '@builder.io/qwik-city' {
  interface DocumentHeadValue<FrontMatter extends Record<string, any> = Record<string, unknown>> {
    htmlAttributes?: Record<string, string>
  }
}
