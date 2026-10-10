import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool } from 'mysql2/promise';
import { MySqlTableRepository } from '../infrastructure/database/repositories/MySqlTableRepository.js';

test('reports occupancy only while the place has an active shared ticket', async () => {
    let query = '';
    const database = {
        execute: async (statement: string) => {
            query = statement;
            return [[
                {
                    ID: 'table-1',
                    NAME: 'Mesa 1',
                    FLOOR: 'floor-1',
                    WAITER: 'Ana',
                    TICKETID: 'table-1',
                    OCCUPIED: new Date()
                },
                {
                    ID: 'table-2',
                    NAME: 'Mesa 2',
                    FLOOR: 'floor-1',
                    WAITER: null,
                    TICKETID: null,
                    OCCUPIED: null
                }
            ], []] as const;
        }
    } as unknown as Pool;
    const repository = new MySqlTableRepository(database);

    const tables = await repository.findAll();

    assert.match(query, /ST\.ID AS TICKETID/i);
    assert.match(query, /CASE WHEN ST\.ID IS NULL THEN NULL ELSE T\.OCCUPIED END/i);
    assert.doesNotMatch(query, /COALESCE\s*\(\s*ST\.ID\s*,\s*T\.TICKETID/i);
    assert.equal(tables[0].ticketId, 'table-1');
    assert.notEqual(tables[0].occupied, null);
    assert.equal(tables[1].ticketId, null);
    assert.equal(tables[1].occupied, null);
    assert.equal(tables[1].waiterName, null);
});
