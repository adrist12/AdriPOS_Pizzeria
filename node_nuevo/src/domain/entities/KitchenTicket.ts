import { KitchenItem } from './KitchenItem.js';
import { TicketStatus, KitchenStation } from './kitchenEnums.js';

export interface KitchenTicketProps {
  ticketId: string;
  tableId: string;
  tableName?: string;
  waiterName: string;
  status?: TicketStatus;
  createdAt?: Date;
  updatedAt?: Date;
  items?: KitchenItem[];
}

export class KitchenTicket {
  public readonly ticketId: string;
  private tableId: string;
  public readonly tableName: string;
  public readonly waiterName: string;
  public readonly createdAt: Date;
  public updatedAt: Date;
  private ticketStatus: TicketStatus;
  private kitchenItems: KitchenItem[];

  constructor(props: KitchenTicketProps) {
    if (!props.tableId || props.tableId.trim() === '') {
      throw new Error('El ID de la mesa es obligatorio');
    }

    this.ticketId = props.ticketId;
    this.tableId = props.tableId;
    this.tableName = props.tableName ?? props.tableId;
    this.waiterName = props.waiterName;
    this.createdAt = props.createdAt ? new Date(props.createdAt) : new Date();
    this.updatedAt = props.updatedAt ? new Date(props.updatedAt) : new Date();
    this.ticketStatus = props.status || TicketStatus.PENDING;
    this.kitchenItems = props.items || [];
  }

  public get TableId(): string {
    return this.tableId;
  }

  public get Status(): TicketStatus {
    return this.ticketStatus;
  }

  public get Items(): KitchenItem[] {
    return [...this.kitchenItems];
  }

  public changeTable(newTableId: string): void {
    if (!newTableId || newTableId.trim() === '') {
      throw new Error('El ID de la nueva mesa es inválido');
    }
    this.tableId = newTableId;
  }

  public addItem(newItem: KitchenItem): void {
    if (newItem.quantity <= 0) {
      throw new Error('La cantidad del producto debe ser mayor a 0');
    }

    // Se busca directamente sobre la lista privada para mutar la entidad real
    const existing = this.kitchenItems.find(item => item.itemId === newItem.itemId);
    
    if (existing) {
      existing.quantity += newItem.quantity;
      existing.updatedAt = new Date();
    } else {
      this.kitchenItems.push(newItem);
    }
  }

  public removeItem(itemId: string): void {
    const index = this.kitchenItems.findIndex(item => item.itemId === itemId);
    
    if (index === -1) {
      throw new Error('El producto no se encuentra en la comanda de cocina.');
    }

    // Se elimina el elemento del arreglo en lugar de poner la cantidad en 0
    this.kitchenItems.splice(index, 1);
  }

  public getItemsByStation(station: KitchenStation): KitchenItem[] {
    return this.kitchenItems.filter(item => item.station === station);
  }
}