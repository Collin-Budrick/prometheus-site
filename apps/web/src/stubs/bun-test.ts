type ExpectShape = {
  toBe: (..._args: unknown[]) => void
  toEqual: (..._args: unknown[]) => void
  toMatch: (..._args: unknown[]) => void
  toContain: (..._args: unknown[]) => void
  toThrow: (..._args: unknown[]) => void
}

export const describe = (_name: string, _fn: () => void) => {}
export const it = (_name: string, _fn: () => void) => {}
export const expect = (_value: unknown): ExpectShape => {
  const noop = () => {}
  return {
    toBe: noop,
    toEqual: noop,
    toMatch: noop,
    toContain: noop,
    toThrow: noop
  }
}

