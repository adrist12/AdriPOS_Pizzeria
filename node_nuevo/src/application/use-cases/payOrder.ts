import { OrderOperationError } from '../../domain/errors/OrderOperationError.js';
import type {
    IOrderRepository,
    PaidOrderResult,
    UniCentaPaymentMethod
} from '../../domain/repositories/IOrderRepository.js';

export interface PayOrderRequest {
    paymentMethod: UniCentaPaymentMethod;
    amountReceived: number;
}

export class PayOrderUseCase {
    constructor(private readonly orderRepository: IOrderRepository) { }

    async execute(tableId: string, request: PayOrderRequest): Promise<PaidOrderResult> {
        if (!tableId.trim()) {
            throw new OrderOperationError('El puesto es obligatorio.', 'INVALID_PAYMENT');
        }
        if (request.paymentMethod !== 'cash' && request.paymentMethod !== 'bank') {
            throw new OrderOperationError('Selecciona efectivo o Nequi.', 'INVALID_PAYMENT');
        }
        if (
            !Number.isFinite(request.amountReceived) ||
            request.amountReceived < 0 ||
            !Number.isInteger(request.amountReceived)
        ) {
            throw new OrderOperationError(
                'El valor recibido debe ser un número entero válido.',
                'INVALID_PAYMENT'
            );
        }

        return this.orderRepository.payActiveOrder(
            tableId,
            request.paymentMethod,
            request.amountReceived
        );
    }
}
