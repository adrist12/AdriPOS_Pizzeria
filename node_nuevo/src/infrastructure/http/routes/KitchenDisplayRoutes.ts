import { Router, type Request, type Response } from 'express';
import type { Server } from 'socket.io';
import { ItemStatus, KitchenStation } from '../../../domain/entities/kitchenEnums.js';
import type { IKitchenRepository } from '../../../domain/repositories/IKitchenTicketRepository.js';

export function createKitchenDisplayRoutes(
    kitchenRepository: IKitchenRepository,
    io: Server
): Router {
    const router = Router();

    router.get('/kitchen', async (request: Request, response: Response) => {
        const station = request.query.station;
        if (
            typeof station !== 'string' ||
            !Object.values(KitchenStation).includes(station as KitchenStation)
        ) {
            response.status(400).json({ message: 'La estación de cocina no es válida.' });
            return;
        }

        try {
            const tickets = await kitchenRepository.findActiveByStation(station as KitchenStation);
            response.json((tickets ?? []).map((ticket) => ({
                ticketId: ticket.ticketId,
                tableId: ticket.TableId,
                tableName: ticket.tableName,
                waiterName: ticket.waiterName,
                status: ticket.Status,
                createdAt: ticket.createdAt,
                items: ticket.Items.map((item) => ({
                    itemId: item.itemId,
                    name: item.itemName,
                    quantity: item.quantity,
                    status: item.status,
                    notes: item.notes,
                    createdAt: item.createdAt
                }))
            })));
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Error inesperado';
            response.status(500).json({ message });
        }
    });

    router.patch(
        '/kitchen/:ticketId/items/:itemId',
        async (request: Request, response: Response) => {
            const status = request.body?.status;
            if (status !== ItemStatus.PENDING && status !== ItemStatus.READY) {
                response.status(400).json({ message: 'El estado solicitado no es válido.' });
                return;
            }

            try {
                await kitchenRepository.updateItemStatus(
                    request.params.ticketId,
                    request.params.itemId,
                    status
                );
                const update = {
                    ticketId: request.params.ticketId,
                    itemId: request.params.itemId,
                    status
                };
                io.emit('kitchen:item:updated', update);
                response.json(update);
            } catch (error) {
                if (error instanceof Error && error.message.startsWith('No existe el ítem')) {
                    response.status(404).json({ message: error.message });
                    return;
                }
                const message = error instanceof Error ? error.message : 'Error inesperado';
                response.status(500).json({ message });
            }
        }
    );

    return router;
}
