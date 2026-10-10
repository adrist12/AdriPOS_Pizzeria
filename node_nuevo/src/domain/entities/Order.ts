//interface sirve para definir una variable que cosas debe tener
export interface DeliveryData {
    customerName: string | null;
    phone: string | null;
    address: string | null;
    deliveryFee: number;
}

export interface OrderItem {
    lineId?: string;
    productId: string;
    productName: string;
    price: number;
    quantity: number;
    notes?: string;
    takeaway?: boolean;
    taxes: TaxInfo[];
}
export interface TaxInfo {
    taxId: string;
    name: string;
    rate: number;
    cascade: boolean;
    categoryId: string;
}

//las propiedades de una orden
export interface OrderProps {
    orderId?: string;
    tableId: string;
    waiterName: string;
    createdAt: Date;
    items: OrderItem[];
    waiterId: string;
    delivery?: DeliveryData | null;
}
export class Order {
    public readonly orderId?: string;
    //no estan como readonly debido a que la mesa puede cambiar, por ende se deja como private 
    private tableId: string;
    public readonly waiterName: string;
    public readonly createdAt: Date;
    //no esta como readonly debido a que pueden añadirse items a un pedido luego de ser creado 
    private items: OrderItem[];
    public readonly waiterId: string;
    private deliveryData: DeliveryData | null | undefined;

    constructor(props: OrderProps) {
        if (!props.tableId || props.tableId.trim() === '') {
            throw new Error('El ID de la mesa es obligatorio.')
        }

        this.orderId = props.orderId;
        this.tableId = props.tableId;
        this.waiterName = props.waiterName
        this.createdAt = props.createdAt ? new Date(props.createdAt) : new Date();
        this.items = props.items;
        if (this.items.some((item) => Array.from(item.notes ?? '').length > 255)) {
            throw new Error('Las notas de cocina no pueden superar 255 caracteres.');
        }
        this.waiterId = props.waiterId;
        if (
            props.delivery &&
            (!Number.isFinite(props.delivery.deliveryFee) || props.delivery.deliveryFee < 0)
        ) {
            throw new Error('La tarifa de domicilio debe ser un número igual o mayor a 0');
        }
        this.deliveryData = props.delivery;
    }
    public get TableId(): string {
        return this.tableId;
    }

    public set TableId(newTableId: string) {
        if (!newTableId || newTableId.trim() === '') {
            throw new Error('El ID de la mesa no puede estar vacío');
        }
        this.tableId = newTableId;
    }

    public get Items(): OrderItem[] {
        return [...this.items];
    }

    public get Delivery(): DeliveryData | null | undefined {
        return this.deliveryData;
    }

    public set Delivery(delivery: DeliveryData | null | undefined) {
        this.deliveryData = delivery;
    }

    public calculateTotal(): number {
        return this.items.reduce((total, item) => total + item.price * item.quantity, 0);
    }

    public addItem(newItem: OrderItem): void {
        if (newItem.quantity <= 0) {
            throw new Error('La cantidad del producto debe ser mayor a 0');
        }

        const existing = this.items.find(item =>
            item.productId === newItem.productId &&
            item.notes === newItem.notes &&
            Boolean(item.takeaway) === Boolean(newItem.takeaway)
        );

        if (existing) {
            existing.quantity += newItem.quantity;
        } else {
            this.items.push(newItem);
        }
    }

    public removeItem(productId: string): void {
        const index = this.items.findIndex(item => item.productId === productId);

        if (index === -1) {
            throw new Error('El producto no se encuentra en la comanda.');
        }

        this.items.splice(index, 1);
    }

    public changeTable(newTableId: string): void {
        if (!newTableId || newTableId.trim() === '') {
            throw new Error('El ID de la nueva mesa es inválido');
        }
        this.tableId = newTableId;
    }

    public mergeItems(newItems: OrderItem[]): void {
        if (!newItems || newItems.length === 0) return;

        for (const item of newItems) {
            this.addItem(item);
        }
    }
}