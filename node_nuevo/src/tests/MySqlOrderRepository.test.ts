import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool, PoolConnection } from 'mysql2/promise';
import type { ITicketSerializer } from '../domain/services/IticketSerializerService.js';
import { kitchenItemId } from '../domain/services/kitchenItemId.js';
import { MySqlOrderRepository } from '../infrastructure/database/repositories/MySqlOrderRepository.js';

test('clears UniCenta place occupancy in the same transaction when cancelling an order', async () => {
    const queries: Array<{ statement: string; values: unknown[] }> = [];
    const connection = {
        beginTransaction: async () => undefined,
        commit: async () => undefined,
        rollback: async () => undefined,
        release: () => undefined,
        execute: async (statement: string, values: unknown[] = []) => {
            queries.push({ statement, values });
            if (statement.includes('SELECT ID FROM SHAREDTICKETS')) {
                return [[{ ID: 'table-1' }], []] as const;
            }
            return [{ affectedRows: 1 }, []] as const;
        }
    } as unknown as PoolConnection;
    const pool = {
        getConnection: async () => connection
    } as unknown as Pool;
    const repository = new MySqlOrderRepository(
        pool,
        {} as ITicketSerializer
    );

    await repository.cancelActiveByTableId('table-1');

    const occupancyUpdate = queries.find(({ statement }) =>
        statement.includes('UPDATE PLACES SET TICKETID = NULL')
    );
    assert.deepEqual(occupancyUpdate, {
        statement: 'UPDATE PLACES SET TICKETID = NULL, OCCUPIED = NULL, WAITER = NULL WHERE ID = ?',
        values: ['table-1']
    });

    test('moves a delivery order atomically and rekeys its kitchen item identifiers', async () => {
        const sourceId = 'delivery-1';
        const destinationId = 'delivery-2';
        const lineId = 'line-1';
        const statements: Array<{ statement: string; values: unknown[] }> = [];
        let committed = false;
        let rolledBack = false;
        const connection = {
            beginTransaction: async () => undefined,
            commit: async () => { committed = true; },
            rollback: async () => { rolledBack = true; },
            release: () => undefined,
            execute: async (statement: string, values: unknown[] = []) => {
                statements.push({ statement, values });
                if (statement.includes('FROM PLACES') && statement.includes('FOR UPDATE')) {
                    return [[
                        { ID: sourceId, NAME: 'Domicilio 1' },
                        { ID: destinationId, NAME: 'Domicilio 2' }
                    ], []] as const;
                }
                if (statement.includes('FROM SHAREDTICKETS') && statement.includes('FOR UPDATE')) {
                    return [[{
                        ID: sourceId,
                        NAME: 'Ana - (12:00 123)',
                        APPUSER: 'waiter-1',
                        CONTENT: Buffer.from('serialized-order'),
                        PICKUPID: null
                    }], []] as const;
                }
                if (statement.includes('FROM delivery_orders')) {
                    return [[{
                        customer_name: 'Cliente',
                        phone: '3000000000',
                        address: 'Calle 1',
                        delivery_fee: 5000
                    }], []] as const;
                }
                if (statement.includes('FROM KITCHEN_TICKETS')) {
                    return [[{ id: sourceId }], []] as const;
                }
                if (statement.includes('FROM KITCHEN_ITEMS')) {
                    return [[{ id: kitchenItemId(sourceId, lineId) }], []] as const;
                }
                return [{ affectedRows: 1 }, []] as const;
            }
        } as unknown as PoolConnection;
        const pool = {
            getConnection: async () => connection
        } as unknown as Pool;
        const serializer: ITicketSerializer = {
            generateJavaTicket: async () => Buffer.from(''),
            parseJavaTicket: async <T>() => [{
                productId: 'pizza-1',
                lineId,
                productName: 'Pizza',
                price: 18000,
                quantity: 1,
                taxes: []
            }] as T
        };
        const repository = new MySqlOrderRepository(pool, serializer);

        await repository.moveActiveOrder(sourceId, destinationId);

        assert.equal(committed, true);
        assert.equal(rolledBack, false);
        assert.ok(statements.some(({ statement, values }) =>
            statement.includes('INSERT INTO delivery_orders') &&
            values.join('|') === `${destinationId}|Cliente|3000000000|Calle 1|5000`
        ));
        assert.ok(statements.some(({ statement, values }) =>
            statement.includes('UPDATE KITCHEN_ITEMS') &&
            statement.includes('SET id = ?') &&
            values[0] === kitchenItemId(destinationId, lineId)
        ));
        assert.ok(statements.some(({ statement, values }) =>
            statement.includes('UPDATE PLACES') &&
            statement.includes('SET TICKETID = ?, OCCUPIED = CURRENT_TIMESTAMP') &&
            values[0] === destinationId
        ));
    });

    test('rolls back a move when the destination already has an active ticket', async () => {
        let rolledBack = false;
        let committed = false;
        const connection = {
            beginTransaction: async () => undefined,
            commit: async () => { committed = true; },
            rollback: async () => { rolledBack = true; },
            release: () => undefined,
            execute: async (statement: string) => {
                if (statement.includes('FROM PLACES') && statement.includes('FOR UPDATE')) {
                    return [[
                        { ID: 'seat-1', NAME: 'Mesa 1' },
                        { ID: 'seat-2', NAME: 'Mesa 2' }
                    ], []] as const;
                }
                if (statement.includes('FROM SHAREDTICKETS') && statement.includes('FOR UPDATE')) {
                    return [[
                        { ID: 'seat-1', NAME: 'Ana', APPUSER: 'waiter-1', CONTENT: Buffer.from('[]'), PICKUPID: null },
                        { ID: 'seat-2', NAME: 'Luis', APPUSER: 'waiter-2', CONTENT: Buffer.from('[]'), PICKUPID: null }
                    ], []] as const;
                }
                return [{ affectedRows: 1 }, []] as const;
            }
        } as unknown as PoolConnection;
        const pool = { getConnection: async () => connection } as unknown as Pool;
        const repository = new MySqlOrderRepository(pool, {} as ITicketSerializer);

        await assert.rejects(
            repository.moveActiveOrder('seat-1', 'seat-2'),
            (error: unknown) => error instanceof Error && error.message.includes('destino ya tiene')
        );
        assert.equal(rolledBack, true);
        assert.equal(committed, false);
    });
});
