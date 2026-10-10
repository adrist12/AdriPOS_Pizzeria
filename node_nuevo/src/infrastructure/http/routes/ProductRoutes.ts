import { Router, type Request, type Response } from 'express';
import type { GetProductCategories } from '../../../application/use-cases/getProductCategories.js';

export function createProductRoutes(getProductCategories: GetProductCategories): Router {
    const router = Router();

    router.get('/products', async (_request: Request, response: Response) => {
        try {
            response.json(await getProductCategories.execute());
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Error inesperado';
            response.status(500).json({ message });
        }
    });

    return router;
}
