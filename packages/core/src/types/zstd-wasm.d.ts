declare module '@bokuweb/zstd-wasm' {
  export function init(path?: string): Promise<void>
  export function compress(input: Uint8Array, level?: number): Uint8Array
  export function decompress(input: Uint8Array): Uint8Array
}
