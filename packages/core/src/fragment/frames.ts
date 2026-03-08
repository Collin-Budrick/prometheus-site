const encoder = new TextEncoder()
const decoder = new TextDecoder()

export type FragmentFrame = {
  id: string
  payloadBytes: Uint8Array
}

export const buildFragmentFrame = (id: string, payloadBytes: Uint8Array) => {
  const idBytes = encoder.encode(id)
  const header = new Uint8Array(8)
  const view = new DataView(header.buffer)
  view.setUint32(0, idBytes.length, true)
  view.setUint32(4, payloadBytes.byteLength, true)

  const frame = new Uint8Array(header.byteLength + idBytes.byteLength + payloadBytes.byteLength)
  frame.set(header, 0)
  frame.set(idBytes, header.byteLength)
  frame.set(payloadBytes, header.byteLength + idBytes.byteLength)
  return frame
}

const heartbeatFrame = buildFragmentFrame('', new Uint8Array(0))

export const buildFragmentHeartbeatFrame = () => heartbeatFrame.slice()

export const isFragmentHeartbeatFrame = (frame: FragmentFrame) =>
  frame.id === '' && frame.payloadBytes.byteLength === 0

export const parseFragmentFrames = (bytes: Uint8Array) => {
  const frames: FragmentFrame[] = []
  let offset = 0

  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) {
      throw new Error('Invalid fragment frame header')
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8)
    const idLength = view.getUint32(0, true)
    const payloadLength = view.getUint32(4, true)
    const frameLength = 8 + idLength + payloadLength
    if (offset + frameLength > bytes.byteLength) {
      throw new Error('Invalid fragment frame payload')
    }
    const idBytes = bytes.slice(offset + 8, offset + 8 + idLength)
    const payloadBytes = bytes.slice(offset + 8 + idLength, offset + frameLength)
    frames.push({
      id: decoder.decode(idBytes),
      payloadBytes
    })
    offset += frameLength
  }

  return frames
}
