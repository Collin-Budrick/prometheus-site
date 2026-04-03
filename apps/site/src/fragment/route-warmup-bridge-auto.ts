import { installFragmentRouteWarmupBridge } from './route-warmup-bridge'

if (typeof window !== 'undefined') {
  installFragmentRouteWarmupBridge()
}
