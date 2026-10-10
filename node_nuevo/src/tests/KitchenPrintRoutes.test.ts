import assert from 'node:assert/strict';
import { createServer, type Server as HttpServer } from 'node:http';
import test from 'node:test';
import express from 'express';
import { PrintKitchenOrder } from '../application/use-cases/printKitchenOrder.js';
import { Order } from '../domain/entities/Order.js';
import { Table } from '../domain/entities/Table.js';
import type { IOrderRepository } from '../domain/repositories/IOrderRepository.js';
import type { ITableRepository } from '../domain/repositories/ITableRepository.js';
import type { IKitchenOrderPrinter } from '../domain/services/IKitchenOrderPrinter.js';
import { createKitchenPrintRoutes } from '../infrastructure/http/routes/KitchenPrintRoutes.js';

test('POST /orders/:tableId/print prints the saved order and responds without a body', async () => {
    const order = new Order({
        tableId: 'table-1',
        waiterName: 'Ana',
        waiterId: 'waiter-1',
        createdAt: new Date(),
        items: [{
            productId: 'pizza-1',
            productName: 'Pizza',
            price: 18000,
            quantity: 1,
            taxes: []
        }]
    });
    const orderRepository = {
        findByTableId: async () => order,
        moveActiveOrder: async () => undefined,
        payActiveOrder: async () => ({
            receiptId: 'receipt-1',
            ticketCode: 'POS-1',
            paymentMethod: 'cash',
            productSubtotal: 1000,
            deliveryFee: 0,
            customerTotal: 1000,
            amountReceived: 1000,
            change: 0
        }),
        save: async () => undefined,
        deleteByTableId: async () => undefined,
        cancelActiveByTableId: async () => undefined,
        removeItemByTableId: async () => undefined,
        updateItemNotesByTableId: async () => undefined,
        findItemCreatedAt: async () => null
    } satisfies IOrderRepository;
    const tableRepository = {
        findAll: async () => [new Table('table-1', 'Mesa 4', 'floor-1')],
        findById: async () => new Table('table-1', 'Mesa 4', 'floor-1'),
        findByFloor: async () => []
    } satisfies ITableRepository;
    let printedTableName = '';
    const printer: IKitchenOrderPrinter = {
        print: async (printOrder) => {
            printedTableName = printOrder.tableName;
        }
    };
    const app = express();
    app.use('/api', createKitchenPrintRoutes(
        new PrintKitchenOrder(orderRepository, tableRepository, printer)
    ));
    const server: HttpServer = createServer(app);

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    try {
        const response = await fetch(
            `http://127.0.0.1:${address.port}/api/orders/table-1/print`,
            { method: 'POST' }
        );

        assert.equal(response.status, 204);
        assert.equal(await response.text(), '');
        assert.equal(printedTableName, 'Mesa 4');
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        });
    }
});
