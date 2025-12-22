const fail = () => {
  throw new Error('node:module is not available in the browser runtime.')
}

type RequireFn = (id: string) => never

export const createRequire = (_url: string | URL): RequireFn => {
  return () => fail()
}
