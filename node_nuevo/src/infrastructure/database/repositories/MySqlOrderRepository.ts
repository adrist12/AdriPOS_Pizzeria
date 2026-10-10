import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import { Order, OrderItem } from '../../../domain/entities/Order.js';
import {
    IOrderRepository,
    PaidOrderResult,
    UniCentaPaymentMethod
} from '../../../domain/repositories/IOrderRepository.js';
import { ITicketSerializer } from '../../../domain/services/IticketSerializerService.js';
import { buildJavaTicketPayload } from './JavaTicketPayload.js';
import { OrderOperationError } from '../../../domain/errors/OrderOperationError.js';
import { kitchenItemId } from '../../../domain/services/kitchenItemId.js';
import { canEditKitchenNote } from '../../../application/rules/canEditKitchenNote.js';

interface DeliveryRow {
    customer_name: string | null;
    phone: string | null;
    address: string | null;
    delivery_fee: number | null;
}

interface EditableTicketRow extends RowDataPacket {
    NAME: string;
    CONTENT: Buffer;
    APPUSER: string;
}

interface KitchenItemCreatedAtRow extends RowDataPacket {
    created_at: Date | string;
}

interface SharedTicketIdRow extends RowDataPacket {
    ID: string;
}

interface KitchenItemIdRow extends RowDataPacket {
    id: string;
}

interface MovePlaceRow extends RowDataPacket {
    ID: string;
    NAME: string;
}

interface MoveSharedTicketRow extends RowDataPacket {
    ID: string;
    NAME: string;
    APPUSER: string;
    CONTENT: Buffer;
    PICKUPID: string | number | null;
}

interface MoveDeliveryRow extends RowDataPacket, DeliveryRow { }

interface MoveKitchenTicketRow extends RowDataPacket {
    id: string;
}

interface PayPlaceRow extends RowDataPacket {
    ID: string;
    NAME: string;
}

interface PaySharedTicketRow extends RowDataPacket {
    ID: string;
    NAME: string;
    APPUSER: string;
    CONTENT: Buffer;
}

interface PayCounterRow extends RowDataPacket {
    code?: string;
    serie?: string;
    id: number | string;
    priority?: string;
    status?: string;
}

interface PayColumnRow extends RowDataPacket {
    Field: string;
}

interface PayCashRow extends RowDataPacket {
    money: string;
}

interface PayProductRow extends RowDataPacket {
    product_id: string;
    product_name: string;
    reference: string;
    code: string;
    category_id: string;
    tax_id: string;
    tax_category_id: string;
    printer: string | null;
}

interface PayDeliveryRow extends RowDataPacket {
    customer_name: string | null;
    phone: string | null;
    address: string | null;
    delivery_fee: number | string | null;
}

interface PayKitchenTicketRow extends RowDataPacket {
    id: string;
}

function extractWaiterName(ticketName: string): string {
    const match = ticketName.match(/^(.+) - \((\d{1,2}):(\d{2}) (\d{1,3})\)$/);
    return match?.[1] ?? ticketName;
}

