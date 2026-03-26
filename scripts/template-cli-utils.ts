export const readArgMap = (args = process.argv.slice(2)) => {
  const values = new Map<string, string | boolean>()
  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index]
    if (!raw.startsWith('--')) continue
    const key = raw.slice(2)
    const next = args[index + 1]
    if (!next || next.startsWith('--')) {
      values.set(key, true)
      continue
    }
    values.set(key, next)
    index += 1
  }
  return values
}

export const toStringArg = (value: string | boolean | undefined) => (typeof value === 'string' ? value.trim() : '')

export const toListArg = (value: string | boolean | undefined) =>
  toStringArg(value)
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean)

export const hasFlag = (argMap: Map<string, string | boolean>, key: string) => argMap.get(key) === true
