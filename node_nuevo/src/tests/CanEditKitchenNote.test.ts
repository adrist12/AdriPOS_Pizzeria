import assert from 'node:assert/strict';
import test from 'node:test';
import { canEditKitchenNote } from '../application/rules/canEditKitchenNote.js';

test('permite editar la nota durante los diez minutos desde que se creó el ítem', () => {
    const now = new Date('2026-10-05T17:00:00.000Z');
    const createdAt = new Date(now.getTime() - 9 * 60 * 1000);

    assert.equal(canEditKitchenNote(createdAt, now), true);
});

test('permite editar la nota justo en el límite de diez minutos', () => {
    const now = new Date('2026-10-05T17:00:00.000Z');
    const createdAt = new Date(now.getTime() - 10 * 60 * 1000);

    assert.equal(canEditKitchenNote(createdAt, now), true);
});

test('rechaza la edición una vez superado el límite de diez minutos', () => {
    const now = new Date('2026-10-05T17:00:00.000Z');
    const createdAt = new Date(now.getTime() - 10 * 60 * 1000 - 1);

    assert.equal(canEditKitchenNote(createdAt, now), false);
});
