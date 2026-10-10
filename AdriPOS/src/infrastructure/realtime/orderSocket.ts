import { authSocket } from './authSocket'
import type { MoveOrderRequest, OrderToSend } from '../../domain/pos/types'

const ORDER_TIMEOUT_MS = 20_000

export function sendOrder(order: OrderToSend): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      window.clearTimeout(timeoutId)
      authSocket.off('order:sent', handleSent)
      authSocket.off('seat:error', handleError)
    }

    const handleSent = (event: { requestId?: string }): void => {
      if (event.requestId !== order.requestId) return
      cleanup()
      resolve()
    }

    const handleError = (event: { requestId?: string; message: string }): void => {
      if (event.requestId !== order.requestId) return
      cleanup()
      reject(new Error(event.message))
    }

    const timeoutId = window.setTimeout(() => {
      cleanup()
      reject(new Error('No llegó la confirmación del servidor. Revisa el pedido antes de volver a enviarlo.'))
    }, ORDER_TIMEOUT_MS)

    authSocket.on('order:sent', handleSent)
    authSocket.on('seat:error', handleError)
    authSocket.emit('order:send', order)
  })
}

export function moveOrder(order: MoveOrderRequest): Promise<void> {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`

  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      window.clearTimeout(timeoutId)
      authSocket.off('order:moved', handleMoved)
      authSocket.off('seat:error', handleError)
    }

    const handleMoved = (event: { requestId?: string }): void => {
      if (event.requestId !== requestId) return
      cleanup()
      resolve()
    }

    const handleError = (event: { requestId?: string; message: string }): void => {
      if (event.requestId !== requestId) return
      cleanup()
      reject(new Error(event.message))
    }

    const timeoutId = window.setTimeout(() => {
      cleanup()
      reject(new Error(
        'No llegó la confirmación del servidor. Actualiza la lista de puestos antes de volver a mover la orden.',
      ))
    }, ORDER_TIMEOUT_MS)

    authSocket.on('order:moved', handleMoved)
    authSocket.on('seat:error', handleError)
    authSocket.emit('order:moveOrder', { ...order, requestId })
  })
}
