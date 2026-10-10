import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool, PoolConnection } from 'mysql2/promise';
import { OrderOperationError } from '../domain/errors/OrderOperationError.js';
import type { OrderItem } from '../domain/entities/Order.js';
import type { ITicketSerializer } from '../domain/services/IticketSerializerService.js';
import { MySqlOrderRepository } from '../infrastructure/database/repositories/MySqlOrderRepository.js';

const orderItems: OrderItem[] = [{
    productId: 'product-1',
    lineId: 'line-1',
    productName: 'Pizza',
    price: 20000,
    quantity: 1,
    notes: 'Sin cebolla',
    takeaway: true,
    taxes: [{
        taxId: 'tax-1',
        name: 'IVA',
        rate: 0.19,
        cascade: false,
        categoryId: 'tax-category-1'
    }]
}];

function createSerializer(): ITicketSerializer {
    return {
        generateJavaTicket: async () => Buffer.from(''),
        parseJavaTicket: async <T>() => orderItems as T
    };
}

test('writes a searchable UniCenta ticket and payment, then frees the place atomically', async () => {
    const queries: Array<{ statement: string; values: unknown[] }> = [];
    let committed = false;
    let rolledBack = false;
    const connection = {
        beginTransaction: async () => undefined,
        commit: async () => { committed = true; },
        rollback: async () => { rolledBack = true; },
        release: () => undefined,
        execute: async (statement: string, values: unknown[] = []) => {
            queries.push({ statement, values });
            if (statement.includes('SELECT') && statement.includes('FROM PLACES')) {
                return [[{ ID: 'delivery-1', NAME: 'Domicilio 1' }], []] as const;
            }
            if (statement.includes('SELECT') && statement.includes('FROM SHAREDTICKETS')) {
                return [[{
                    ID: 'delivery-1',
                    NAME: 'Ana - (12:00 123)',
                    APPUSER: 'waiter-1',
                    CONTENT: Buffer.from('serialized-order')
                }], []] as const;
            }
            if (statement.includes('SELECT') && statement.includes('FROM delivery_orders')) {
                return [[{
                    customer_name: 'Cliente',
                    phone: '3000000000',
                    address: 'Calle 1',
                    delivery_fee: 3000
                }], []] as const;
            }
            if (statement.includes('SELECT') && statement.includes('FROM PRODUCTS')) {
                return [[{
                    product_id: 'product-1',
                    product_name: 'Pizza',
                    reference: 'P-1',
                    code: 'P-1',
                    category_id: 'category-1',
                    tax_id: 'tax-1',
                    tax_category_id: 'tax-category-1',
                    printer: '1'
                }], []] as const;
            }
            if (statement.includes('SELECT') && statement.includes('FROM closedcash')) {
                return [[{ money: 'cash-session-1' }], []] as const;
            }
            if (statement.includes('SELECT') && statement.includes('FROM ticketsnum')) {
                return [[{
                    code: 'BV',
                    serie: 'POS',
                    id: 42,
                    priority: 'alternative',
                    status: 'Active'
                }], []] as const;
            }
            if (statement.includes('SHOW COLUMNS FROM receipts')) {
                return [[
                    { Field: 'id' },
                    { Field: 'money' },
                    { Field: 'TABLEID' },
                    { Field: 'TABLENAME' },
                    { Field: 'datenew' },
                    { Field: 'attributes' },
                    { Field: 'person' }
                ], []] as const;
            }
            if (statement.includes('SHOW COLUMNS FROM tickets')) {
                return [[
                    { Field: 'id' },
                    { Field: 'tickettype' },
                    { Field: 'ticketid' },
                    { Field: 'person' },
                    { Field: 'customer' },
                    { Field: 'status' },
                    { Field: 'serie_number' },
                    { Field: 'code' },
                    { Field: 'cufe' },
                    { Field: 'tickets_id' }
                ], []] as const;
            }
            if (statement.includes('SHOW COLUMNS FROM payments')) {
                return [[
                    { Field: 'id' },
                    { Field: 'receipt' },
                    { Field: 'payment' },
                    { Field: 'total' },
                    { Field: 'tip' },
                    { Field: 'transid' },
                    { Field: 'isprocessed' },
                    { Field: 'returnmsg' },
                    { Field: 'notes' },
                    { Field: 'tendered' },
                    { Field: 'cardname' },
                    { Field: 'voucher' },
                    { Field: 'days_to_pay' }
                ], []] as const;
            }
            if (statement.includes('SELECT') && statement.includes('FROM KITCHEN_TICKETS')) {
                return [[{ id: 'delivery-1' }], []] as const;
            }
            return [{ affectedRows: 1 }, []] as const;
        }
    } as unknown as PoolConnection;
    const pool = { getConnection: async () => connection } as unknown as Pool;
    const repository = new MySqlOrderRepository(pool, createSerializer());

    const result = await repository.payActiveOrder('delivery-1', 'cash', 25000);

    assert.equal(committed, true);
    assert.equal(rolledBack, false);
    assert.equal(result.ticketCode, 'POS-43');
    assert.equal(result.productSubtotal, 20000);
    assert.equal(result.deliveryFee, 3000);
    assert.equal(result.customerTotal, 23000);
    assert.equal(result.change, 2000);
    assert.equal(result.paymentMethod, 'cash');

    const receipt = queries.find(({ statement }) => statement.includes('INSERT INTO receipts'));
    assert.ok(receipt);
    assert.equal(receipt.values[1], 'cash-session-1');
    assert.equal(receipt.values[2], 'delivery-1');
    assert.equal(receipt.values[3], 'Domicilio 1');
    const receiptAttributes = (receipt.values[4] as Buffer).toString('utf8');
    assert.match(receiptAttributes, /adri\.pos\.deliveryFee/);
    assert.match(receiptAttributes, /adri\.pos\.tableName/);
    assert.match(receiptAttributes, /adri\.pos\.serviceMode">DELIVERY/);
    assert.match((receipt.values[4] as Buffer).toString('utf8'), /3000/);
    assert.match((receipt.values[4] as Buffer).toString('utf8'), /3000000000/);

    const ticket = queries.find(({ statement }) => statement.includes('INSERT INTO tickets'));
    assert.ok(ticket);
    assert.deepEqual(ticket.values, [
        receipt.values[0],
        0,
        43,
        'waiter-1',
        null,
        0,
        'POS-43',
        'BV',
        null,
        null
    ]);

    const line = queries.find(({ statement }) => statement.includes('INSERT INTO ticketlines'));
    assert.ok(line);
    assert.deepEqual(line.values.slice(1, 6), [0, 'product-1', 1, 20000, 'tax-1']);
    assert.match((line.values[6] as Buffer).toString('utf8'), /Sin cebolla/);
    assert.match((line.values[6] as Buffer).toString('utf8'), /takeaway/);

    const payment = queries.find(({ statement }) => statement.includes('INSERT INTO payments'));
    assert.ok(payment);
    assert.deepEqual(payment.values.slice(1, 4), [receipt.values[0], 'cash', 20000]);
    assert.equal(payment.values[9], 20000);
    assert.ok(queries.some(({ statement }) => statement.includes('DELETE FROM SHAREDTICKETS')));
    assert.ok(queries.some(({ statement, values }) =>
        statement.includes('SET id = ?, updated_at = CURRENT_TIMESTAMP') &&
        values[1] === 'delivery-1'
    ));
    assert.ok(queries.some(({ statement }) =>
        statement.includes('UPDATE PLACES SET TICKETID = NULL')
    ));
});

test('registers the ticket using the legacy id-only ticketsnum schema', async () => {
    const queries: Array<{ statement: string; values: unknown[] }> = [];
    let committed = false;
    const connection = {
        beginTransaction: async () => undefined,
        commit: async () => { committed = true; },
        rollback: async () => undefined,
        release: () => undefined,
        execute: async (statement: string, values: unknown[] = []) => {
            queries.push({ statement, values });
            if (statement.includes('SELECT') && statement.includes('FROM PLACES')) {
                return [[{ ID: 'table-1', NAME: 'Mesa 1' }], []] as const;
            }
            if (statement.includes('SELECT') && statement.includes('FROM SHAREDTICKETS')) {
                return [[{
                    ID: 'table-1',
                    NAME: 'Ana',
                    APPUSER: 'waiter-1',
                    CONTENT: Buffer.from('serialized-order')
                }], []] as const;
            }
            if (statement.includes('SELECT') && statement.includes('FROM delivery_orders')) {
                return [[], []] as const;
            }
            if (statement.includes('SELECT') && statement.includes('FROM PRODUCTS')) {
                return [[{
                    product_id: 'product-1',
                    product_name: 'Pizza',
                    reference: 'P-1',
                    code: 'P-1',
                    category_id: 'category-1',
                    tax_id: 'tax-1',
                    tax_category_id: 'tax-category-1',
                    printer: '1'
                }], []] as const;
            }
            if (statement.includes('SELECT') && statement.includes('FROM closedcash')) {
                return [[{ money: 'cash-session-1' }], []] as const;
            }
            if (statement.includes('SELECT') && statement.includes('FROM ticketsnum')) {
                return [[{ id: 42 }], []] as const;
            }
            if (statement.includes('SHOW COLUMNS FROM receipts')) {
                return [[
                    { Field: 'id' },
                    { Field: 'money' },
                    { Field: 'datenew' },
                    { Field: 'attributes' },
                    { Field: 'person' }
                ], []] as const;
            }
            if (statement.includes('SHOW COLUMNS FROM tickets')) {
                return [[
                    { Field: 'id' },
                    { Field: 'tickettype' },
                    { Field: 'ticketid' },
                    { Field: 'person' },
                    { Field: 'customer' },
                    { Field: 'status' }
                ], []] as const;
            }
            if (statement.includes('SHOW COLUMNS FROM payments')) {
                return [[
                    { Field: 'id' },
                    { Field: 'receipt' },
                    { Field: 'payment' },
                    { Field: 'total' },
                    { Field: 'tip' },
                    { Field: 'transid' },
                    { Field: 'isprocessed' },
                    { Field: 'returnmsg' },
                    { Field: 'notes' },
                    { Field: 'tendered' }
                ], []] as const;
            }
            if (statement.includes('SELECT') && statement.includes('FROM KITCHEN_TICKETS')) {
                return [[], []] as const;
            }
            return [{ affectedRows: 1 }, []] as const;
        }
    } as unknown as PoolConnection;
    const pool = { getConnection: async () => connection } as unknown as Pool;
    const repository = new MySqlOrderRepository(pool, createSerializer());

    const result = await repository.payActiveOrder('table-1', 'cash', 20000);

    assert.equal(committed, true);
    assert.equal(result.ticketCode, '43');
    const receipt = queries.find(({ statement }) => statement.includes('INSERT INTO receipts'));
    assert.ok(receipt);
    assert.match(receipt.statement, /INSERT INTO receipts \(id, money, datenew, attributes, person\)/);
    assert.equal(receipt.values[0], result.receiptId);
    assert.equal(receipt.values[1], 'cash-session-1');
    assert.match((receipt.values[2] as Buffer).toString('utf8'), /adri\.pos\.source/);
    assert.match((receipt.values[2] as Buffer).toString('utf8'), /adri\.pos\.serviceMode">DINE_IN/);
    assert.equal(receipt.values[3], 'waiter-1');
    const ticket = queries.find(({ statement }) => statement.includes('INSERT INTO tickets'));
    assert.ok(ticket);
    assert.match(ticket.statement, /INSERT INTO tickets \(id, tickettype, ticketid, person, customer, status\)/);
    assert.deepEqual(ticket.values, [
        result.receiptId,
        0,
        43,
        'waiter-1',
        null,
        0
    ]);
    const payment = queries.find(({ statement }) => statement.includes('INSERT INTO payments'));
    assert.ok(payment);
    assert.match(payment.statement, /INSERT INTO payments \(id, receipt, payment, total, tip, transid, isprocessed, returnmsg, notes, tendered\)/);
    assert.deepEqual(payment.values.slice(1, 4), [result.receiptId, 'cash', 20000]);
    const sequenceUpdate = queries.find(({ statement }) =>
        statement.includes('UPDATE ticketsnum SET id = ?')
    );
    assert.deepEqual(sequenceUpdate?.values, [43, 42]);
});

test('rejects underpayment and rolls back before creating any UniCenta receipt', async () => {
    const queries: string[] = [];
    let rolledBack = false;
    const connection = {
        beginTransaction: async () => undefined,
        commit: async () => undefined,
        rollback: async () => { rolledBack = true; },
        release: () => undefined,
        execute: async (statement: string) => {
            queries.push(statement);
            if (statement.includes('SELECT') && statement.includes('FROM PLACES')) {
                return [[{ ID: 'delivery-1', NAME: 'Domicilio 1' }], []] as const;
            }
            if (statement.includes('SELECT') && statement.includes('FROM SHAREDTICKETS')) {
                return [[{
                    ID: 'delivery-1',
                    NAME: 'Ana',
                    APPUSER: 'waiter-1',
                    CONTENT: Buffer.from('serialized-order')
                }], []] as const;
            }
            if (statement.includes('SELECT') && statement.includes('FROM delivery_orders')) {
                return [[{
                    customer_name: null,
                    phone: null,
                    address: null,
                    delivery_fee: 3000
                }], []] as const;
            }
            return [[], []] as const;
        }
    } as unknown as PoolConnection;
    const pool = { getConnection: async () => connection } as unknown as Pool;
    const repository = new MySqlOrderRepository(pool, createSerializer());

    await assert.rejects(
        repository.payActiveOrder('delivery-1', 'cash', 22000),
        (error: unknown) => error instanceof OrderOperationError && error.code === 'INVALID_PAYMENT'
    );
    assert.equal(rolledBack, true);
    assert.equal(queries.some((statement) => statement.includes('INSERT INTO receipts')), false);
});
