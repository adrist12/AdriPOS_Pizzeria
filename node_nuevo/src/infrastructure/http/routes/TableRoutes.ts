import { Router, type Request, type Response } from 'express';
import type { ITableRepository } from '../../../domain/repositories/ITableRepository.js';

export function createTableRoutes(tableRepository: ITableRepository): Router {
    const router = Router();

    router.get('/tables', async (_request: Request, response: Response) => {
        try {
            const tables = await tableRepository.findAll();
            response.json(tables.map((table) => ({
                id: table.tableId,
                name: table.tableName,
                floorId: table.floorId,
                waiterName: table.waiterName ?? null,
                ticketId: table.ticketId ?? null,
                occupied: table.occupied ?? null
            })));
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Error inesperado';
            response.status(500).json({ message });
        }
    });

    return router;
}
