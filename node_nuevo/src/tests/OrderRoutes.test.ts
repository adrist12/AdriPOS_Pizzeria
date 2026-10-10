import assert from 'node:assert/strict';
import { createServer, type Server as HttpServer } from 'node:http';
import test from 'node:test';
import express from 'express';
import type { Server } from 'socket.io';
import type { IOrderRepository } from '../domain/repositories/IOrderRepository.js';
import { OrderOperationError } from '../domain/errors/OrderOperationError.js';
import { PayOrderUseCase } from '../application/use-cases/payOrder.js';
import { createOrderRoutes } from '../infrastructure/http/routes/OrderRoutes.js';

interface Harness {
    server: HttpServer;
    baseUrl: string;
    events: Array<{ name: string; payload: unknown }>;
    repository: IOrderRepository;
}

async function createHarness(): Promise<Harness> {
    const events: Array<{ name: string; payload: unknown }> = [];
    const repository: IOrderRepository = {
        findByTableId: async () => null,
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
    };
    const io = {
        emit: (name: string, payload: unknown) => events.push({ name, payload })
    } as unknown as Server;
    const app = express();
    app.use(express.json());
    app.use('/api', createOrderRoutes(repository, io, new PayOrderUseCase(repository)));
    const server = createServer(app);

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
        throw new Error('No se pudo iniciar el servidor de prueba.');
    }

    return {
        server,
        baseUrl: `http://127.0.0.1:${address.port}/api`,
        events,
        repository
    };
}

async function closeHarness(server: HttpServer): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    });
}

test('an empty place responds with null without treating it as an HTTP error', async () => {
    const harness = await createHarness();

    try {
        const response = await fetch(`${harness.baseUrl}/orders/seat-empty`);

        assert.equal(response.status, 200);
        assert.equal(await response.json(), null);
    } finally {
        await closeHarness(harness.server);
    }
});

test('cancelar una orden activa responde sin contenido y emite la actualización en tiempo real', async () => {
    const harness = await createHarness();
    let cancelledTableId = '';
    harness.repository.cancelActiveByTableId = async (tableId) => {
        cancelledTableId = tableId;
    };

    try {
        const response = await fetch(`${harness.baseUrl}/orders/seat-1`, {
            method: 'DELETE'
        });

        assert.equal(response.status, 204);
        assert.equal(cancelledTableId, 'seat-1');
        assert.deepEqual(harness.events, [{
            name: 'order:changed',
            payload: { tableId: 'seat-1', action: 'CANCELLED' }
        }]);
    } finally {
        await closeHarness(harness.server);
    }
});

test('editar una nota delega la regla temporal y emite el cambio solo al guardar', async () => {
    const harness = await createHarness();
    let updated: [string, string, string] | undefined;
    harness.repository.updateItemNotesByTableId = async (tableId, productId, notes) => {
        updated = [tableId, productId, notes];
    };

    try {
        const response = await fetch(`${harness.baseUrl}/orders/seat-2/items/product-4/notes`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: 'Sin cebolla' })
        });

        assert.equal(response.status, 204);
        assert.deepEqual(updated, ['seat-2', 'product-4', 'Sin cebolla']);
        assert.deepEqual(harness.events, [{
            name: 'order:changed',
            payload: { tableId: 'seat-2', action: 'NOTE_UPDATED' }
        }]);
    } finally {
        await closeHarness(harness.server);
    }
});

test('una nota fuera de ventana devuelve conflicto y no emite una actualización', async () => {
    const harness = await createHarness();
    harness.repository.updateItemNotesByTableId = async () => {
        throw new OrderOperationError(
            'Ya pasaron los 10 minutos disponibles para editar esta nota.',
            'NOTE_EDIT_WINDOW_EXPIRED'
        );
    };

    try {
        const response = await fetch(`${harness.baseUrl}/orders/seat-2/items/product-4/notes`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: 'Sin cebolla' })
        });

        assert.equal(response.status, 409);
        assert.equal(harness.events.length, 0);
    } finally {
        await closeHarness(harness.server);
    }
});

test('registrar el pago cierra la orden, devuelve el ticket y notifica el cambio', async () => {
    const harness = await createHarness();
    let paymentRequest: [string, 'cash' | 'bank', number] | undefined;
    harness.repository.payActiveOrder = async (tableId, method, amountReceived) => {
        paymentRequest = [tableId, method, amountReceived];
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
    };

    try {
        const response = await fetch(`${harness.baseUrl}/orders/table-1/pay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentMethod: 'cash', amountReceived: 25000 })
        });

        assert.equal(response.status, 201);
        assert.deepEqual(await response.json(), {
            receiptId: 'receipt-1',
            ticketCode: 'POS-24895',
            paymentMethod: 'cash',
            productSubtotal: 20000,
            deliveryFee: 3000,
            customerTotal: 23000,
            amountReceived: 25000,
            change: 2000
        });
        assert.deepEqual(paymentRequest, ['table-1', 'cash', 25000]);
        assert.deepEqual(harness.events, [{
            name: 'order:changed',
            payload: { tableId: 'table-1', action: 'PAID' }
        }]);
    } finally {
        await closeHarness(harness.server);
    }
});
