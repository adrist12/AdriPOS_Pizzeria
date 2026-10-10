import assert from 'node:assert/strict';
import test from 'node:test';
import { AccountingUseCases } from '../application/use-cases/accounting.js';
import type { IAccountingRepository } from '../domain/repositories/IAccountingRepository.js';

const calls: unknown[][] = [];
const repository: IAccountingRepository = {
    getPaymentAccounts: async () => [],
    getMovementTypes: async () => [],
    getSummary: async (...args) => {
        calls.push(['summary', ...args]);
        return { period: args[2], income: 0, expenses: 0, balance: 0, byPaymentAccount: [] };
    },
    getMovementDetails: async (...args) => {
        calls.push(['details', ...args]);
        return {};
    },
    getDeliverySalesSummary: async (...args) => {
        calls.push(['delivery-sales', ...args]);
        return [{ tableName: 'Domicilio 1', sales: 3 }];
    },
    recordManualMovement: async (movement) => {
        calls.push(['movement', movement]);
    },
    updateMovement: async (id, movement) => {
        calls.push(['update', id, movement]);
    },
    syncUniCentaSales: async (...args) => {
        calls.push(['sync', ...args]);
        return { synced: 0, skipped: 0 };
    }
};

test('accounting queries validate month/year and use exclusive date bounds', async () => {
    calls.length = 0;
    const accounting = new AccountingUseCases(repository);

    await accounting.getMonthlySummary(2, 2026);
    assert.deepEqual(calls[0], ['summary', '2026-02-01', '2026-03-01', '2026-02']);
    await accounting.getMonthlySummary(0, 2026);
    assert.deepEqual(calls[1], ['summary', '2026-01-01', '2027-01-01', '2026']);
    const deliverySummary = await accounting.getDeliverySalesSummary(2, 2026);
    assert.deepEqual(calls[2], ['delivery-sales', '2026-02-01', '2026-03-01']);
    assert.deepEqual(deliverySummary, {
        period: '2026-02',
        totalSales: 3,
        byTable: [{ tableName: 'Domicilio 1', sales: 3 }]
    });
    await assert.rejects(() => accounting.getMonthlySummary(13, 2026), /Mes debe estar/);
});

test('movement updates require the configured password and validate all editable fields', async () => {
    calls.length = 0;
    const accounting = new AccountingUseCases(repository, 'test-accounting-edit-password');
    const update = {
        id: '7',
        typeId: '2',
        cashAccountId: 1,
        concept: '  Compra de harina  ',
        amount: '9300',
        date: '2026-10-05',
        password: 'test-accounting-edit-password'
    };

    await assert.rejects(
        () => accounting.updateMovement({ ...update, password: 'incorrecta' }),
        /contraseña/
    );
    assert.equal(calls.length, 0);

    await accounting.updateMovement(update);
    assert.deepEqual(calls[0], [
        'update',
        7,
        {
            typeId: 2,
            cashAccountId: 1,
            concept: 'Compra de harina',
            amount: 9300,
            date: '2026-10-05'
        }
    ]);

    await assert.rejects(
        () => accounting.updateMovement({ ...update, date: '2026-02-30' }),
        /Fecha no es una fecha válida/
    );
    assert.equal(calls.length, 1);
});

test('manual movements and sales synchronization validate input before repository calls', async () => {
    calls.length = 0;
    const accounting = new AccountingUseCases(repository);
    await accounting.recordManualMovement({
        typeId: 1,
        cashAccountId: '2',
        concept: '  Compra de insumos  ',
        amount: '1250',
        date: '2026-10-01'
    });
    assert.deepEqual(calls[0], [
        'movement',
        { typeId: 1, cashAccountId: 2, concept: 'Compra de insumos', amount: 1250, date: '2026-10-01' }
    ]);
    await assert.rejects(() => accounting.recordManualMovement({
        typeId: 1,
        cashAccountId: 2,
        concept: '',
        amount: 0,
        date: '2026-10-01'
    }), /concepto/);
    await assert.rejects(() => accounting.recordManualMovement({
        typeId: 1,
        cashAccountId: 2,
        concept: 'Ingreso manual',
        amount: 1250,
        date: '2026-02-30'
    }), /Fecha no es una fecha válida/);
    await accounting.syncUniCentaSales({ startDate: '2026-01-01', endDate: '2026-01-31' });
    assert.deepEqual(calls[1], ['sync', '2026-01-01', '2026-01-31']);
    await assert.rejects(() => accounting.syncUniCentaSales({
        startDate: '2026-02-01',
        endDate: '2026-01-31'
    }), /posterior/);
});
