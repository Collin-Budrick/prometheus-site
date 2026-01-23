import type { ValidateSessionHandler } from '@features/auth/server'
import { isRecord } from '../utils'
import type { SessionUser } from '../types'

export const parseSessionPayload = async (response: Response): Promise<SessionUser | null> => {
  const payload: unknown = await response.json()
  if (!isRecord(payload)) return null
  const userValue = payload.user
  const sessionValue = payload.session
  const userRecord = isRecord(userValue) ? userValue : {}
  const sessionRecord = isRecord(sessionValue) ? sessionValue : {}

  const userId =
    typeof userRecord.id === 'string'
      ? userRecord.id
      : typeof sessionRecord.userId === 'string'
        ? sessionRecord.userId
        : null
  if (!userId) return null
  const name = typeof userRecord.name === 'string' ? userRecord.name : undefined
  const email = typeof userRecord.email === 'string' ? userRecord.email : undefined
  return { id: userId, name, email }
}

export const createSessionResolver = (validateSession: ValidateSessionHandler) => async (request: Request) => {
  try {
    const response = await validateSession({ request })
    if (!response.ok) return null
    return await parseSessionPayload(response)
  } catch (error) {
    console.error('Failed to validate contact invite session', error)
    return null
  }
}
