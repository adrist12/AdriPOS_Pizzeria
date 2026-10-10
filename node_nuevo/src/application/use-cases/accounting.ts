import { OrderOperationError } from '../../domain/errors/OrderOperationError.js';
import type {
    DeliverySalesSummary,
    ManualAccountingMovement,
    UpdateAccountingMovement
} from '../../domain/entities/Accounting.js';
import type { IAccountingRepository } from '../../domain/repositories/IAccountingRepository.js';
import { verifyAccountingEditPassword } from '../../infrastructure/security/accountingEditPassword.js';

function parseInteger(value: unknown, label: string): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new OrderOperationError(`${label} no válido.`, 'INVALID_ACCOUNTING');
    }
    return parsed;
}

function parseDate(value: unknown, label: string): string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new OrderOperationError(`${label} debe tener formato AAAA-MM-DD.`, 'INVALID_ACCOUNTING');
    }
    const [year, month, day] = value.split('-').map(Number);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (
        candidate.getUTCFullYear() !== year ||
        candidate.getUTCMonth() !== month - 1 ||
        candidate.getUTCDate() !== day
    ) {
        throw new OrderOperationError(`${label} no es una fecha válida.`, 'INVALID_ACCOUNTING');
    }
    return value;
}

function nextDate(value: string): string {
    const [year, month, day] = value.split('-').map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    return next.toISOString().slice(0, 10);
}

function monthlyDateRange(monthValue: unknown, yearValue: unknown) {
    const month = Number(monthValue);
    const year = parseInteger(yearValue, 'Año');
    if (!Number.isInteger(month) || month < 0 || month > 12) {
        throw new OrderOperationError('Mes debe estar entre 0 y 12.', 'INVALID_ACCOUNTING');
    }
    if (year < 2000 || year > 2200) {
        throw new OrderOperationError('Año fuera del rango permitido.', 'INVALID_ACCOUNTING');
    }
    const startDate = `${year}-${String(month || 1).padStart(2, '0')}-01`;
    const endDateExclusive = month === 0
        ? `${year + 1}-01-01`
        : month === 12
            ? `${year + 1}-01-01`
            : `${year}-${String(month + 1).padStart(2, '0')}-01`;
    return {
        startDate,
        endDateExclusive,
        period: month === 0 ? String(year) : `${year}-${String(month).padStart(2, '0')}`
    };
}

export class AccountingUseCases {
    constructor(
        private readonly repository: IAccountingRepository,
        private readonly editPassword: string | undefined = process.env.ACCOUNTING_EDIT_PASSWORD
    ) {}

    getPaymentAccounts() {
        return this.repository.getPaymentAccounts();
    }

    getMovementTypes() {
        return this.repository.getMovementTypes();
    }

    async getMonthlySummary(monthValue: unknown, yearValue: unknown) {
        const range = monthlyDateRange(monthValue, yearValue);
        return this.repository.getSummary(range.startDate, range.endDateExclusive, range.period);
    }

    async getMovementDetails(monthValue: unknown, yearValue: unknown) {
        const range = monthlyDateRange(monthValue, yearValue);
        return this.repository.getMovementDetails(range.startDate, range.endDateExclusive);
    }

    async getDeliverySalesSummary(monthValue: unknown, yearValue: unknown): Promise<DeliverySalesSummary> {
        const range = monthlyDateRange(monthValue, yearValue);
        const byTable = await this.repository.getDeliverySalesSummary(
            range.startDate,
            range.endDateExclusive
        );
        return {
            period: range.period,
            totalSales: byTable.reduce((total, table) => total + table.sales, 0),
            byTable
        };
    }

    async recordManualMovement(input: {
        typeId: unknown;
        cashAccountId: unknown;
        concept: unknown;
        amount: unknown;
        date: unknown;
    }): Promise<void> {
        if (typeof input.concept !== 'string' || !input.concept.trim() || input.concept.trim().length > 255) {
            throw new OrderOperationError(
                'El concepto debe tener entre 1 y 255 caracteres.',
                'INVALID_ACCOUNTING'
            );
        }
        const amount = typeof input.amount === 'number' ? input.amount : Number(input.amount);
        if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999999.99) {
            throw new OrderOperationError('El monto debe ser mayor que cero y válido.', 'INVALID_ACCOUNTING');
        }
        const movement: ManualAccountingMovement = {
            typeId: parseInteger(input.typeId, 'Tipo de movimiento'),
            cashAccountId: parseInteger(input.cashAccountId, 'Caja'),
            concept: input.concept.trim(),
            amount,
            date: parseDate(input.date, 'Fecha')
        };
        await this.repository.recordManualMovement(movement);
    }

    async updateMovement(input: {
        id: unknown;
        typeId: unknown;
        cashAccountId: unknown;
        concept: unknown;
        amount: unknown;
        date: unknown;
        password: unknown;
    }): Promise<void> {
        if (!verifyAccountingEditPassword(input.password, this.editPassword)) {
            throw new OrderOperationError(
                'La contraseña de autorización es incorrecta.',
                'INVALID_ACCOUNTING'
            );
        }
        if (
            typeof input.concept !== 'string' ||
            !input.concept.trim() ||
            input.concept.trim().length > 255
        ) {
            throw new OrderOperationError(
                'La descripción debe tener entre 1 y 255 caracteres.',
                'INVALID_ACCOUNTING'
            );
        }
        const amount = typeof input.amount === 'number' ? input.amount : Number(input.amount);
        if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999999.99) {
            throw new OrderOperationError(
                'El monto debe ser mayor que cero y válido.',
                'INVALID_ACCOUNTING'
            );
        }
        const movement: UpdateAccountingMovement = {
            typeId: parseInteger(input.typeId, 'Tipo de movimiento'),
            cashAccountId: parseInteger(input.cashAccountId, 'Método de pago'),
            concept: input.concept.trim(),
            amount,
            date: parseDate(input.date, 'Fecha')
        };
        await this.repository.updateMovement(
            parseInteger(input.id, 'Movimiento'),
            movement
        );
    }

    async syncUniCentaSales(input: { startDate: unknown; endDate: unknown }) {
        const startDate = parseDate(input.startDate, 'Fecha inicial');
        const endDate = parseDate(input.endDate, 'Fecha final');
        if (startDate > endDate) {
            throw new OrderOperationError(
                'La fecha inicial no puede ser posterior a la fecha final.',
                'INVALID_ACCOUNTING'
            );
        }
        const dayCount = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`))
            / 86_400_000 + 1;
        if (dayCount > 366) {
            throw new OrderOperationError('El rango no puede superar 366 días.', 'INVALID_ACCOUNTING');
        }
        return this.repository.syncUniCentaSales(startDate, endDate);
    }
}

export function accountingEndDateExclusive(endDate: string): string {
    return nextDate(endDate);
}
