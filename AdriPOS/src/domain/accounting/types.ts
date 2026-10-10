export interface AccountingPaymentAccount {
  id: number
  name: string
}

export interface AccountingMovementType {
  id: number
  name: string
}

export interface AccountingSummary {
  period: string
  income: number
  expenses: number
  balance: number
  byPaymentAccount: Array<{
    account: string
    type: string
    total: number
  }>
}

export interface AccountingMovement {
  id: number
  date: string
  type: string
  typeId: number
  cashAccountId: number | null
  amount: number
  concept: string | null
  account: string
  cashAccount: string
  origin: string
}

export interface AccountingCashDetail {
  name: string
  income: number
  movements: AccountingMovement[]
  expenses: AccountingMovement[]
  totalExpenses: number
}

export type AccountingMovementDetails = Record<string, AccountingCashDetail>

export interface ManualAccountingMovement {
  typeId: number
  cashAccountId: number
  concept: string
  amount: number
  date: string
}

export interface UpdateAccountingMovement extends ManualAccountingMovement {
  date: string
  password: string
}

export interface AccountingSyncResult {
  synced: number
  skipped: number
}

export interface AccountingDeliverySalesSummary {
  period: string
  totalSales: number
  byTable: Array<{
    tableName: string
    sales: number
  }>
}
