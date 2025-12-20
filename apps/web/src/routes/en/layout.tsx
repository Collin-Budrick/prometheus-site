import type { RequestHandler } from '@builder.io/qwik-city'
import { localeCookieOptions } from '../locale-routing'
import BaseLayout, { RouterHead as BaseRouterHead } from '../[locale]/layout'

export const onRequest: RequestHandler = ({ cookie, locale }) => {
  cookie.set('locale', 'en', localeCookieOptions)
  locale('en')
}

export const RouterHead = BaseRouterHead
export default BaseLayout

