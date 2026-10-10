import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool } from 'mysql2/promise';
import { MySqlAccountingRepository } from '../infrastructure/database/repositories/MySqlAccountingRepository.js';

test('counts paid delivery receipts grouped by table name', async () => {
    const { pool, queries } = createUniCentaPool(
        [{ Field: 'ID' }, { Field: 'TABLENAME' }, { Field: 'ATTRIBUTES' }],
        [{ tableName: 'Domicilio 1', sales: '4' }]
    );
    const repository = new MySqlAccountingRepository({} as Pool, pool);

    const summary = await repository.getDeliverySalesSummary('2026-10-01', '2026-11-01');

    assert.deepEqual(summary, [{ tableName: 'Domicilio 1', sales: 4 }]);
    assert.deepEqual(queries[0], { statement: 'SHOW COLUMNS FROM RECEIPTS', values: undefined });
    assert.match(queries[1].statement, /HAVING SUM\(TOTAL\) > 0/);
    assert.match(queries[1].statement, /LOWER\(COALESCE\(r\.TABLENAME/);
    assert.match(queries[1].statement, /adri\.pos\.servicemode/);
    assert.deepEqual(queries[1].values, ['2026-10-01', '2026-11-01']);
});

test('uses the AdriPOS receipt attribute marker when UniCenta has no TABLENAME column', async () => {
    const { pool, queries } = createUniCentaPool(
        [{ Field: 'ID' }, { Field: 'ATTRIBUTES' }],
        [{ tableName: 'Domicilio (AdriPOS)', sales: '2' }]
    );
    const repository = new MySqlAccountingRepository({} as Pool, pool);

    const summary = await repository.getDeliverySalesSummary('2026-10-01', '2026-11-01');

    assert.deepEqual(summary, [{ tableName: 'Domicilio (AdriPOS)', sales: 2 }]);
    assert.match(queries[1].statement, /adri\.pos\.servicemode/);
    assert.doesNotMatch(queries[1].statement, /r\.TABLENAME/);
});

test('fails explicitly when UniCenta cannot identify delivery receipts', async () => {
    const { pool, queries } = createUniCentaPool([{ Field: 'ID' }], []);
    const repository = new MySqlAccountingRepository({} as Pool, pool);

    await assert.rejects(
        repository.getDeliverySalesSummary('2026-10-01', '2026-11-01'),
        /no tiene receipts\.TABLENAME ni receipts\.ATTRIBUTES/
    );
    assert.equal(queries.length, 1);
});

function createUniCentaPool(
    columns: Array<{ Field: string }>,
    salesRows: Array<{ tableName: string; sales: string }>
): { pool: Pool; queries: Array<{ statement: string; values?: unknown[] }> } {
    const queries: Array<{ statement: string; values?: unknown[] }> = [];
    const execute = async (statement: string, values?: unknown[]) => {
        queries.push({ statement, values });
        return statement.startsWith('SHOW COLUMNS')
            ? [columns, []]
            : [salesRows, []];
    };
    return { pool: { execute } as unknown as Pool, queries };
}
