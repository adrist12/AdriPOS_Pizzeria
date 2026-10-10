import { OrderOperationError } from '../../domain/errors/OrderOperationError.js';
import type { IOrderRepository } from '../../domain/repositories/IOrderRepository.js';
import type { ITableRepository } from '../../domain/repositories/ITableRepository.js';
import type {
    IKitchenOrderPrinter,
    KitchenPrintOrder
} from '../../domain/services/IKitchenOrderPrinter.js';

export class PrintKitchenOrder {
    constructor(
        private readonly orderRepository: IOrderRepository,
        private readonly tableRepository: ITableRepository,
        private readonly printer: IKitchenOrderPrinter
    ) { }

    async execute(tableId: string): Promise<void> {
        const order = await this.orderRepository.findByTableId(tableId);
        if (!order) {
            throw new OrderOperationError(
                'No hay una comanda activa para imprimir en este puesto.',
                'ORDER_NOT_FOUND'
            );
        }

        const place = (await this.tableRepository.findAll())
            .find((table) => table.tableId === tableId);
        if (!place) {
            throw new Error(`No se encontró el puesto ${tableId} para imprimir la comanda.`);
        }

        const printOrder: KitchenPrintOrder = {
            tableName: place.tableName,
            waiterName: order.waiterName,
            createdAt: order.createdAt.toISOString(),
            customerName: order.Delivery?.customerName ?? null,
            customerPhone: order.Delivery?.phone ?? null,
            deliveryAddress: order.Delivery?.address ?? null,
            deliveryFee: order.Delivery?.deliveryFee ?? 0,
            items: order.Items.map((item) => ({
                productName: item.productName,
                quantity: item.quantity,
                unitPrice: item.price,
                notes: item.notes?.trim() || undefined,
                takeaway: Boolean(item.takeaway)
            }))
        };

        await this.printer.print(printOrder);
    }
}