function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function propertiesXml(entries: Array<[string, string | number | null | undefined]>): Buffer {
    const values = entries
        .filter((entry): entry is [string, string | number] => entry[1] !== null && entry[1] !== undefined && entry[1] !== '')
        .map(([key, value]) => `<entry key="${escapeXml(key)}">${escapeXml(String(value))}</entry>`)
        .join('');
    return Buffer.from(
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<!DOCTYPE properties SYSTEM "http://java.sun.com/dtd/properties.dtd">\n` +
        `<properties><comment>AdriPOS</comment>${values}</properties>\n`,
        'utf8'
    );
}

function roundCurrency(value: number): number {
    return Math.round(value);
}

export class MySqlOrderRepository implements IOrderRepository {

    constructor(
        private readonly dbPool: Pool,
        private readonly javaTicketService: ITicketSerializer
    ) { }

    async findByTableId(tableId: string): Promise<Order | null> {

        const query = `
            SELECT
                st.ID,
                st.NAME,
                st.CONTENT,
                st.APPUSER,
                st.LOCKED,
                d.customer_name,
                d.phone,
                d.address,
                d.delivery_fee
            FROM SHAREDTICKETS st
            LEFT JOIN delivery_orders d ON d.ticket_id = st.ID
            WHERE st.ID = ?
        `;

        const [rows] = await this.dbPool.execute<any[]>(
            query,
            [tableId]
        );

        if (rows.length === 0) {
            return null;
        }

        const row = rows[0];

        const content: OrderItem[] =
            await this.javaTicketService.parseJavaTicket(row.CONTENT);

        // NAME:
        // "Administrator - (13:25 123)"
        const match = row.NAME.match(
            /^(.+) - \((\d{1,2}):(\d{2}) (\d{1,3})\)$/
        );

        let waiterName = row.NAME;
        let time = new Date();

        if (match) {
            waiterName = match[1];

            const hours = Number(match[2]);
            const minutes = Number(match[3]);
            const milliseconds = Number(match[4]);

            time.setHours(hours, minutes, 0, milliseconds);
        }


        return new Order({
            tableId: row.ID,
            waiterName,
            createdAt: time,
            items: content,
            waiterId: row.APPUSER,
            delivery: this.toDeliveryData(row)
        });
    }

    private toDeliveryData(row: DeliveryRow): NonNullable<Order['Delivery']> | null {
        if (row.customer_name === null && row.phone === null && row.address === null && row.delivery_fee === null) {
            return null;
        }

        return {
            customerName: row.customer_name,
            phone: row.phone,
            address: row.address,
            deliveryFee: Number(row.delivery_fee ?? 0)
        };
    }
    async deleteByTableId(tableId: string): Promise<void> {
        const connection = await this.dbPool.getConnection();
        try {
            await connection.beginTransaction();
            await connection.execute('DELETE FROM SHAREDTICKETS WHERE ID = ?', [tableId]);
            await connection.execute('DELETE FROM delivery_orders WHERE ticket_id = ?', [tableId]);
            await connection.execute('DELETE FROM KITCHEN_TICKETS WHERE id = ?', [tableId]);
            await this.clearTableOccupancy(connection, tableId);
            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    async moveActiveOrder(currentTableId: string, newTableId: string): Promise<void> {
        const connection = await this.dbPool.getConnection();
        try {
            await connection.beginTransaction();

            const [places] = await connection.execute<MovePlaceRow[]>(
                `SELECT ID, NAME
                 FROM PLACES
                 WHERE ID IN (?, ?)
                 ORDER BY ID
                 FOR UPDATE`,
                [currentTableId, newTableId]
            );
            if (places.length !== 2) {
                throw new OrderOperationError(
                    'No se encontró la mesa de origen o destino.',
                    'TABLE_NOT_FOUND'
                );
            }

            const [tickets] = await connection.execute<MoveSharedTicketRow[]>(
                `SELECT ID, NAME, APPUSER, CONTENT, PICKUPID
                 FROM SHAREDTICKETS
                 WHERE ID IN (?, ?)
                 ORDER BY ID
                 FOR UPDATE`,
                [currentTableId, newTableId]
            );
            const sourceTicket = tickets.find((ticket) => ticket.ID === currentTableId);
            if (!sourceTicket) {
                throw new OrderOperationError(
                    'No hay una orden activa en el puesto de origen.',
                    'ORDER_NOT_FOUND'
                );
            }
            if (tickets.some((ticket) => ticket.ID === newTableId)) {
                throw new OrderOperationError(
                    'El puesto de destino ya tiene una orden activa.',
                    'TARGET_OCCUPIED'
                );
            }

            const orderItems = await this.javaTicketService.parseJavaTicket<OrderItem[]>(
                sourceTicket.CONTENT
            );
            if (!Array.isArray(orderItems) || orderItems.length === 0) {
                throw new OrderOperationError(
                    'La orden no contiene productos válidos para trasladar.',
                    'MOVE_INCONSISTENT'
                );
            }

            const [deliveryRows] = await connection.execute<MoveDeliveryRow[]>(
                `SELECT customer_name, phone, address, delivery_fee
                 FROM delivery_orders
                 WHERE ticket_id = ?
                 FOR UPDATE`,
                [currentTableId]
            );

            const [kitchenTickets] = await connection.execute<MoveKitchenTicketRow[]>(
                `SELECT id
                 FROM KITCHEN_TICKETS
                 WHERE table_id = ?
                 FOR UPDATE`,
                [currentTableId]
            );
            if (kitchenTickets.length > 1) {
                throw new OrderOperationError(
                    'Se encontraron varias comandas de cocina asociadas al puesto.',
                    'MOVE_INCONSISTENT'
                );
            }

            const kitchenTicketId = kitchenTickets[0]?.id;
            const kitchenItemIdMap = new Map<string, string>();
            if (kitchenTicketId) {
                const [kitchenItems] = await connection.execute<KitchenItemIdRow[]>(
                    `SELECT id
                     FROM KITCHEN_ITEMS
                     WHERE ticket_id = ?
                     FOR UPDATE`,
                    [kitchenTicketId]
                );
                for (const item of orderItems) {
                    const lineId = item.lineId ?? item.productId;
                    kitchenItemIdMap.set(
                        kitchenItemId(kitchenTicketId, lineId),
                        kitchenItemId(newTableId, lineId)
                    );
                }
                if (kitchenItems.some((item) => !kitchenItemIdMap.has(item.id))) {
                    throw new OrderOperationError(
                        'No se pudieron asociar todos los productos de cocina a la orden.',
                        'MOVE_INCONSISTENT'
                    );
                }
            }

            if (deliveryRows.length > 0) {
                await connection.execute(
                    'DELETE FROM delivery_orders WHERE ticket_id = ?',
                    [currentTableId]
                );
            }

            await connection.execute(
                'UPDATE SHAREDTICKETS SET ID = ? WHERE ID = ?',
                [newTableId, currentTableId]
            );

            if (deliveryRows.length > 0) {
                const delivery = deliveryRows[0];
                await connection.execute(
                    `INSERT INTO delivery_orders
                        (ticket_id, customer_name, phone, address, delivery_fee)
                     VALUES (?, ?, ?, ?, ?)`,
                    [
                        newTableId,
                        delivery.customer_name,
                        delivery.phone,
                        delivery.address,
                        delivery.delivery_fee
                    ]
                );
            }

            if (kitchenTicketId) {
                await connection.execute(
                    `UPDATE KITCHEN_TICKETS
                     SET id = ?, table_id = ?, updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?`,
                    [newTableId, newTableId, kitchenTicketId]
                );
                for (const [oldItemId, newItemId] of kitchenItemIdMap) {
                    await connection.execute(
                        `UPDATE KITCHEN_ITEMS
                         SET id = ?
                         WHERE ticket_id = ? AND id = ?`,
                        [newItemId, newTableId, oldItemId]
                    );
                }
            }

            await connection.execute(
                `UPDATE PLACES
                 SET TICKETID = NULL, OCCUPIED = NULL, WAITER = NULL
                 WHERE ID = ?`,
                [currentTableId]
            );
            await connection.execute(
                `UPDATE PLACES
                 SET TICKETID = ?, OCCUPIED = CURRENT_TIMESTAMP, WAITER = ?
                 WHERE ID = ?`,
                [newTableId, extractWaiterName(sourceTicket.NAME), newTableId]
            );

            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    async payActiveOrder(
        tableId: string,
        paymentMethod: UniCentaPaymentMethod,
        amountReceived: number
    ): Promise<PaidOrderResult> {
        const connection = await this.dbPool.getConnection();
        try {
            await connection.beginTransaction();

            const [places] = await connection.execute<PayPlaceRow[]>(
                'SELECT ID, NAME FROM PLACES WHERE ID = ? FOR UPDATE',
                [tableId]
            );
            const place = places[0];
            if (!place) {
                throw new OrderOperationError('No se encontró el puesto.', 'TABLE_NOT_FOUND');
            }

            const [tickets] = await connection.execute<PaySharedTicketRow[]>(
                `SELECT ID, NAME, APPUSER, CONTENT
                 FROM SHAREDTICKETS
                 WHERE ID = ?
                 FOR UPDATE`,
                [tableId]
            );
            const activeTicket = tickets[0];
            if (!activeTicket) {
                throw new OrderOperationError(
                    'No hay una orden activa para cobrar en este puesto.',
                    'ORDER_NOT_FOUND'
                );
            }

            const items = await this.javaTicketService.parseJavaTicket<OrderItem[]>(
                activeTicket.CONTENT
            );
            if (!Array.isArray(items) || items.length === 0) {
                throw new OrderOperationError(
                    'La orden no contiene productos válidos para cobrar.',
                    'INVALID_PAYMENT'
                );
            }
            for (const item of items) {
                if (
                    !item.productId ||
                    !Number.isFinite(item.price) ||
                    item.price < 0 ||
                    !Number.isFinite(item.quantity) ||
                    item.quantity <= 0 ||
                    !Array.isArray(item.taxes) ||
                    !item.taxes[0]?.taxId
                ) {
                    throw new OrderOperationError(
                        'La orden tiene un producto, precio, cantidad o impuesto no válido.',
                        'INVALID_PAYMENT'
                    );
                }
            }

            const productSubtotal = roundCurrency(items.reduce(
                (sum, item) => sum + item.price * item.quantity,
                0
            ));
            const [deliveryRows] = await connection.execute<PayDeliveryRow[]>(
                `SELECT customer_name, phone, address, delivery_fee
                 FROM delivery_orders
                 WHERE ticket_id = ?
                 FOR UPDATE`,
                [tableId]
            );
            const delivery = deliveryRows[0];
            const deliveryFee = roundCurrency(Number(delivery?.delivery_fee ?? 0));
            const customerTotal = productSubtotal + deliveryFee;
            if (amountReceived < customerTotal) {
                throw new OrderOperationError(
                    'El valor recibido no alcanza para cubrir el total del pedido.',
                    'INVALID_PAYMENT'
                );
            }
            if (paymentMethod === 'bank' && amountReceived !== customerTotal) {
                throw new OrderOperationError(
                    'Para Nequi, registra exactamente el total recibido del cliente.',
                    'INVALID_PAYMENT'
                );
            }

            const productIds = [...new Set(items.map((item) => item.productId))];
            const productPlaceholders = productIds.map(() => '?').join(', ');
            const [products] = await connection.execute<PayProductRow[]>(
                `SELECT P.ID AS product_id, P.NAME AS product_name,
                        P.REFERENCE AS reference, P.CODE AS code,
                        P.CATEGORY AS category_id, P.PRINTTO AS printer,
                        T.ID AS tax_id, T.CATEGORY AS tax_category_id
                 FROM PRODUCTS AS P
                 INNER JOIN TAXES AS T ON T.CATEGORY = P.TAXCAT
                 WHERE P.ID IN (${productPlaceholders})`,
                productIds
            );
            const productByIdAndTax = new Map(
                products.map((product) => [
                    `${product.product_id}:${product.tax_id}`,
                    product
                ])
            );
            for (const item of items) {
                if (!productByIdAndTax.has(`${item.productId}:${item.taxes[0].taxId}`)) {
                    throw new OrderOperationError(
                        `El producto ${item.productName} o su impuesto ya no existe en UniCenta.`,
                        'PRODUCT_NOT_FOUND'
                    );
                }
            }

            const [cashRows] = await connection.execute<PayCashRow[]>(
                `SELECT money
                 FROM closedcash
                 WHERE dateend IS NULL
                 FOR UPDATE`
            );
            if (cashRows.length !== 1) {
                throw new OrderOperationError(
                    cashRows.length === 0
                        ? 'Abre la caja en UniCenta antes de registrar ventas desde AdriPOS.'
                        : 'Hay más de una caja abierta en UniCenta; no se puede determinar dónde registrar la venta.',
                    'NO_OPEN_CASH'
                );
            }

            const [counterRows] = await connection.execute<PayCounterRow[]>(
                'SELECT * FROM ticketsnum FOR UPDATE'
            );
            const hasConfiguredPriorities = counterRows.some(
                (row) => row.priority !== undefined || row.status !== undefined
            );
            const counters = hasConfiguredPriorities
                ? counterRows.filter(
                    (row) => row.priority === 'alternative' && row.status === 'Active'
                )
                : counterRows;
            if (counters.length !== 1) {
                throw new OrderOperationError(
                    'No se pudo determinar una secuencia única de tickets en UniCenta.',
                    'TICKET_NUMBER_UNAVAILABLE'
                );
            }
            const counter = counters[0];
            const currentTicketNumber = Number(counter.id);
            if (!Number.isSafeInteger(currentTicketNumber) || currentTicketNumber < 0) {
                throw new OrderOperationError(
                    'La secuencia de tickets de UniCenta contiene un número no válido.',
                    'TICKET_NUMBER_UNAVAILABLE'
                );
            }
            const nextTicketNumber = currentTicketNumber + 1;
            const ticketCode = counter.serie
                ? `${counter.serie}-${nextTicketNumber}`
                : String(nextTicketNumber);
            const receiptId = randomUUID();
            const change = paymentMethod === 'cash'
                ? amountReceived - customerTotal
                : 0;

            const receiptAttributes = propertiesXml([
                ['adri.pos.source', 'AdriPOS'],
                ['adri.pos.tableName', place.NAME],
                ['adri.pos.serviceMode', /domicilio/i.test(place.NAME) ? 'DELIVERY' : 'DINE_IN'],
                ['adri.pos.paymentMethod', paymentMethod === 'cash' ? 'Efectivo' : 'Nequi'],
                ['adri.pos.productsSubtotal', productSubtotal],
                ['adri.pos.deliveryFee', deliveryFee],
                ['adri.pos.customerTotal', customerTotal],
                ['adri.pos.amountReceived', amountReceived],
                ['adri.pos.change', change],
                ['adri.pos.customerName', delivery?.customer_name],
                ['adri.pos.customerPhone', delivery?.phone],
                ['adri.pos.deliveryAddress', delivery?.address]
            ]);

            const [receiptColumnRows] = await connection.execute<PayColumnRow[]>(
                'SHOW COLUMNS FROM receipts'
            );
            const receiptColumns = new Set(receiptColumnRows.map(({ Field }) => Field));
            const requiredReceiptColumns = ['id', 'money', 'datenew'];
            if (requiredReceiptColumns.some((column) => !receiptColumns.has(column))) {
                throw new OrderOperationError(
                    'La tabla receipts de UniCenta no contiene las columnas necesarias para registrar ventas.',
                    'TICKET_NUMBER_UNAVAILABLE'
                );
            }
            const receiptValues = new Map<string, string | number | Buffer | null>([
                ['id', receiptId],
                ['money', cashRows[0].money],
                ['TABLEID', place.ID],
                ['TABLENAME', place.NAME],
                ['datenew', null],
                ['attributes', receiptAttributes],
                ['person', activeTicket.APPUSER]
            ]);
            const insertReceiptColumns = [...receiptValues.keys()].filter(
                (column) => receiptColumns.has(column)
            );
            const receiptPlaceholders = insertReceiptColumns.map(
                (column) => column === 'datenew' ? 'CURRENT_TIMESTAMP' : '?'
            );
            const insertReceiptValues = insertReceiptColumns
                .filter((column) => column !== 'datenew')
                .map((column) => receiptValues.get(column) ?? null);
            await connection.execute(
                `INSERT INTO receipts (${insertReceiptColumns.join(', ')})
                 VALUES (${receiptPlaceholders.join(', ')})`,
                insertReceiptValues
            );
            const [ticketColumnRows] = await connection.execute<PayColumnRow[]>(
                'SHOW COLUMNS FROM tickets'
            );
            const ticketColumns = new Set(ticketColumnRows.map(({ Field }) => Field));
            const requiredTicketColumns = ['id', 'tickettype', 'ticketid', 'person'];
            if (requiredTicketColumns.some((column) => !ticketColumns.has(column))) {
                throw new OrderOperationError(
                    'La tabla tickets de UniCenta no contiene las columnas necesarias para registrar ventas.',
                    'TICKET_NUMBER_UNAVAILABLE'
                );
            }

            const ticketValues = new Map<string, string | number | null>([
                ['id', receiptId],
                ['tickettype', 0],
                ['ticketid', nextTicketNumber],
                ['person', activeTicket.APPUSER],
                ['customer', null],
                ['status', 0],
                ['serie_number', counter.serie ? ticketCode : null],
                ['code', counter.code ?? null],
                ['cufe', null],
                ['tickets_id', null]
            ]);
            const insertTicketColumns = [...ticketValues.keys()].filter(
                (column) => ticketColumns.has(column)
            );
            const insertTicketValues = insertTicketColumns.map(
                (column) => ticketValues.get(column) ?? null
            );
            await connection.execute(
                `INSERT INTO tickets (${insertTicketColumns.join(', ')})
                 VALUES (${insertTicketColumns.map(() => '?').join(', ')})`,
                insertTicketValues
            );

            for (const [line, item] of items.entries()) {
                const product = productByIdAndTax.get(`${item.productId}:${item.taxes[0].taxId}`)!;
                const lineAttributes = propertiesXml([
                    ['product.taxcategoryid', product.tax_category_id],
                    ['product.warranty', 'false'],
                    ['product.memodate', '1900-01-01 00:00:01'],
                    ['product.verpatrib', 'false'],
                    ['product.reference', product.reference],
                    ['product.name', product.product_name],
                    ['product.service', 'false'],
                    ['product.com', 'false'],
                    ['product.code', product.code],
                    ['product.constant', 'false'],
                    ['ticket.updated', 'true'],
                    ['product.categoryid', product.category_id],
                    ['product.printer', product.printer ?? '1'],
                    ['product.vprice', 'false'],
                    ['notes', item.notes ?? null],
                    ['lineId', item.lineId ?? null],
                    ['takeaway', item.takeaway ? 'true' : null]
                ]);
                await connection.execute(
                    `INSERT INTO ticketlines
                        (ticket, line, product, attributesetinstance_id,
                         units, price, taxid, attributes)
                     VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
                    [
                        receiptId,
                        line,
                        item.productId,
                        item.quantity,
                        item.price,
                        item.taxes[0].taxId,
                        lineAttributes
                    ]
                );
            }

            const [paymentColumnRows] = await connection.execute<PayColumnRow[]>(
                'SHOW COLUMNS FROM payments'
            );
            const paymentColumns = new Set(paymentColumnRows.map(({ Field }) => Field));
            const requiredPaymentColumns = ['id', 'receipt', 'payment', 'total'];
            if (requiredPaymentColumns.some((column) => !paymentColumns.has(column))) {
                throw new OrderOperationError(
                    'La tabla payments de UniCenta no contiene las columnas necesarias para registrar pagos.',
                    'TICKET_NUMBER_UNAVAILABLE'
                );
            }
            const paymentValues = new Map<string, string | number | Buffer | null>([
                ['id', randomUUID()],
                ['receipt', receiptId],
                ['payment', paymentMethod],
                ['total', productSubtotal],
                ['tip', 0],
                ['transid', paymentMethod === 'cash' ? 'no ID' : null],
                ['isprocessed', 0],
                ['returnmsg', Buffer.from('Aceptar', 'utf8')],
                ['notes', paymentMethod === 'bank' ? 'Nequi registrado desde AdriPOS' : 'AdriPOS'],
                ['tendered', productSubtotal],
                ['cardname', null],
                ['voucher', null],
                ['days_to_pay', 0]
            ]);
            const insertPaymentColumns = [...paymentValues.keys()].filter(
                (column) => paymentColumns.has(column)
            );
            await connection.execute(
                `INSERT INTO payments (${insertPaymentColumns.join(', ')})
                 VALUES (${insertPaymentColumns.map(() => '?').join(', ')})`,
                insertPaymentColumns.map((column) => paymentValues.get(column) ?? null)
            );
            const [kitchenTickets] = await connection.execute<PayKitchenTicketRow[]>(
                `SELECT id
                 FROM KITCHEN_TICKETS
                 WHERE id = ?
                 FOR UPDATE`,
                [tableId]
            );
            if (kitchenTickets.length > 1) {
                throw new OrderOperationError(
                    'Hay varias comandas de cocina asociadas a este puesto; el cobro fue cancelado.',
                    'MOVE_INCONSISTENT'
                );
            }
            const kitchenTicketId = kitchenTickets[0]?.id ?? null;
            if (kitchenTicketId) {
                const archivedTicketId = randomUUID();
                await connection.execute(
                    `UPDATE KITCHEN_TICKETS
                     SET id = ?, updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?`,
                    [archivedTicketId, kitchenTicketId]
                );
            }

            await connection.execute('DELETE FROM delivery_orders WHERE ticket_id = ?', [tableId]);
            const [deletedTicket] = await connection.execute<ResultSetHeader>(
                'DELETE FROM SHAREDTICKETS WHERE ID = ?',
                [tableId]
            );
            if (deletedTicket.affectedRows !== 1) {
                throw new OrderOperationError(
                    'La orden cambió mientras se procesaba el cobro. No se creó una venta duplicada.',
                    'ORDER_NOT_FOUND'
                );
            }
            await connection.execute(
                'UPDATE PLACES SET TICKETID = NULL, OCCUPIED = NULL, WAITER = NULL WHERE ID = ?',
                [tableId]
            );

            const [counterUpdate] = counter.code
                ? await connection.execute<ResultSetHeader>(
                    'UPDATE ticketsnum SET id = ? WHERE code = ? AND id = ?',
                    [nextTicketNumber, counter.code, currentTicketNumber]
                )
                : await connection.execute<ResultSetHeader>(
                    'UPDATE ticketsnum SET id = ? WHERE id = ?',
                    [nextTicketNumber, currentTicketNumber]
                );
            if (counterUpdate.affectedRows !== 1) {
                throw new OrderOperationError(
                    'No se pudo reservar el siguiente número de ticket en UniCenta.',
                    'TICKET_NUMBER_UNAVAILABLE'
                );
            }

            await connection.commit();
            return {
                receiptId,
                ticketCode,
                paymentMethod,
                productSubtotal,
                deliveryFee,
                customerTotal,
                amountReceived,
                change
            };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }


    async findItemCreatedAt(tableId: string, lineId: string): Promise<Date | null> {
        const [rows] = await this.dbPool.execute<KitchenItemCreatedAtRow[]>(
            `SELECT created_at
             FROM KITCHEN_ITEMS
             WHERE ticket_id = ? AND id = ?`,
            [tableId, kitchenItemId(tableId, lineId)]
        );
        if (rows.length === 0) return null;

        const createdAt = new Date(rows[0].created_at);
        return Number.isNaN(createdAt.getTime()) ? null : createdAt;
    }

    async cancelActiveByTableId(tableId: string): Promise<void> {
        const connection = await this.dbPool.getConnection();
        try {
            await connection.beginTransaction();
            const [tickets] = await connection.execute<SharedTicketIdRow[]>(
                'SELECT ID FROM SHAREDTICKETS WHERE ID = ? FOR UPDATE',
                [tableId]
            );
            if (tickets.length === 0) {
                throw new OrderOperationError(
                    'No hay una orden activa para cancelar en este puesto.',
                    'ORDER_NOT_FOUND'
                );
            }

            await connection.execute('DELETE FROM SHAREDTICKETS WHERE ID = ?', [tableId]);
            await connection.execute('DELETE FROM delivery_orders WHERE ticket_id = ?', [tableId]);
            await connection.execute('DELETE FROM KITCHEN_TICKETS WHERE id = ?', [tableId]);
            await this.clearTableOccupancy(connection, tableId);
            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    async removeItemByTableId(tableId: string, lineId: string): Promise<void> {
        const connection = await this.dbPool.getConnection();
        try {
            await connection.beginTransaction();
            const ticket = await this.loadEditableTicket(connection, tableId);
            const itemIndex = ticket.items.findIndex((item) => (item.lineId ?? item.productId) === lineId);
            if (itemIndex === -1) {
                throw new OrderOperationError(
                    'El producto no existe en la orden activa.',
                    'ITEM_NOT_FOUND'
                );
            }
            const itemId = kitchenItemId(tableId, lineId);
            const remainingItems = ticket.items.filter((item) => (item.lineId ?? item.productId) !== lineId);

            if (remainingItems.length === 0) {
                await connection.execute('DELETE FROM SHAREDTICKETS WHERE ID = ?', [tableId]);
                await connection.execute('DELETE FROM delivery_orders WHERE ticket_id = ?', [tableId]);
                await connection.execute('DELETE FROM KITCHEN_TICKETS WHERE id = ?', [tableId]);
                await this.clearTableOccupancy(connection, tableId);
            } else {
                const updatedContent = await this.serializeTicket(
                    tableId,
                    ticket,
                    remainingItems
                );
                await connection.execute(
                    'UPDATE SHAREDTICKETS SET CONTENT = ? WHERE ID = ?',
                    [updatedContent, tableId]
                );
                await connection.execute(
                    'DELETE FROM KITCHEN_ITEMS WHERE ticket_id = ? AND id = ?',
                    [tableId, itemId]
                );
                const [remainingKitchenItems] = await connection.execute<KitchenItemIdRow[]>(
                    'SELECT id FROM KITCHEN_ITEMS WHERE ticket_id = ? LIMIT 1',
                    [tableId]
                );
                if (remainingKitchenItems.length === 0) {
                    await connection.execute('DELETE FROM KITCHEN_TICKETS WHERE id = ?', [tableId]);
                }
            }
            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    private async clearTableOccupancy(
        connection: PoolConnection,
        tableId: string
    ): Promise<void> {
        await connection.execute(
            'UPDATE PLACES SET TICKETID = NULL, OCCUPIED = NULL, WAITER = NULL WHERE ID = ?',
            [tableId]
        );
    }

    async updateItemNotesByTableId(
        tableId: string,
        lineId: string,
        notes: string
    ): Promise<void> {
        const connection = await this.dbPool.getConnection();
        try {
            await connection.beginTransaction();
            const ticket = await this.loadEditableTicket(connection, tableId);
            const item = ticket.items.find((line) => (line.lineId ?? line.productId) === lineId);
            if (!item) {
                throw new OrderOperationError(
                    'El producto no existe en la orden activa.',
                    'ITEM_NOT_FOUND'
                );
            }

            const itemId = kitchenItemId(tableId, lineId);
            const [itemRows] = await connection.execute<KitchenItemCreatedAtRow[]>(
                `SELECT created_at FROM KITCHEN_ITEMS
                 WHERE ticket_id = ? AND id = ? FOR UPDATE`,
                [tableId, itemId]
            );
            if (itemRows.length === 0) {
                throw new OrderOperationError(
                    'No se puede editar la nota porque el producto no tiene registro de cocina.',
                    'NOTE_EDIT_UNAVAILABLE'
                );
            }
            if (!canEditKitchenNote(new Date(itemRows[0].created_at))) {
                throw new OrderOperationError(
                    'Ya pasaron los 10 minutos disponibles para editar esta nota.',
                    'NOTE_EDIT_WINDOW_EXPIRED'
                );
            }

            const updatedItems = ticket.items.map((line) =>
                (line.lineId ?? line.productId) === lineId
                    ? { ...line, notes: notes.trim() || undefined }
                    : line
            );
            const kitchenNotes = item.takeaway
                ? `PARA LLEVAR${notes.trim() ? ` · ${notes.trim()}` : ''}`
                : notes.trim() || null;
            const updatedContent = await this.serializeTicket(tableId, ticket, updatedItems);
            await connection.execute(
                'UPDATE SHAREDTICKETS SET CONTENT = ? WHERE ID = ?',
                [updatedContent, tableId]
            );
            await connection.execute(
                `UPDATE KITCHEN_ITEMS
                 SET notes = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE ticket_id = ? AND id = ?`,
                [kitchenNotes, tableId, itemId]
            );
            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    private async loadEditableTicket(
        connection: PoolConnection,
        tableId: string
    ): Promise<{ waiterName: string; waiterId: string; createdAt: Date; items: OrderItem[] }> {
        const [rows] = await connection.execute<EditableTicketRow[]>(
            `SELECT NAME, CONTENT, APPUSER
             FROM SHAREDTICKETS
             WHERE ID = ?
             FOR UPDATE`,
            [tableId]
        );
        if (rows.length === 0) {
            throw new OrderOperationError(
                'No hay una orden activa para este puesto.',
                'ORDER_NOT_FOUND'
            );
        }
        const row = rows[0];
        const match = row.NAME.match(/^(.+) - \((\d{1,2}):(\d{2}) (\d{1,3})\)$/);
        const createdAt = new Date();
        let waiterName = row.NAME;
        if (match) {
            waiterName = match[1];
            createdAt.setHours(Number(match[2]), Number(match[3]), 0, Number(match[4]));
        }

        return {
            waiterName,
            waiterId: row.APPUSER,
            createdAt,
            items: await this.javaTicketService.parseJavaTicket<OrderItem[]>(row.CONTENT)
        };
    }

    private async serializeTicket(
        tableId: string,
        ticket: { waiterName: string; waiterId: string; createdAt: Date },
        items: OrderItem[]
    ): Promise<Buffer> {
        const order = new Order({
            tableId,
            waiterName: ticket.waiterName,
            waiterId: ticket.waiterId,
            createdAt: ticket.createdAt,
            items
        });
        return this.javaTicketService.generateJavaTicket(buildJavaTicketPayload(order));
    }

    async save(order: Order): Promise<void> {

        const connection: PoolConnection =
            await this.dbPool.getConnection();

        try {

            await connection.beginTransaction();

            // Nos aseguramos de trabajar con un Date.
            const createdAt =
                order.createdAt instanceof Date
                    ? order.createdAt
                    : new Date(order.createdAt);

            if (Number.isNaN(createdAt.getTime())) {
                throw new Error(
                    'createdAt no contiene una fecha válida'
                );
            }

            const formatedName = `${order.waiterName} - (${createdAt
                .toLocaleTimeString('es-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                })} ${createdAt.getMilliseconds()})`;


            const content_blob = await this.javaTicketService.generateJavaTicket(
                buildJavaTicketPayload(order)
            );

            const upsertOrderQuery = `
                INSERT INTO SHAREDTICKETS
                    (id, name, content, appuser)
                VALUES
                    (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    name = VALUES(name),
                    content = VALUES(content)
            `;

            await connection.execute(upsertOrderQuery, [
                order.TableId,
                formatedName,
                content_blob,
                order.waiterId
            ]);

            if (order.Delivery == null) {
                await connection.execute(
                    'DELETE FROM delivery_orders WHERE ticket_id = ?',
                    [order.TableId]
                );
            } else {
                const delivery = order.Delivery;
                await connection.execute(
                    `INSERT INTO delivery_orders
                        (ticket_id, customer_name, phone, address, delivery_fee)
                     VALUES (?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE
                        customer_name = VALUES(customer_name),
                        phone = VALUES(phone),
                        address = VALUES(address),
                        delivery_fee = VALUES(delivery_fee)`,
                    [
                        order.TableId,
                        delivery.customerName || null,
                        delivery.phone || null,
                        delivery.address || null,
                        delivery.deliveryFee
                    ]
                );
            }

            await connection.commit();

        } catch (error) {

            await connection.rollback();

            throw new Error(
                `Error en la transacción en la Base De Datos: ${error instanceof Error
                    ? error.message
                    : 'Error desconocido'
                }`
            );

        } finally {

            connection.release();

        }
    }

}
