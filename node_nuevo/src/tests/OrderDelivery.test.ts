import assert from 'node:assert/strict';
import test from 'node:test';
import { Order, OrderItem } from '../domain/entities/Order.js';
import { buildJavaTicketPayload } from '../infrastructure/database/repositories/JavaTicketPayload.js';

const item: OrderItem = {
    productId: 'pizza-1',
    productName: 'Pizza',
    price: 18000,
    quantity: 2,
    taxes: [{
        taxId: 'tax-1',
        name: 'IVA',
        rate: 0.19,
        cascade: false,
        categoryId: 'category-1'
    }]
};

function createDeliveryOrder(fee: number): Order {
    return new Order({
        tableId: 'LLEVAR-1',
        waiterName: 'Ana',
        waiterId: 'waiter-1',
        createdAt: new Date('2026-01-01T12:00:00.000Z'),
        items: [item],
        delivery: {
            customerName: 'Cliente',
            phone: '3001234567',
            address: 'Calle 1',
            deliveryFee: fee
        }
    });
}

test('el valor cobrado al cliente separa productos de la tarifa de domicilio', () => {
    const order = createDeliveryOrder(7000);

    assert.equal(order.calculateTotal(), 36000);
    assert.equal(order.Delivery?.deliveryFee, 7000);
});

test('el payload serializado para UniCenta contiene productos pero no datos ni tarifa de domicilio', () => {
    const payload = buildJavaTicketPayload(createDeliveryOrder(7000));
    const serialized = JSON.stringify(payload);

    assert.equal(payload.tableId, 'LLEVAR-1');
    assert.equal((payload.items as OrderItem[])[0].price, 18000);
    assert.equal(serialized.includes('deliveryFee'), false);
    assert.equal(serialized.includes('customerName'), false);
    assert.equal(serialized.includes('address'), false);
});

test('el payload UniCenta conserva el identificador de línea y la opción para llevar', () => {
    const order = new Order({
        tableId: 'table-1',
        waiterName: 'Ana',
        waiterId: 'waiter-1',
        createdAt: new Date(),
        items: [{
            ...item,
            lineId: 'line-unique',
            takeaway: true
        }]
    });
    const payloadItem = (buildJavaTicketPayload(order).items as Array<Record<string, unknown>>)[0];

    assert.equal(payloadItem.lineId, 'line-unique');
    assert.equal(payloadItem.takeaway, true);
});

test('rechaza una tarifa de domicilio negativa o no finita', () => {
    assert.throws(() => createDeliveryOrder(-1), /tarifa de domicilio/i);
    assert.throws(() => createDeliveryOrder(Number.NaN), /tarifa de domicilio/i);
});
