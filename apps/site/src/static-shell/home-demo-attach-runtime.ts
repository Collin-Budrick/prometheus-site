import { attachHomeDemo as attachHomeDemoFromSsr } from './home-demo-activate'
import type { HomeDemoStartupAttachRuntimeModule } from './home-demo-runtime-types'

export const attachVisibleHomeDemo: HomeDemoStartupAttachRuntimeModule['attachHomeDemo'] = async (
  options
) => attachHomeDemoFromSsr(options)

export const attachHomeDemoByKind = attachVisibleHomeDemo
export const attachHomeDemo = attachVisibleHomeDemo
