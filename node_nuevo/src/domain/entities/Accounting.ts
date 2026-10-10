export interface AccountingPaymentAccount {
    id: number;
    name: string;
}

export interface AccountingMovementType {
    id: number;
    name: string;
}

export interface AccountingPaymentSummary {
    account: string;
    type: string;
    total: number;
}

export interface AccountingSummary {
    period: string;
    income: number;
    expenses: number;
    balance: number;
    byPaymentAccount: AccountingPaymentSummary[];
}

export interface AccountingMovementDetail {
    id: number;
    date: string;
    type: string;
    typeId: number;
    cashAccountId: number | null;
    amount: number;
    concept: string | null;
    account: string;
    cashAccount: string;
    origin: string;
}

export interface AccountingCashDetail {
    name: string;
    income: number;
    movements: AccountingMovementDetail[];
    expenses: AccountingMovementDetail[];
    totalExpenses: number;
}

export interface ManualAccountingMovement {
    typeId: number;
    cashAccountId: number;
    concept: string;
    amount: number;
    date: string;
}

export type UpdateAccountingMovement = ManualAccountingMovement;

export interface DeliveryTableSales {
    tableName: string;
    sales: number;
}

export interface DeliverySalesSummary {
    period: string;
    totalSales: number;
    byTable: DeliveryTableSales[];
}

export interface AccountingSyncResult {
    synced: number;
    skipped: number;
}
