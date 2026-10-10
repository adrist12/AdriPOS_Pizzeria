import assert from 'node:assert/strict';
import test from 'node:test';
import { formatKitchenOrder } from '../infrastructure/printing/WindowsKitchenOrderPrinter.js';
import type { KitchenPrintOrder } from '../domain/services/IKitchenOrderPrinter.js';

test('formats a kitchen receipt with place, delivery details, quantities and notes', () => {
    const order: KitchenPrintOrder = {
        tableName: 'Mesa 8',
        waiterName: 'Ana',
        createdAt: '2026-10-05T20:00:00.000Z',
        customerName: 'Cliente',
        customerPhone: '3001234567',
        deliveryAddress: 'Calle 123 # 4-5',
        deliveryFee: 5000,
        items: [{
            productName: 'Pizza especial',
            quantity: 2,
            unitPrice: 18000,
            notes: 'Sin cebolla',
            takeaway: true
        }]
    };

    const receipt = formatKitchenOrder(order).toString('latin1');

    assert.match(receipt, /COMANDA/);
    assert.match(receipt, /Mesa 8/);
    assert.match(receipt, /Cliente: Cliente/);
    assert.match(receipt, /Tel: 3001234567/);
    assert.match(receipt, /Direcci.n: Calle 123 # 4-5/);
    assert.match(receipt, /x2 Pizza especial/);
    assert.match(receipt, /PARA LLEVAR/);
    assert.match(receipt, /NOTA: Sin cebolla/);
    assert.match(receipt, /TOTAL:/);
    assert.match(receipt, /DOMI:/);
    assert.match(receipt, /T\.DOM:/);
    assert.ok(receipt.includes(String.fromCharCode(0x1b, 0x40)));
    assert.ok(receipt.includes(String.fromCharCode(0x1d, 0x21, 0x11)));
    assert.ok(receipt.includes(String.fromCharCode(0x1d, 0x42, 0x01)));
    assert.ok(receipt.includes(String.fromCharCode(0x1d, 0x56, 0x00)));
});

test('rejects a print request without items or with an invalid date', () => {
    const baseOrder: KitchenPrintOrder = {
        tableName: 'Mesa 8',
        waiterName: 'Ana',
        createdAt: '2026-10-05T20:00:00.000Z',
        customerName: null,
        customerPhone: null,
        deliveryAddress: null,
        deliveryFee: 0,
        items: []
    };

    assert.throws(() => formatKitchenOrder(baseOrder), /No hay productos/);
    assert.throws(() => formatKitchenOrder({
        ...baseOrder,
        createdAt: 'fecha inválida',
        items: [{ productName: 'Pizza', quantity: 1, unitPrice: 18000 }]
    }), /fecha de la comanda no es válida/);
});
