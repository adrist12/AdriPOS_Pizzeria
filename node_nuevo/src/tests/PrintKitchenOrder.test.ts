import assert from 'node:assert/strict';
import test from 'node:test';
import { PrintKitchenOrder } from '../application/use-cases/printKitchenOrder.js';
import { Order } from '../domain/entities/Order.js';
import { Table } from '../domain/entities/Table.js';
import type { IOrderRepository } from '../domain/repositories/IOrderRepository.js';
import type { ITableRepository } from '../domain/repositories/ITableRepository.js';
import type {
    IKitchenOrderPrinter,
    KitchenPrintOrder
} from '../domain/services/IKitchenOrderPrinter.js';

test('prints a kitchen copy using the saved order and configured UniCenta place name', async () => {
    const order = new Order({
        tableId: 'table-1',
        waiterName: 'Ana',
        waiterId: 'waiter-1',
        createdAt: new Date('2026-10-05T20:00:00.000Z'),
        items: [{
            lineId: 'pizza-line',
            productId: 'pizza-1',
            productName: 'Pizza',
            price: 18000,
            quantity: 2,
            notes: 'Sin cebolla',
            takeaway: true,
            taxes: []
        }],
        delivery: {
            customerName: 'Cliente',
            phone: '3000000000',
            address: 'Calle 1',
            deliveryFee: 5000
        }
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
        findAll: async () => [new Table('table-1', 'Mesa 8', 'floor-1')],
        findById: async () => new Table('table-1', 'Mesa 8', 'floor-1'),
        findByFloor: async () => []
    } satisfies ITableRepository;
    let printed: KitchenPrintOrder | undefined;
    const printer: IKitchenOrderPrinter = {
        print: async (printOrder) => {
            printed = printOrder;
        }
    };

    await new PrintKitchenOrder(orderRepository, tableRepository, printer)
        .execute('table-1');

    assert.deepEqual(printed, {
        tableName: 'Mesa 8',
        waiterName: 'Ana',
        createdAt: '2026-10-05T20:00:00.000Z',
        customerName: 'Cliente',
        customerPhone: '3000000000',
        deliveryAddress: 'Calle 1',
        deliveryFee: 5000,
        items: [{
            productName: 'Pizza',
            quantity: 2,
            unitPrice: 18000,
            notes: 'Sin cebolla',
            takeaway: true
        }]
    });
});
