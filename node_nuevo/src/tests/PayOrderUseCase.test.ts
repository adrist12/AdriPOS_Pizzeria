import assert from 'node:assert/strict';
import test from 'node:test';
import { PayOrderUseCase } from '../application/use-cases/payOrder.js';
import { OrderOperationError } from '../domain/errors/OrderOperationError.js';
import type { IOrderRepository, PaidOrderResult } from '../domain/repositories/IOrderRepository.js';

function createUseCase() {
    const calls: Array<[string, 'cash' | 'bank', number]> = [];
    const orderRepository: IOrderRepository = {
        save: async () => undefined,
        findByTableId: async () => null,
        moveActiveOrder: async () => undefined,
        payActiveOrder: async (tableId, method, amountReceived): Promise<PaidOrderResult> => {
            calls.push([tableId, method, amountReceived]);
            return {
                receiptId: 'receipt-1',
                ticketCode: 'POS-24895',
                paymentMethod: method,
                productSubtotal: 20000,
                deliveryFee: 3000,
                customerTotal: 23000,
                amountReceived,
                change: amountReceived - 23000
            };
        },
        deleteByTableId: async () => undefined,
        cancelActiveByTableId: async () => undefined,
        removeItemByTableId: async () => undefined,
        updateItemNotesByTableId: async () => undefined,
        findItemCreatedAt: async () => null
    };
    return { useCase: new PayOrderUseCase(orderRepository), calls };
}

test('registers a cash payment request through the order repository', async () => {
    const { useCase, calls } = createUseCase();

    const result = await useCase.execute('table-1', {
        paymentMethod: 'cash',
        amountReceived: 25000
    });

    assert.deepEqual(calls, [['table-1', 'cash', 25000]]);
    assert.equal(result.ticketCode, 'POS-24895');
    assert.equal(result.change, 2000);
});

test('registers Nequi as a bank payment for the exact customer total', async () => {
    const { useCase, calls } = createUseCase();

    const result = await useCase.execute('table-1', {
        paymentMethod: 'bank',
        amountReceived: 23000
    });

    assert.deepEqual(calls, [['table-1', 'bank', 23000]]);
    assert.equal(result.paymentMethod, 'bank');
    assert.equal(result.change, 0);
});

test('rejects a missing table and invalid received amounts', async () => {
    const { useCase, calls } = createUseCase();

    await assert.rejects(
        useCase.execute(' ', { paymentMethod: 'cash', amountReceived: 1000 }),
        (error: unknown) => error instanceof OrderOperationError && error.code === 'INVALID_PAYMENT'
    );
    await assert.rejects(
        useCase.execute('table-1', { paymentMethod: 'cash', amountReceived: 1000.5 }),
        (error: unknown) => error instanceof OrderOperationError && error.code === 'INVALID_PAYMENT'
    );
    assert.deepEqual(calls, []);
});
