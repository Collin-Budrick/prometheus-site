export type AuthSessionPayload = {
  session?: {
    userId?: string
  }
  user?: {
    id?: string
    name?: string | null
    email?: string | null
    image?: string | null
  }
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null

const readString = (value: unknown) => (typeof value === 'string' ? value : undefined)

const readNullableString = (value: unknown) => {
  if (value === null) return null
  return typeof value === 'string' ? value : undefined
}

export const normalizeAuthSessionPayload = (value: unknown): AuthSessionPayload => {
  const payload = asRecord(value)
  const session = asRecord(payload?.session)
  const user = asRecord(payload?.user)

  return {
    ...(session
      ? {
          session: {
            userId: readString(session.userId)
          }
        }
      : {}),
    ...(user
      ? {
          user: {
            id: readString(user.id),
            name: readNullableString(user.name),
            email: readNullableString(user.email),
            image: readNullableString(user.image)
          }
        }
      : {})
  }
}
