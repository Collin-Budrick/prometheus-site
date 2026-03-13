import { activatePlannerHomeDemo } from './home-demo-activate'
import type { HomeDemoRuntimeModule } from './home-demo-runtime-types'

export const activateHomeDemo: HomeDemoRuntimeModule['activateHomeDemo'] = async ({ root, props }) =>
  activatePlannerHomeDemo({ root, props })
