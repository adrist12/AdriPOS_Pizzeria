import assert from 'node:assert/strict';
import test from 'node:test';
import { MoveOrderUseCase } from '../application/use-cases/moveOrder.js';
import { OrderOperationError } from '../domain/errors/OrderOperationError.js';
import type { IOrderRepository } from '../domain/repositories/IOrderRepository.js';
import type { ITableRepository } from '../domain/repositories/ITableRepository.js';
import { Table } from '../domain/entities/Table.js';

function createUseCase(tables: Table[]) {
    const moved: Array<[string, string]> = [];
    const orderRepository: IOrderRepository = {
        save: async () => undefined,
        findByTableId: async () => null,
        moveActiveOrder: async (sourceId, destinationId) => {
            moved.push([sourceId, destinationId]);
        },
        payActiveOrder: async () => {
            throw new Error('Not implemented in this test double');
        },
        deleteByTableId: async () => undefined,
        cancelActiveByTableId: async () => undefined,
        removeItemByTableId: async () => undefined,
        updateItemNotesByTableId: async () => undefined,
        findItemCreatedAt: async () => null
    };
    const tableRepository: ITableRepository = {
        findAll: async () => tables,
        findById: async (tableId) => tables.find((table) => table.tableId === tableId) ?? null,
        findByFloor: async () => tables
    };
    return {
        useCase: new MoveOrderUseCase(orderRepository, tableRepository),
        moved
    };
}

test('moves between free places of the same service type', async () => {
    const source = new Table('takeaway-1', 'LLEVAR 1', 'floor-1');
    const destination = new Table('takeaway-2', 'LLEVAR 2', 'floor-1');
    const { useCase, moved } = createUseCase([source, destination]);

    const result = await useCase.execute({
        currentTableId: ' takeaway-1 ',
        newTableId: 'takeaway-2'
    });

    assert.deepEqual(result, {
        currentTableId: 'takeaway-1',
        newTableId: 'takeaway-2'
    });
    assert.deepEqual(moved, [['takeaway-1', 'takeaway-2']]);
});

test('rejects identical place ids before accessing repositories', async () => {
    const { useCase, moved } = createUseCase([]);

    await assert.rejects(
        useCase.execute({ currentTableId: 'seat-1', newTableId: 'seat-1' }),
        /no pueden ser el mismo/
    );
    assert.deepEqual(moved, []);
});

test('rejects when either place does not exist', async () => {
    const { useCase, moved } = createUseCase([
        new Table('seat-1', 'Mesa 1', 'floor-1')
    ]);

    await assert.rejects(
        useCase.execute({ currentTableId: 'seat-1', newTableId: 'seat-missing' }),
        (error: unknown) => error instanceof OrderOperationError && error.code === 'TABLE_NOT_FOUND'
    );
    assert.deepEqual(moved, []);
});

test('rejects moves between different service types', async () => {
    const { useCase, moved } = createUseCase([
        new Table('seat-1', 'Mesa 1', 'floor-1'),
        new Table('takeaway-1', 'LLEVAR 1', 'floor-1')
    ]);

    await assert.rejects(
        useCase.execute({ currentTableId: 'seat-1', newTableId: 'takeaway-1' }),
        (error: unknown) => error instanceof OrderOperationError && error.code === 'MOVE_INCOMPATIBLE'
    );
    assert.deepEqual(moved, []);
});
