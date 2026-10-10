import { Router, type Request, type Response } from 'express';
import { PrintKitchenOrder } from '../../../application/use-cases/printKitchenOrder.js';
import { OrderOperationError } from '../../../domain/errors/OrderOperationError.js';

export function createKitchenPrintRoutes(
    printKitchenOrder: PrintKitchenOrder
): Router {
    const router = Router();

    router.post('/orders/:tableId/print', async (request: Request, response: Response) => {
        try {
            await printKitchenOrder.execute(request.params.tableId);
            response.status(204).end();
        } catch (error) {
            if (error instanceof OrderOperationError && error.code === 'ORDER_NOT_FOUND') {
                response.status(404).json({ message: error.message });
                return;
            }
            const message = error instanceof Error ? error.message : 'Error inesperado';
            response.status(500).json({ message });
        }
    });

    return router;
}
