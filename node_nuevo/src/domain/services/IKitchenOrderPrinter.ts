export interface KitchenPrintItem {
    productName: string;
    quantity: number;
    unitPrice: number;
    notes?: string;
    takeaway?: boolean;
}

export interface KitchenPrintOrder {
    tableName: string;
    waiterName: string;
    createdAt: string;
    customerName: string | null;
    customerPhone: string | null;
    deliveryAddress: string | null;
    deliveryFee: number;
    items: KitchenPrintItem[];
}

export interface IKitchenOrderPrinter {
    print(order: KitchenPrintOrder): Promise<void>;
}
