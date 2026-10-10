import { io, type Socket } from 'socket.io-client'
import type { LoginCredentials, LoginFailure, LoginResponse } from '../../domain/auth/types'
import type { ClientToServerEvents, ServerToClientEvents } from './socket.types'
import { resolveServiceUrl } from '../http/serviceUrl'

const socketUrl = resolveServiceUrl(
  import.meta.env.VITE_SOCKET_URL,
  'http://localhost:3001',
  import.meta.env.PROD,
)

export const authSocket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  socketUrl,
  {
    autoConnect: false,
    transports: ['websocket', 'polling'],
  },
)

export function setSocketToken(token: string | null): void {
  if (token) {
    authSocket.auth = { token }
    return
  }

  authSocket.disconnect()
  authSocket.auth = {}
}

const LOGIN_TIMEOUT_MS = 12_000

export function requestLogin(credentials: LoginCredentials): Promise<LoginResponse> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      window.clearTimeout(timeoutId)
      authSocket.off('connect', sendCredentials)
      authSocket.off('auth:login:success', handleSuccess)
      authSocket.off('auth:login:error', handleFailure)
    }

    const handleSuccess = (response: LoginResponse): void => {
      cleanup()
      resolve(response)
    }

    const handleFailure = (failure: LoginFailure): void => {
      cleanup()
      reject(new Error(failure.message))
    }

    const sendCredentials = (): void => {
      authSocket.emit('auth:login', credentials)
    }

    const timeoutId = window.setTimeout(() => {
      cleanup()
      reject(new Error('El servidor no respondió a tiempo. Inténtalo de nuevo.'))
    }, LOGIN_TIMEOUT_MS)

    authSocket.once('auth:login:success', handleSuccess)
    authSocket.once('auth:login:error', handleFailure)

    if (authSocket.connected) {
      sendCredentials()
      return
    }

    authSocket.once('connect', sendCredentials)
    authSocket.connect()
  })
}
