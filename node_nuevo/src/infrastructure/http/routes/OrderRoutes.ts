import { Router, type Request, type Response } from 'express';
import type { Server } from 'socket.io';
import type { IOrderRepository } from '../../../domain/repositories/IOrderRepository.js';
import { OrderOperationError } from '../../../domain/errors/OrderOperationError.js';
import { PayOrderUseCase } from '../../../application/use-cases/payOrder.js';

export function createOrderRoutes(
    orderRepository: IOrderRepository,
    io: Server,
    payOrderUseCase: PayOrderUseCase
): Router {
    const router = Router();

    router.get('/orders/:tableId', async (request: Request, response: Response) => {
        try {
            const order = await orderRepository.findByTableId(request.params.tableId);
            if (!order) {
                response.json(null);
                return;
            }

            response.json({
                orderId: order.orderId ?? null,
                tableId: order.TableId,
                waiterName: order.waiterName,
                waiterId: order.waiterId,
                createdAt: order.createdAt,
                items: await Promise.all(order.Items.map(async (item) => ({
                    ...item,
                    createdAt: (
                        await orderRepository.findItemCreatedAt(
                            request.params.tableId,
                            item.lineId ?? item.productId
                        )
                    )?.toISOString()
                }))),
                delivery: order.Delivery ?? null
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Error inesperado';
            response.status(500).json({ message });
        }
    });

    router.patch(
        '/orders/:tableId/items/:lineId/notes',
        async (request: Request, response: Response) => {
            const notes = request.body?.notes;
            if (typeof notes !== 'string' || Array.from(notes).length > 255) {
                response.status(400).json({ message: 'La nota debe ser texto de hasta 255 caracteres.' });
                return;
            }

            try {
                await orderRepository.updateItemNotesByTableId(
                    request.params.tableId,
                    request.params.lineId,
                    notes
                );
                io.emit('order:changed', {
                    tableId: request.params.tableId,
                    action: 'NOTE_UPDATED'
                });
                response.status(204).end();
            } catch (error) {
                respondOrderOperationError(error, response);
            }
        }
    );

    router.delete(
        '/orders/:tableId/items/:lineId',
        async (request: Request, response: Response) => {
            try {
                await orderRepository.removeItemByTableId(
                    request.params.tableId,
                    request.params.lineId
                );
                io.emit('order:changed', {
                    tableId: request.params.tableId,
                    action: 'ITEM_REMOVED'
                });
                response.status(204).end();
            } catch (error) {
                respondOrderOperationError(error, response);
            }
        }
    );

    router.delete('/orders/:tableId', async (request: Request, response: Response) => {
        try {
            await orderRepository.cancelActiveByTableId(request.params.tableId);
            io.emit('order:changed', {
                tableId: request.params.tableId,
                action: 'CANCELLED'
            });
            response.status(204).end();
        } catch (error) {
            respondOrderOperationError(error, response);
        }
    });

    router.post('/orders/:tableId/pay', async (request: Request, response: Response) => {
        const paymentMethod = request.body?.paymentMethod;
        const amountReceived = request.body?.amountReceived;
        if (
            (paymentMethod !== 'cash' && paymentMethod !== 'bank') ||
            typeof amountReceived !== 'number'
        ) {
            response.status(400).json({
                message: 'Indica el método de pago (cash o bank) y el valor recibido.'
            });
            return;
        }

        try {
            const result = await payOrderUseCase.execute(request.params.tableId, {
                paymentMethod,
                amountReceived
            });
            io.emit('order:changed', {
                tableId: request.params.tableId,
                action: 'PAID'
            });
            response.status(201).json(result);
        } catch (error) {
            if (!(error instanceof OrderOperationError)) {
                console.error(
                    `[ORDER_PAYMENT] No se pudo cobrar el puesto ${request.params.tableId}.`,
                    error
                );
            }
            respondOrderOperationError(error, response);
        }
    });

    return router;
}

function respondOrderOperationError(error: unknown, response: Response): void {
    if (error instanceof OrderOperationError) {
        const status = error.code === 'ORDER_NOT_FOUND' || error.code === 'ITEM_NOT_FOUND'
            ? 404
            : error.code === 'INVALID_PAYMENT'
                ? 400
                : 409;
        response.status(status).json({ message: error.message });
        return;
    }

    const message = error instanceof Error ? error.message : 'Error inesperado';
    response.status(500).json({ message });
}
