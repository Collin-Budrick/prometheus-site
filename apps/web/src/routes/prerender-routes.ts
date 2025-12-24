import { getPrerenderRoutes } from '../config/page-config'

export const prerenderRoutes = getPrerenderRoutes()

export type PrerenderRoute = (typeof prerenderRoutes)[number]
