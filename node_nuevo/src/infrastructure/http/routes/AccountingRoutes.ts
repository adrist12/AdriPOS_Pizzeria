import { Router, type Request, type Response } from 'express';
import { AccountingUseCases } from '../../../application/use-cases/accounting.js';
import { OrderOperationError } from '../../../domain/errors/OrderOperationError.js';

export function createAccountingRoutes(accounting: AccountingUseCases): Router {
    const router = Router();

    router.get('/accounting/payment-accounts', async (_request: Request, response: Response) => {
        try {
            response.json(await accounting.getPaymentAccounts());
        } catch (error) {
            respondAccountingError(error, response);
        }
    });

    router.get('/accounting/movement-types', async (_request: Request, response: Response) => {
        try {
            response.json(await accounting.getMovementTypes());
        } catch (error) {
            respondAccountingError(error, response);
        }
    });

    router.get('/accounting/summary', async (request: Request, response: Response) => {
        try {
            response.json(await accounting.getMonthlySummary(
                request.query.month,
                request.query.year
            ));
        } catch (error) {
            respondAccountingError(error, response);
        }
    });

    router.get('/accounting/movements', async (request: Request, response: Response) => {
        try {
            response.json(await accounting.getMovementDetails(
                request.query.month,
                request.query.year
            ));
        } catch (error) {
            respondAccountingError(error, response);
        }
    });

    router.get('/accounting/delivery-sales', async (request: Request, response: Response) => {
        try {
            response.json(await accounting.getDeliverySalesSummary(
                request.query.month,
                request.query.year
            ));
        } catch (error) {
            respondAccountingError(error, response);
        }
    });

    router.post('/accounting/movements', async (request: Request, response: Response) => {
        try {
            await accounting.recordManualMovement({
                typeId: request.body?.typeId,
                cashAccountId: request.body?.cashAccountId,
                concept: request.body?.concept,
                amount: request.body?.amount,
                date: request.body?.date
            });
            response.status(201).json({ message: 'Movimiento registrado.' });
        } catch (error) {
            respondAccountingError(error, response);
        }
    });

    router.put('/accounting/movements/:movementId', async (request: Request, response: Response) => {
        try {
            await accounting.updateMovement({
                id: request.params.movementId,
                typeId: request.body?.typeId,
                cashAccountId: request.body?.cashAccountId,
                concept: request.body?.concept,
                amount: request.body?.amount,
                date: request.body?.date,
                password: request.body?.password
            });
            response.status(200).json({ message: 'Movimiento actualizado.' });
        } catch (error) {
            respondAccountingError(error, response);
        }
    });

    router.post('/accounting/sync-unicenta', async (request: Request, response: Response) => {
        try {
            const result = await accounting.syncUniCentaSales({
                startDate: request.body?.startDate,
                endDate: request.body?.endDate
            });
            response.status(200).json(result);
        } catch (error) {
            respondAccountingError(error, response);
        }
    });

    return router;
}

function respondAccountingError(error: unknown, response: Response): void {
    if (error instanceof OrderOperationError && error.code === 'INVALID_ACCOUNTING') {
        response.status(400).json({ message: error.message });
        return;
    }
    if (error instanceof OrderOperationError && error.code === 'ORDER_NOT_FOUND') {
        response.status(404).json({ message: error.message });
        return;
    }
    if (error instanceof OrderOperationError && error.code === 'ACCOUNTING_SCHEMA_UNAVAILABLE') {
        response.status(503).json({ message: error.message });
        return;
    }
    if (error instanceof OrderOperationError) {
        response.status(409).json({ message: error.message });
        return;
    }
    console.error('[ACCOUNTING] Error procesando solicitud contable.', error);
    response.status(500).json({ message: 'No se pudo completar la operación contable.' });
}
