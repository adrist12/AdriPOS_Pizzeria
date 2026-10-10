import type { Order } from '../../../domain/entities/Order.js';

export function buildJavaTicketPayload(order: Order): Record<string, unknown> {
    return {
        tableId: order.TableId,
        waiterName: order.waiterName,
        createdAt: order.createdAt.toISOString(),
        items: order.Items.map((item) => ({
            lineId: item.lineId,
            productId: item.productId,
            productName: item.productName,
            price: item.price,
            quantity: item.quantity,
            notes: item.notes || null,
            takeaway: Boolean(item.takeaway),
            taxes: item.taxes
        })),
        waiterId: order.waiterId
    };
}
