import {Order} from '../entities/Order.js'

export type UniCentaPaymentMethod = 'cash' | 'bank';

export interface PaidOrderResult {
  receiptId: string;
  ticketCode: string;
  paymentMethod: UniCentaPaymentMethod;
  productSubtotal: number;
  deliveryFee: number;
  customerTotal: number;
  amountReceived: number;
  change: number;
}

export interface IOrderRepository {
  /**
   * Guarda o actualiza una comanda en unicentaPOS
   * Debe manejar transacciones para garantizar atomicidad en MySQL/MariaDB
   */
  save(order: Order): Promise<void>;
  
  /**
   * Obtiene la comanda activa de una mesa
   */
  findByTableId(tableId: string): Promise<Order | null>;
  moveActiveOrder(currentTableId: string, newTableId: string): Promise<void>;
  payActiveOrder(
    tableId: string,
    paymentMethod: UniCentaPaymentMethod,
    amountReceived: number
  ): Promise<PaidOrderResult>;
  /**
   * Borra la comanda activa de una mesa
   */
  deleteByTableId(tableId: string): Promise<void>;
  cancelActiveByTableId(tableId: string): Promise<void>;
  removeItemByTableId(tableId: string, lineId: string): Promise<void>;
  updateItemNotesByTableId(tableId: string, lineId: string, notes: string): Promise<void>;
  findItemCreatedAt(tableId: string, lineId: string): Promise<Date | null>;
}