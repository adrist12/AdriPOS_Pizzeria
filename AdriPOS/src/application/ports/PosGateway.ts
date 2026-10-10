import type {
  ActiveOrder,
  KitchenItemUpdate,
  KitchenTicket,
  KitchenPrintRequest,
  MoveOrderRequest,
  OrderToSend,
  PayOrderRequest,
  PayOrderResult,
  PosTable,
  ProductCategory,
} from '../../domain/pos/types'
import type { LoginCredentials, LoginResponse } from '../../domain/auth/types'
import type {
  AccountingCashDetail,
  AccountingDeliverySalesSummary,
  AccountingMovementType,
  AccountingPaymentAccount,
  AccountingSummary,
  AccountingSyncResult,
  ManualAccountingMovement,
  UpdateAccountingMovement,
} from '../../domain/accounting/types'

export interface PosGateway {
  requestLogin(credentials: LoginCredentials): Promise<LoginResponse>
  isRealtimeConnected(): boolean
  onRealtimeConnectionChanged(handler: (connected: boolean) => void): () => void
  connectRealtime(): void
  onKitchenItemUpdated(handler: (event: KitchenItemUpdate) => void): () => void
  onOrderChanged(handler: (event: { tableId: string }) => void): () => void
  getTables(): Promise<PosTable[]>
  getProductCategories(): Promise<ProductCategory[]>
  getActiveOrder(tableId: string): Promise<ActiveOrder | null>
  sendOrder(order: OrderToSend): Promise<void>
  moveOrder(order: MoveOrderRequest): Promise<void>
  payOrder(tableId: string, request: PayOrderRequest): Promise<PayOrderResult>
  updateOrderItemNotes(tableId: string, lineId: string, notes: string): Promise<void>
  removeOrderItem(tableId: string, lineId: string): Promise<void>
  cancelOrder(tableId: string): Promise<void>
  printKitchenOrder(request: KitchenPrintRequest): Promise<void>
  getKitchenTickets(station: string): Promise<KitchenTicket[]>
  setKitchenItemStatus(
    ticketId: string,
    itemId: string,
    status: 'PENDING' | 'READY',
  ): Promise<unknown>
}

export interface AccountingGateway {
  getAccountingPaymentAccounts(): Promise<AccountingPaymentAccount[]>
  getAccountingMovementTypes(): Promise<AccountingMovementType[]>
  getAccountingSummary(month: number, year: number): Promise<AccountingSummary>
  getAccountingMovementDetails(
    month: number,
    year: number,
  ): Promise<Record<string, AccountingCashDetail>>
  getAccountingDeliverySalesSummary(
    month: number,
    year: number,
  ): Promise<AccountingDeliverySalesSummary>
  recordAccountingMovement(movement: ManualAccountingMovement): Promise<void>
  updateAccountingMovement(movementId: number, movement: UpdateAccountingMovement): Promise<void>
  syncAccountingSales(startDate: string, endDate: string): Promise<AccountingSyncResult>
}
