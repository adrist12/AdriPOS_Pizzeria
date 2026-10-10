import assert from 'node:assert/strict';
import test from 'node:test';
import { KitchenItem } from '../domain/entities/KitchenItem.js';
import { KitchenTicket } from '../domain/entities/KitchenTicket.js';
import { ItemStatus, KitchenStation, TicketStatus } from '../domain/entities/kitchenEnums.js';

function createItem(itemId: string, station = KitchenStation.PIZZAS): KitchenItem {
    return new KitchenItem({
        itemId,
        ticketId: 'ticket-1',
        itemName: `Producto ${itemId}`,
        quantity: 1,
        station
    });
}

test('KitchenItem inicia pendiente y puede marcarse como listo', () => {
    const item = createItem('item-1');

    assert.equal(item.status, ItemStatus.PENDING);
    item.markAsReady();
    assert.equal(item.status, ItemStatus.READY);
});

test('KitchenItem rechaza cantidades no positivas', () => {
    assert.throws(
        () => new KitchenItem({
            itemId: 'item-1',
            ticketId: 'ticket-1',
            itemName: 'Producto inválido',
            quantity: 0,
            station: KitchenStation.PIZZAS
        }),
        /cantidad.*mayor a 0/i
    );
});

test('KitchenTicket agrupa cantidades del mismo ítem', () => {
    const ticket = new KitchenTicket({
        ticketId: 'ticket-1',
        tableId: 'table-1',
        waiterName: 'Ana'
    });

    ticket.addItem(createItem('item-1'));
    ticket.addItem(createItem('item-1'));

    assert.equal(ticket.Items.length, 1);
    assert.equal(ticket.Items[0].quantity, 2);
});

test('KitchenTicket filtra los ítems por estación', () => {
    const ticket = new KitchenTicket({
        ticketId: 'ticket-1',
        tableId: 'table-1',
        waiterName: 'Ana',
        status: TicketStatus.PENDING,
        items: [
            createItem('pizza', KitchenStation.PIZZAS),
            createItem('plancha', KitchenStation.PLANCHA)
        ]
    });

    assert.equal(ticket.getItemsByStation(KitchenStation.PIZZAS).length, 1);
    assert.equal(ticket.getItemsByStation(KitchenStation.PLANCHA).length, 1);
});
