const wasmBytes = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d,
  0x01, 0x00, 0x00, 0x00,
  0x01, 0x07, 0x01, 0x60, 0x02, 0x7f, 0x7f, 0x01, 0x7f,
  0x03, 0x02, 0x01, 0x00,
  0x07, 0x07, 0x01, 0x03, 0x61, 0x64, 0x64, 0x00, 0x00,
  0x0a, 0x09, 0x01, 0x07, 0x00, 0x20, 0x00, 0x20, 0x01, 0x6a, 0x0b
])

let wasmAdd: ((a: number, b: number) => number) | null = null

const isWasmAddExport = (value: WebAssembly.ExportValue): value is (a: number, b: number) => unknown =>
  typeof value === 'function'

export const loadWasmAdd = async () => {
  if (wasmAdd) return wasmAdd
  const module = await WebAssembly.compile(wasmBytes)
  const instance = await WebAssembly.instantiate(module)
  const addExport = instance.exports.add
  if (!isWasmAddExport(addExport)) {
    throw new Error('WASM add export missing')
  }
  const add = (a: number, b: number) => {
    const result = addExport(a, b)
    if (typeof result !== 'number') {
      throw new Error('WASM add export returned non-number')
    }
    return result
  }
  wasmAdd = add
  return add
}

