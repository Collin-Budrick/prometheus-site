export const fragmentResponseEncodings = ['br', 'gzip', 'deflate', 'zstd'] as const
export type FragmentCompressionEncoding = (typeof fragmentResponseEncodings)[number]

export const nativeFragmentResponseEncodings = ['br', 'gzip', 'deflate'] as const
export type NativeFragmentCompressionEncoding = (typeof nativeFragmentResponseEncodings)[number]

const getDecompressionStreamCtor = () =>
  (globalThis as typeof globalThis & {
    DecompressionStream?: new (
      format: NativeFragmentCompressionEncoding
    ) => TransformStream<Uint8Array, Uint8Array>
  }).DecompressionStream ?? null

export const getFragmentResponseEncoding = (headers: Headers): FragmentCompressionEncoding | null => {
  const raw =
    headers.get('x-fragment-content-encoding')?.trim().toLowerCase() ??
    headers.get('content-encoding')?.trim().toLowerCase()
  if (!raw) return null
  return fragmentResponseEncodings.find((encoding) => raw.includes(encoding)) ?? null
}

export const getSupportedNativeFragmentDecompressionEncodings = () => {
  const ctor = getDecompressionStreamCtor()
  if (!ctor) {
    return []
  }

  const supported: NativeFragmentCompressionEncoding[] = []
  for (const encoding of nativeFragmentResponseEncodings) {
    try {
      new ctor(encoding)
      supported.push(encoding)
    } catch {
      // Ignore unsupported encodings in the current runtime.
    }
  }
  return supported
}

const readStreamBytes = async (stream: ReadableStream<Uint8Array>) => {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    if (!value?.byteLength) continue
    chunks.push(value)
    total += value.byteLength
  }

  const output = new Uint8Array(total)
  let offset = 0
  chunks.forEach((chunk) => {
    output.set(chunk, offset)
    offset += chunk.byteLength
  })
  return output
}

export const decompressFragmentBytesWithNativeStream = async (
  bytes: Uint8Array,
  encoding: NativeFragmentCompressionEncoding
) => {
  const ctor = getDecompressionStreamCtor()
  if (!ctor) return null
  try {
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes)
        controller.close()
      }
    })
    const transform = new ctor(encoding) as unknown as TransformStream<Uint8Array, Uint8Array>
    return await readStreamBytes(source.pipeThrough(transform))
  } catch {
    return null
  }
}

export const buildFragmentDecompressionReader = (
  stream: ReadableStream<Uint8Array>,
  encoding: FragmentCompressionEncoding | null,
  enableDecompression: boolean
) => {
  if (!encoding || !enableDecompression || encoding === 'zstd') {
    return stream.getReader()
  }
  const ctor = getDecompressionStreamCtor()
  if (!ctor) {
    return stream.getReader()
  }
  try {
    const transform = new ctor(encoding) as unknown as TransformStream<Uint8Array, Uint8Array>
    return stream.pipeThrough(transform).getReader()
  } catch {
    return stream.getReader()
  }
}
