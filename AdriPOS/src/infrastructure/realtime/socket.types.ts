import type { LoginCredentials, LoginFailure, LoginResponse } from '../../domain/auth/types'
import type { KitchenItemUpdate, MoveOrderRequest, OrderToSend } from '../../domain/pos/types'

export interface ServerToClientEvents {
  'auth:login:success': (response: LoginResponse) => void
  'auth:login:error': (error: LoginFailure) => void
  'order:sent': (event: {
    tableId: string
    status: 'SENT'
    updatedBy: string
    requestId?: string
  }) => void
  'order:updated': (event: {
    tableId: string
    status: 'UPDATED'
    updatedBy: string
    requestId?: string
  }) => void
  'order:moved': (event: {
    currentTableId: string
    newTableId: string
    status: 'MOVED'
    requestId?: string
  }) => void
  'seat:error': (error: LoginFailure & { requestId?: string }) => void
  'kitchen:item:updated': (event: KitchenItemUpdate) => void
  'order:changed': (event: { tableId: string; action: string }) => void
}

export interface ClientToServerEvents {
  'auth:login': (credentials: LoginCredentials) => void
  'order:send': (order: OrderToSend) => void
  'order:moveOrder': (order: MoveOrderRequest & { requestId: string }) => void
}
