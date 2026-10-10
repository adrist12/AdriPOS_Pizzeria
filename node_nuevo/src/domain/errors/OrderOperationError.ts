export type OrderOperationErrorCode =
    | 'ORDER_NOT_FOUND'
    | 'ITEM_NOT_FOUND'
    | 'NOTE_EDIT_WINDOW_EXPIRED'
    | 'NOTE_EDIT_UNAVAILABLE'
    | 'TABLE_NOT_FOUND'
    | 'TARGET_OCCUPIED'
    | 'MOVE_INCOMPATIBLE'
    | 'MOVE_INCONSISTENT'
    | 'INVALID_PAYMENT'
    | 'NO_OPEN_CASH'
    | 'TICKET_NUMBER_UNAVAILABLE'
    | 'PRODUCT_NOT_FOUND'
    | 'INVALID_ACCOUNTING'
    | 'ACCOUNTING_SCHEMA_UNAVAILABLE';

export class OrderOperationError extends Error {
    constructor(
        message: string,
        public readonly code: OrderOperationErrorCode
    ) {
        super(message);
        this.name = 'OrderOperationError';
    }
}
