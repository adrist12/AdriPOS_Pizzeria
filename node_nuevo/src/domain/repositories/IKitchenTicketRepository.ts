import { KitchenTicket } from '../entities/KitchenTicket.js';
import { KitchenStation, ItemStatus } from '../entities/kitchenEnums.js';

export interface IKitchenRepository {
    /**
     * Guarda una comanda de cocina y sus ítems en la base de datos MySQL (con transacción)
     */
    save(ticket: KitchenTicket): Promise<void>;

    /**
     * Obtiene los tickets activos filtrados por una estación KDS
     */
    findActiveByStation(station: KitchenStation): Promise<KitchenTicket[]| null>;

    /**
     * Actualiza el estado de un ítem en la base de datos
     */
    updateItemStatus(ticketId: string, itemId: string, status: ItemStatus): Promise<void>;

    /**
     * Actualiza la mesa en todos los tickets activos de cocina al mover comanda
     */
    updateTableByActiveTickets(currentTableId: string, newTableId: string): Promise<void>;
}