import assert from 'node:assert/strict';
import { createServer, type Server as HttpServer } from 'node:http';
import test from 'node:test';
import express from 'express';
import type { Server } from 'socket.io';
import { KitchenItem } from '../domain/entities/KitchenItem.js';
import { KitchenTicket } from '../domain/entities/KitchenTicket.js';
import { KitchenStation } from '../domain/entities/kitchenEnums.js';
import type { IKitchenRepository } from '../domain/repositories/IKitchenTicketRepository.js';
import { createKitchenDisplayRoutes } from '../infrastructure/http/routes/KitchenDisplayRoutes.js';

test('una estación devuelve todos los productos del ticket si uno pertenece a ella', async () => {
    const ticket = new KitchenTicket({
        ticketId: 'ticket-1',
        tableId: 'table-1',
        tableName: 'Mesa 4',
        waiterName: 'Ana',
        items: [
            new KitchenItem({
                itemId: 'pizza-line',
                ticketId: 'ticket-1',
                itemName: 'Pizza',
                quantity: 1,
                station: KitchenStation.PIZZAS,
                notes: 'PARA LLEVAR'
            }),
            new KitchenItem({
                itemId: 'plancha-line',
                ticketId: 'ticket-1',
                itemName: 'Hamburguesa',
                quantity: 2,
                station: KitchenStation.PLANCHA
            })
        ]
    });
    const repository: IKitchenRepository = {
        findActiveByStation: async (station) =>
            station === KitchenStation.PIZZAS ? [ticket] : null,
        save: async () => undefined,
        updateItemStatus: async () => undefined,
        updateTableByActiveTickets: async () => undefined
    };
    const app = express();
    const io = { emit: () => undefined } as unknown as Server;
    app.use('/api', createKitchenDisplayRoutes(repository, io));
    const server: HttpServer = createServer(app);

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    try {
        const response = await fetch(
            `http://127.0.0.1:${address.port}/api/kitchen?station=PIZZAS`
        );
        const tickets = await response.json() as Array<{
            tableId: string;
            tableName: string;
            items: Array<{ name: string; notes: string | null }>
        }>;

        assert.equal(response.status, 200);
        assert.equal(tickets[0].tableId, 'table-1');
        assert.equal(tickets[0].tableName, 'Mesa 4');
        assert.deepEqual(
            tickets[0].items.map((item) => item.name),
            ['Pizza', 'Hamburguesa']
        );
        assert.equal(tickets[0].items[0].notes, 'PARA LLEVAR');
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        });
    }
});
