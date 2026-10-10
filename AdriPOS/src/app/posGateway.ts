import type { AccountingGateway, PosGateway } from '../application/ports/PosGateway'
import {
  cancelOrder,
  getActiveOrder,
  getKitchenTickets,
  getAccountingMovementDetails,
  getAccountingDeliverySalesSummary,
  getAccountingMovementTypes,
  getAccountingPaymentAccounts,
  getAccountingSummary,
  getProductCategories,
  getTables,
  payOrder,
  printKitchenOrder,
  removeOrderItem,
  setKitchenItemStatus,
  recordAccountingMovement,
  syncAccountingSales,
  updateAccountingMovement,
  updateOrderItemNotes,
} from '../infrastructure/http/posApi'
import { moveOrder, sendOrder } from '../infrastructure/realtime/orderSocket'
import { authSocket, requestLogin } from '../infrastructure/realtime/authSocket'

export const posGateway: PosGateway & AccountingGateway = {
  requestLogin,
  isRealtimeConnected: () => authSocket.connected,
  onRealtimeConnectionChanged: (handler) => {
    const handleConnect = (): void => handler(true)
    const handleDisconnect = (): void => handler(false)
    authSocket.on('connect', handleConnect)
    authSocket.on('disconnect', handleDisconnect)
    return () => {
      authSocket.off('connect', handleConnect)
      authSocket.off('disconnect', handleDisconnect)
    }
  },
  connectRealtime: () => authSocket.connect(),
  onKitchenItemUpdated: (handler) => {
    authSocket.on('kitchen:item:updated', handler)
    return () => authSocket.off('kitchen:item:updated', handler)
  },
  onOrderChanged: (handler) => {
    authSocket.on('order:changed', handler)
    return () => authSocket.off('order:changed', handler)
  },
  getTables,
  getProductCategories,
  getActiveOrder,
  sendOrder,
  moveOrder,
  payOrder,
  updateOrderItemNotes,
  removeOrderItem,
  cancelOrder,
  printKitchenOrder,
  getKitchenTickets,
  setKitchenItemStatus,
  getAccountingPaymentAccounts,
  getAccountingMovementTypes,
  getAccountingSummary,
  getAccountingMovementDetails,
  getAccountingDeliverySalesSummary,
  recordAccountingMovement,
  syncAccountingSales,
  updateAccountingMovement,
}
