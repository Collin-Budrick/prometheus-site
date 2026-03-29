import { httpRouter } from 'convex/server'
import { authComponent, createAuth, resolveTrustedOrigins } from './auth'

const http = httpRouter()

authComponent.registerRoutes(http, createAuth, {
  cors: {
    allowedOrigins: resolveTrustedOrigins()
  }
})

export default http
