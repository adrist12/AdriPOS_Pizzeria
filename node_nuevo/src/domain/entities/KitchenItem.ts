import { KitchenStation, ItemStatus } from './kitchenEnums.js';

export interface KitchenItemProps {
  itemId: string;
  ticketId: string;
  itemName: string;
  quantity: number;
  station: KitchenStation;
  status?: ItemStatus;
  notes?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export class KitchenItem {
  public readonly itemId: string;
  public readonly ticketId: string;
  public readonly itemName: string;
  public quantity: number;
  public readonly station: KitchenStation;
  private itemStatus: ItemStatus;
  public readonly notes: string | null;
  public readonly createdAt: Date;
  public updatedAt: Date;

  constructor(props: KitchenItemProps) {
    if (props.quantity <= 0) {
      throw new Error('La cantidad del ítem debe ser mayor a 0');
    }

    this.itemId = props.itemId;
    this.ticketId = props.ticketId;
    this.itemName = props.itemName;
    this.quantity = props.quantity;
    this.station = props.station;
    this.itemStatus = props.status || ItemStatus.PENDING;
    this.notes = props.notes || null;
    this.createdAt = props.createdAt ? new Date(props.createdAt) : new Date();
    this.updatedAt = props.updatedAt ? new Date(props.updatedAt) : new Date();
  }

  public get status(): ItemStatus {
    return this.itemStatus;
  }

  public markAsReady(): void {
    this.itemStatus = ItemStatus.READY;
    this.updatedAt = new Date();
  }
}