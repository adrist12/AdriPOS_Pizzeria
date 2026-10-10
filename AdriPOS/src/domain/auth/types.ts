export interface LoginCredentials {
  name: string
  password: string
}

export interface AuthenticatedUser {
  id: string
  name: string
  roleId: string
}

export interface LoginResponse {
  token: string
  expiresAt: number
  user: AuthenticatedUser
}

export interface LoginFailure {
  message: string
}
