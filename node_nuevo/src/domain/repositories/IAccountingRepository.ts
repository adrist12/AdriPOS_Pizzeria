import type {
    AccountingCashDetail,
    AccountingMovementType,
    AccountingPaymentAccount,
    AccountingSummary,
    AccountingSyncResult,
    DeliveryTableSales,
    ManualAccountingMovement,
    UpdateAccountingMovement
} from '../entities/Accounting.js';

export interface IAccountingRepository {
    getPaymentAccounts(): Promise<AccountingPaymentAccount[]>;
    getMovementTypes(): Promise<AccountingMovementType[]>;
    getSummary(startDate: string, endDateExclusive: string, period: string): Promise<AccountingSummary>;
    getMovementDetails(startDate: string, endDateExclusive: string): Promise<Record<string, AccountingCashDetail>>;
    getDeliverySalesSummary(startDate: string, endDateExclusive: string): Promise<DeliveryTableSales[]>;
    recordManualMovement(movement: ManualAccountingMovement): Promise<void>;
    updateMovement(id: number, movement: UpdateAccountingMovement): Promise<void>;
    syncUniCentaSales(startDate: string, endDateInclusive: string): Promise<AccountingSyncResult>;
}
