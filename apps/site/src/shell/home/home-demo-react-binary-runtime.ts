import { activateReactBinaryHomeDemo } from './home-demo-activate'
import type { HomeDemoRuntimeModule } from './home-demo-runtime-types'

export const activateHomeDemo: HomeDemoRuntimeModule['activateHomeDemo'] = async ({ root, props }) =>
  activateReactBinaryHomeDemo({ root, props })

export const attachHomeDemo: HomeDemoRuntimeModule['attachHomeDemo'] = activateHomeDemo
