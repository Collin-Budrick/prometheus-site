export const prerenderRoutes = ['/en', '/ko', '/en/ai', '/ko/ai'] as const

export type PrerenderRoute = (typeof prerenderRoutes)[number]
