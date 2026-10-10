import { IKitchenRepository } from "../../../domain/repositories/IKitchenTicketRepository.js";
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { KitchenItem } from "../../../domain/entities/KitchenItem.js";
import { KitchenTicket } from "../../../domain/entities/KitchenTicket.js";
import { ItemStatus, KitchenStation } from "../../../domain/entities/kitchenEnums.js";

export class MySqlKitchenRepository implements IKitchenRepository {
    constructor(
        private readonly dbPool: Pool
    ) { }
    /**
     * Obtiene las comandas que todavía tienen trabajo pendiente en una
     * estación concreta de cocina.
     *
     * La relación entre `KITCHEN_TICKETS` y `KITCHEN_ITEMS` es de uno a
     * muchos, por lo que MySQL devuelve una fila por cada ítem. Esta función
     * agrupa esas filas por ticket y reconstruye las entidades del dominio,
     * evitando exponer directamente el formato de la base de datos al resto
     * de la aplicación.
     *
     * Se seleccionan los tickets con al menos un ítem pendiente o en proceso
     * en la estación solicitada. Una vez seleccionado el ticket, se cargan
     * todos sus ítems activos para mostrar la comanda completa.
     *
     * @param station Estación de cocina cuyos ítems activos se desean obtener.
     * @returns Los tickets agrupados con sus ítems, o `null` si no hay trabajo.
     */
    async findActiveByStation(station: KitchenStation): Promise<KitchenTicket[] | null> {
        interface KitchenTicketRow extends RowDataPacket {
            ticket_id: string;
            table_id: string;
            table_name: string | null;
            waiter_name: string;
            ticket_status: KitchenTicket['Status'];
            ticket_created_at: Date;
            ticket_updated_at: Date;
            item_id: string;
            item_name: string;
            item_quantity: number;
            item_station: KitchenStation;
            item_status: ItemStatus;
            item_notes: string | null;
            item_created_at: Date;
            item_updated_at: Date;
        }

        const query = `
            SELECT
                T.id AS ticket_id,
                T.table_id,
                P.NAME AS table_name,
                T.waiter_name,
                T.status AS ticket_status,
                T.created_at AS ticket_created_at,
                T.updated_at AS ticket_updated_at,
                I.id AS item_id,
                I.product_name AS item_name,
                I.quantity AS item_quantity,
                I.station AS item_station,
                I.status AS item_status,
                I.notes AS item_notes,
                I.created_at AS item_created_at,
                I.updated_at AS item_updated_at
            FROM KITCHEN_TICKETS AS T
            INNER JOIN KITCHEN_ITEMS AS I ON T.id = I.ticket_id
            LEFT JOIN PLACES AS P ON P.ID = T.table_id
            WHERE EXISTS (
                SELECT 1
                FROM KITCHEN_ITEMS AS MATCHING_ITEM
                WHERE MATCHING_ITEM.ticket_id = T.id
                  AND MATCHING_ITEM.station = ?
                  AND MATCHING_ITEM.status IN ('PENDING', 'IN_PROGRESS')
            )
              AND I.status IN ('PENDING', 'IN_PROGRESS', 'READY')
            ORDER BY T.created_at ASC, I.created_at ASC
        `;

        const [rows] = await this.dbPool.execute<KitchenTicketRow[]>(query, [station]);

        // Si ningún ticket tiene trabajo en esta estación, se conserva el contrato null.
        if (rows.length === 0) {
            return null;
        }

        // La clave del mapa evita crear un ticket nuevo por cada ítem recibido.
        const ticketsById = new Map<string, KitchenTicket>();

        for (const row of rows) {
            let ticket = ticketsById.get(row.ticket_id);

            if (!ticket) {
                ticket = new KitchenTicket({
                    ticketId: row.ticket_id,
                    tableId: row.table_id,
                    tableName: row.table_name ?? row.table_id,
                    waiterName: row.waiter_name,
                    status: row.ticket_status,
                    createdAt: row.ticket_created_at,
                    updatedAt: row.ticket_updated_at
                });
                ticketsById.set(row.ticket_id, ticket);
            }

            // El JOIN garantiza que cada fila contiene un ítem válido.
            ticket.addItem(new KitchenItem({
                itemId: row.item_id,
                ticketId: row.ticket_id,
                itemName: row.item_name,
                quantity: row.item_quantity,
                station: row.item_station,
                status: row.item_status,
                notes: row.item_notes,
                createdAt: row.item_created_at,
                updatedAt: row.item_updated_at
            }));
        }

        return Array.from(ticketsById.values());
    }
    /**
     * Guarda una comanda completa y sus ítems dentro de una única transacción.
     *
     * Se utiliza `INSERT ... ON DUPLICATE KEY UPDATE` para que el método sirva
     * tanto para crear una comanda como para actualizar una ya existente. La
     * transacción garantiza que no quede guardado el ticket sin sus ítems, o
     * viceversa, si alguna operación falla.
     *
     * @param ticket Comanda de cocina que se creará o actualizará.
     * @throws Error si la fecha de creación no es válida o falla alguna
     * operación de la base de datos.
     */
    async save(ticket: KitchenTicket): Promise < void> {
            const connection: PoolConnection = await this.dbPool.getConnection();

            try {
                await connection.beginTransaction();
                //Asegurar que se trabaja con un Date
                const createdAt =
                    ticket.createdAt instanceof Date
                        ? ticket.createdAt
                        : new Date(ticket.createdAt)

            if(Number.isNaN(createdAt.getTime())) {
            throw new Error(
                'createdAt no contiene una fecha válida'
            );
        }

        const upsertTicketQuery = `
                INSERT INTO KITCHEN_TICKETS
                    (id, table_id, waiter_name, status, created_at, updated_at)
                VALUES
                    (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    status = VALUES(status),
                    updated_at = VALUES(updated_at),
                    table_id = VALUES(table_id)
            `;
        await connection.execute(upsertTicketQuery, [
            ticket.ticketId,
            ticket.TableId,
            ticket.waiterName,
            ticket.Status,
            ticket.createdAt,
            ticket.updatedAt
        ])
        const upsertItemQuery = `
                INSERT INTO KITCHEN_ITEMS
                    (id, ticket_id, product_name, quantity, station, status, notes, created_at, updated_at)
                VALUES
                    (?, ?, ?, ?,?, ?, ?, ?,?)
                ON DUPLICATE KEY UPDATE
                    status = VALUES(status),
                    updated_at = VALUES(updated_at),
                    quantity = VALUES(quantity),
                    notes = VALUES (notes)
            `;
        const items = ticket.Items
        for (let index = 0; index < items.length; index++) {
            const element = items[index];
            await connection.execute(upsertItemQuery, [
                element.itemId,
                element.ticketId,
                element.itemName,
                element.quantity,
                element.station,
                element.status,
                element.notes || null,
                element.createdAt,
                element.updatedAt
            ])
        }
        await connection.commit();

    } catch(error) {
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
    /**
     * Cambia el estado de un ítem específico de cocina.
     *
     * El filtro usa tanto `item_id` como `ticket_id` para impedir que un ítem
     * con un identificador incorrecto o perteneciente a otra comanda sea
     * modificado accidentalmente.
     *
     * @param ticketId Identificador de la comanda a la que pertenece el ítem.
     * @param itemId Identificador del ítem que se actualizará.
     * @param status Nuevo estado del ítem.
     * @throws Error si los identificadores están vacíos o el ítem no existe
     * dentro de la comanda indicada.
     */
    async updateItemStatus(ticketId: string, itemId: string, status: ItemStatus): Promise < void> {
        if (!ticketId.trim() || !itemId.trim()) {
            throw new Error('El ID del ticket y del ítem son obligatorios');
        }

        const query = `
            UPDATE KITCHEN_ITEMS
            SET status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND ticket_id = ?
        `;
        const [result] = await this.dbPool.execute<ResultSetHeader>(query, [
            status,
            itemId,
            ticketId
        ]);

        if (result.affectedRows === 0) {
            throw new Error(`No existe el ítem ${itemId} en el ticket ${ticketId}`);
        }
    }

    /**
     * Cambia la mesa de todas las comandas de cocina que siguen activas.
     *
     * Solo se actualizan tickets `PENDING` o `IN_PROGRESS`; los tickets
     * completados conservan la mesa histórica en la que fueron atendidos.
     * La consulta se ejecuta de forma masiva para que todos los tickets
     * activos de la mesa origen reciban exactamente el mismo cambio.
     *
     * @param currentTableId Identificador actual de la mesa.
     * @param newTableId Identificador de la nueva mesa.
     * @throws Error si alguno de los identificadores está vacío o las mesas
     * son iguales.
     */
    async updateTableByActiveTickets(currentTableId: string, newTableId: string): Promise < void> {
        if (!currentTableId.trim() || !newTableId.trim()) {
            throw new Error('Los IDs de las mesas son obligatorios');
        }

        if (currentTableId === newTableId) {
            throw new Error('La mesa de origen y destino no pueden ser la misma');
        }

        const query = `
            UPDATE KITCHEN_TICKETS
            SET table_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE table_id = ?
              AND status IN ('PENDING', 'IN_PROGRESS')
        `;
        await this.dbPool.execute<ResultSetHeader>(query, [newTableId, currentTableId]);
    }
}