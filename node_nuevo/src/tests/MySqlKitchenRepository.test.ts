import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool } from 'mysql2/promise';
import { KitchenStation } from '../domain/entities/kitchenEnums.js';
import { MySqlKitchenRepository } from '../infrastructure/database/repositories/MySqlKitchenRepository.js';

test('selects tickets by station membership while fetching every item in each ticket', async () => {
    let query = '';
    let parameters: unknown[] = [];
    const database = {
        execute: async (statement: string, values: unknown[]) => {
            query = statement;
            parameters = values;
            return [[
                {
                    ticket_id: 'ticket-1',
                    table_id: 'table-1',
                    table_name: 'Mesa 4',
                    waiter_name: 'Ana',
                    ticket_status: 'PENDING',
                    ticket_created_at: new Date(),
                    ticket_updated_at: new Date(),
                    item_id: 'pizza-1',
                    item_name: 'Pizza',
                    item_quantity: 1,
                    item_station: 'PIZZAS',
                    item_status: 'PENDING',
                    item_notes: null,
                    item_created_at: new Date(),
                    item_updated_at: new Date()
                },
                {
                    ticket_id: 'ticket-1',
                    table_id: 'table-1',
                    table_name: 'Mesa 4',
                    waiter_name: 'Ana',
                    ticket_status: 'PENDING',
                    ticket_created_at: new Date(),
                    ticket_updated_at: new Date(),
                    item_id: 'burger-1',
                    item_name: 'Hamburguesa',
                    item_quantity: 1,
                    item_station: 'PLANCHA',
                    item_status: 'PENDING',
                    item_notes: null,
                    item_created_at: new Date(),
                    item_updated_at: new Date()
                },
                {
                    ticket_id: 'ticket-1',
                    table_id: 'table-1',
                    table_name: 'Mesa 4',
                    waiter_name: 'Ana',
                    ticket_status: 'PENDING',
                    ticket_created_at: new Date(),
                    ticket_updated_at: new Date(),
                    item_id: 'drink-1',
                    item_name: 'Limonada',
                    item_quantity: 1,
                    item_station: 'PLANCHA',
                    item_status: 'READY',
                    item_notes: null,
                    item_created_at: new Date(),
                    item_updated_at: new Date()
                }
            ], []] as const;
        }
    } as unknown as Pool;
    const repository = new MySqlKitchenRepository(database);

    const tickets = await repository.findActiveByStation(KitchenStation.PIZZAS);

    assert.match(query, /EXISTS\s*\(\s*SELECT 1/i);
    assert.match(query, /MATCHING_ITEM\.station = \?/i);
    assert.doesNotMatch(query, /AND I\.station = \?/i);
    assert.deepEqual(parameters, [KitchenStation.PIZZAS]);
    assert.equal(tickets?.length, 1);
    assert.equal(tickets?.[0].tableName, 'Mesa 4');
    assert.deepEqual(
        tickets?.[0].Items.map((item) => item.itemName),
        ['Pizza', 'Hamburguesa', 'Limonada']
    );
    assert.equal(tickets?.[0].Items[2].status, 'READY');
});
