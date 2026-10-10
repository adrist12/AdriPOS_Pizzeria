import { Request, Response } from 'express';
import { CreateOrderUseCase } from '../../application/use-cases/createOrder.js';
import { Order } from '../../domain/entities/Order.js';

export class OrderController {
    constructor(private readonly createOrderUseCase: CreateOrderUseCase) { }

    async createOrder(req: Request, res: Response): Promise<void> {
        try {
            // 1. Extrae los datos necesarios de req.body

            const { orderId, tableId, waiterName, createdAt, items, waiterId, delivery } = req.body;

            // 2. Ejecuta this.createOrderUseCase.execute(...)

            const response = await this.createOrderUseCase.execute(new Order({
                orderId,
                tableId,
                waiterName,
                createdAt: new Date(createdAt),
                items,
                waiterId,
                delivery
            }));

            // 3. Devuelve res.status(201).json(...) con el resultado}

            res.status(201).json({ success: true, data: response })
        } catch (error) {
            // 4. Maneja el error y devuelve res.status(400).json({ error: error.message })
            res.status(400).json({
                success: false,
                message: error instanceof Error ? error.message : 'Error desconocido'
            });
        }
    }
}