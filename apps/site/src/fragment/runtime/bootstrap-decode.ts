import type { FragmentPayload } from '../types'

export type BootstrapFragmentFrame = {
  id: string
  payloadBytes: Uint8Array
}

export const decodeBootstrapFramesSerially = async (
  frames: Iterable<BootstrapFragmentFrame>,
  decodeFrame: (
    fragmentId: string,
    payloadBytes: Uint8Array
  ) => FragmentPayload | Promise<FragmentPayload>
) => {
  const payloads: FragmentPayload[] = []

  for (const frame of frames) {
    payloads.push(await decodeFrame(frame.id, frame.payloadBytes))
  }

  return payloads
}
