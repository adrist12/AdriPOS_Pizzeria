import type { LoginResponse } from '../../domain/auth/types'

const SESSION_STORAGE_KEY = 'adripos.auth.session'

function isLoginResponse(value: unknown): value is LoginResponse {
  if (typeof value !== 'object' || value === null) return false
  const session = value as Partial<LoginResponse>
  const user = session.user
  return (
    typeof session.token === 'string' &&
    session.token.length > 0 &&
    typeof session.expiresAt === 'number' &&
    Number.isFinite(session.expiresAt) &&
    typeof user === 'object' &&
    user !== null &&
    typeof user.id === 'string' &&
    typeof user.name === 'string' &&
    typeof user.roleId === 'string'
  )
}

export function saveLoginSession(session: LoginResponse): void {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

export function loadLoginSession(): LoginResponse | null {
  const storedSession = localStorage.getItem(SESSION_STORAGE_KEY)
  if (!storedSession) return null

  try {
    const parsed: unknown = JSON.parse(storedSession)
    if (isLoginResponse(parsed) && parsed.expiresAt > Date.now()) {
      return parsed
    }
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY)
    return null
  }

  localStorage.removeItem(SESSION_STORAGE_KEY)
  return null
}

export function clearLoginSession(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY)
}
