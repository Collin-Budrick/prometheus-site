export const prerenderRoutes = ['/', '/ai'] as const

export type PrerenderRoute = (typeof prerenderRoutes)[number]
