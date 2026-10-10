import type { Pool, RowDataPacket } from 'mysql2/promise';
import type {
    AccountingCashDetail,
    AccountingMovementDetail,
    AccountingMovementType,
    AccountingPaymentAccount,
    AccountingSummary,
    AccountingSyncResult,
    DeliveryTableSales,
    ManualAccountingMovement,
    UpdateAccountingMovement
} from '../../../domain/entities/Accounting.js';
import { OrderOperationError } from '../../../domain/errors/OrderOperationError.js';
import type { IAccountingRepository } from '../../../domain/repositories/IAccountingRepository.js';

interface PaymentAccountRow extends RowDataPacket {
    id: number;
    name: string;
}

interface MovementTypeRow extends RowDataPacket {
    id: number;
    name: string;
}

interface SummaryRow extends RowDataPacket {
    income: number | string | null;
    expenses: number | string | null;
}

interface PaymentSummaryRow extends RowDataPacket {
    account: string;
    type: string;
    total: number | string;
}

interface MovementRow extends RowDataPacket {
    id: number;
    date: Date | string;
    type: string;
    typeId: number;
    cashAccountId: number | null;
    amount: number | string;
    concept: string | null;
    account: string;
    cashAccount: string | null;
    origin: string;
}

interface IdRow extends RowDataPacket {
    id: number;
    name?: string;
}

interface ColumnRow extends RowDataPacket {
    Field: string;
}

interface DeliverySalesRow extends RowDataPacket {
    tableName: string;
    sales: number | string;
}

interface UniCentaSaleRow extends RowDataPacket {
    receiptId: string;
    date: Date | string;
    amount: number | string;
    paymentMethods: string | null;
}

export class MySqlAccountingRepository implements IAccountingRepository {
    constructor(
        private readonly accountingPool: Pool,
        private readonly uniCentaPool: Pool
    ) {}

    async getPaymentAccounts(): Promise<AccountingPaymentAccount[]> {
        const [rows] = await this.accountingPool.execute<PaymentAccountRow[]>(
            `SELECT DISTINCT c.id, c.nombre AS name
             FROM pos_metodos_map AS mapping
             INNER JOIN cont_cajas AS c ON c.id = mapping.caja_id
             ORDER BY c.nombre`
        );
        return rows.map((row) => ({ id: Number(row.id), name: row.name }));
    }

    async getMovementTypes(): Promise<AccountingMovementType[]> {
        const [rows] = await this.accountingPool.execute<MovementTypeRow[]>(
            'SELECT id, nombre AS name FROM tipo_movimiento ORDER BY nombre'
        );
        return rows.map((row) => ({ id: Number(row.id), name: row.name }));
    }

    async getSummary(
        startDate: string,
        endDateExclusive: string,
        period: string
    ): Promise<AccountingSummary> {
        const [[totals], [paymentRows]] = await Promise.all([
            this.accountingPool.execute<SummaryRow[]>(
                `SELECT
                    COALESCE(SUM(CASE WHEN UPPER(t.nombre) = 'INGRESO' THEN m.monto ELSE 0 END), 0) AS income,
                    COALESCE(SUM(CASE WHEN UPPER(t.nombre) = 'EGRESO' THEN m.monto ELSE 0 END), 0) AS expenses
                 FROM cont_movimientos AS m
                 LEFT JOIN tipo_movimiento AS t ON t.id = m.tipo_id
                 WHERE m.fecha >= ? AND m.fecha < ?`,
                [startDate, endDateExclusive]
            ),
            this.accountingPool.execute<PaymentSummaryRow[]>(
                `SELECT
                    COALESCE(c.nombre, 'SIN ASIGNAR') AS account,
                    COALESCE(t.nombre, 'SIN TIPO') AS type,
                    SUM(m.monto) AS total
                 FROM cont_movimientos AS m
                 LEFT JOIN cont_cajas AS c ON c.id = m.caja_id
                 LEFT JOIN tipo_movimiento AS t ON t.id = m.tipo_id
                 WHERE m.fecha >= ? AND m.fecha < ?
                 GROUP BY c.id, c.nombre, t.id, t.nombre
                 ORDER BY account, type`,
                [startDate, endDateExclusive]
            )
        ]);
        const income = Number(totals[0]?.income ?? 0);
        const expenses = Number(totals[0]?.expenses ?? 0);
        return {
            period,
            income,
            expenses,
            balance: income - expenses,
            byPaymentAccount: paymentRows.map((row) => ({
                account: row.account,
                type: row.type,
                total: Number(row.total)
            }))
        };
    }

    async getMovementDetails(
        startDate: string,
        endDateExclusive: string
    ): Promise<Record<string, AccountingCashDetail>> {
        const [rows] = await this.accountingPool.execute<MovementRow[]>(
            `SELECT
                m.id,
                m.fecha AS date,
                COALESCE(t.nombre, 'SIN TIPO') AS type,
                m.tipo_id AS typeId,
                m.caja_id AS cashAccountId,
                m.monto AS amount,
                m.concepto AS concept,
                c.nombre AS account,
                cj.nombre AS cashAccount,
                COALESCE(m.origen, 'MANUAL') AS origin
             FROM cont_movimientos AS m
             INNER JOIN cont_cuentas AS c ON c.id = m.cuenta_id
             LEFT JOIN cont_cajas AS cj ON cj.id = m.caja_id
             LEFT JOIN tipo_movimiento AS t ON t.id = m.tipo_id
             WHERE m.fecha >= ? AND m.fecha < ?
             ORDER BY cj.nombre, t.nombre DESC, m.fecha DESC, m.id DESC`,
            [startDate, endDateExclusive]
        );
        const details: Record<string, AccountingCashDetail> = {};
        for (const row of rows) {
            const cashAccount = row.cashAccount ?? 'SIN ASIGNAR';
            const detail = details[cashAccount] ??= {
                name: cashAccount,
                income: 0,
                movements: [],
                expenses: [],
                totalExpenses: 0
            };
            const movement: AccountingMovementDetail = {
                id: Number(row.id),
                date: row.date instanceof Date ? row.date.toISOString() : row.date,
                type: row.type,
                typeId: Number(row.typeId),
                cashAccountId: row.cashAccountId === null ? null : Number(row.cashAccountId),
                amount: Number(row.amount),
                concept: row.concept,
                account: row.account,
                cashAccount,
                origin: row.origin
            };
            if (row.type.toUpperCase() === 'INGRESO') {
                detail.income += movement.amount;
            } else {
                detail.expenses.push(movement);
                detail.totalExpenses += movement.amount;
            }
            detail.movements.push(movement);
        }
        return details;
    }

    async getDeliverySalesSummary(
        startDate: string,
        endDateExclusive: string
    ): Promise<DeliveryTableSales[]> {
        const [columns] = await this.uniCentaPool.execute<ColumnRow[]>(
            'SHOW COLUMNS FROM RECEIPTS'
        );
        const receiptColumnNames = new Set(columns.map(({ Field }) => Field.toUpperCase()));
        const hasTableName = receiptColumnNames.has('TABLENAME');
        const hasAttributes = receiptColumnNames.has('ATTRIBUTES');
        if (!hasTableName && !hasAttributes) {
            throw new OrderOperationError(
                'UniCenta no tiene receipts.TABLENAME ni receipts.ATTRIBUTES; no es posible identificar las ventas de domicilios.',
                'ACCOUNTING_SCHEMA_UNAVAILABLE'
            );
        }

        const deliveryConditions = [
            ...(hasTableName ? ["LOWER(COALESCE(r.TABLENAME, '')) LIKE '%domicilio%'"] : []),
            ...(hasAttributes
                ? ["LOWER(CAST(r.ATTRIBUTES AS CHAR)) LIKE '%<entry key=\"adri.pos.servicemode\">delivery</entry>%'"]
                : [])
        ];
        const tableNameExpression = hasTableName && hasAttributes
            ? `CASE WHEN LOWER(COALESCE(r.TABLENAME, '')) LIKE '%domicilio%'
                   THEN COALESCE(NULLIF(TRIM(r.TABLENAME), ''), 'Domicilio')
                   ELSE 'Domicilio (AdriPOS)' END`
            : hasTableName
                ? "COALESCE(NULLIF(TRIM(r.TABLENAME), ''), 'Domicilio')"
                : "'Domicilio (AdriPOS)'";
        const [rows] = await this.uniCentaPool.execute<DeliverySalesRow[]>(
            `SELECT
                ${tableNameExpression} AS tableName,
                COUNT(*) AS sales
             FROM RECEIPTS AS r
             INNER JOIN (
                SELECT RECEIPT, SUM(TOTAL) AS receiptTotal
                FROM PAYMENTS
                GROUP BY RECEIPT
                HAVING SUM(TOTAL) > 0
             ) AS paid ON paid.RECEIPT = r.ID
             WHERE (${deliveryConditions.join(' OR ')})
               AND r.DATENEW >= ? AND r.DATENEW < ?
             GROUP BY tableName
             ORDER BY sales DESC, tableName`,
            [startDate, endDateExclusive]
        );
        return rows.map((row) => ({
            tableName: row.tableName,
            sales: Number(row.sales)
        }));
    }

    async recordManualMovement(movement: ManualAccountingMovement): Promise<void> {
        const [types] = await this.accountingPool.execute<MovementTypeRow[]>(
            'SELECT id, nombre AS name FROM tipo_movimiento WHERE id = ?',
            [movement.typeId]
        );
        const movementType = types[0]?.name?.toUpperCase();
        if (movementType !== 'INGRESO' && movementType !== 'EGRESO') {
            throw new OrderOperationError('El tipo de movimiento no existe.', 'INVALID_ACCOUNTING');
        }

        const accountName = movementType === 'INGRESO' ? 'VENTAS' : 'GASTOS';
        const [accounts] = await this.accountingPool.execute<IdRow[]>(
            'SELECT id FROM cont_cuentas WHERE UPPER(nombre) = ? LIMIT 1',
            [accountName]
        );
        if (!accounts[0]) {
            throw new OrderOperationError(
                `No está configurada la cuenta contable ${accountName}.`,
                'INVALID_ACCOUNTING'
            );
        }
        const [cashAccounts] = await this.accountingPool.execute<IdRow[]>(
            'SELECT id FROM cont_cajas WHERE id = ?',
            [movement.cashAccountId]
        );
        if (!cashAccounts[0]) {
            throw new OrderOperationError('La caja seleccionada no existe.', 'INVALID_ACCOUNTING');
        }
        await this.accountingPool.execute(
            `INSERT INTO cont_movimientos
                (fecha, tipo_id, cuenta_id, caja_id, concepto, monto, origen)
             VALUES (?, ?, ?, ?, ?, ?, 'MANUAL')`,
            [
                movement.date,
                movement.typeId,
                accounts[0].id,
                movement.cashAccountId,
                movement.concept,
                movement.amount
            ]
        );
    }

    async syncUniCentaSales(
        startDate: string,
        endDateInclusive: string
    ): Promise<AccountingSyncResult> {
        const [accountRows] = await this.accountingPool.execute<IdRow[]>(
            `SELECT id FROM cont_cuentas WHERE UPPER(nombre) = 'VENTAS' LIMIT 1`
        );
        if (!accountRows[0]) {
            throw new OrderOperationError(
                'No está configurada la cuenta contable VENTAS.',
                'INVALID_ACCOUNTING'
            );
        }
        const [typeRows] = await this.accountingPool.execute<MovementTypeRow[]>(
            `SELECT id, nombre AS name
             FROM tipo_movimiento
             WHERE UPPER(nombre) = 'INGRESO'
             LIMIT 1`
        );
        if (!typeRows[0]) {
            throw new OrderOperationError(
                'No está configurado el tipo de movimiento INGRESO.',
                'INVALID_ACCOUNTING'
            );
        }
        const [sales] = await this.uniCentaPool.execute<UniCentaSaleRow[]>(
            `SELECT
                r.ID AS receiptId,
                r.DATENEW AS date,
                SUM(p.TOTAL) AS amount,
                GROUP_CONCAT(DISTINCT p.PAYMENT ORDER BY p.PAYMENT SEPARATOR ',') AS paymentMethods
             FROM RECEIPTS AS r
             INNER JOIN PAYMENTS AS p ON p.RECEIPT = r.ID
             WHERE r.DATENEW >= ? AND r.DATENEW < DATE_ADD(?, INTERVAL 1 DAY)
             GROUP BY r.ID, r.DATENEW
             ORDER BY r.DATENEW, r.ID`,
            [startDate, endDateInclusive]
        );

        let synced = 0;
        let skipped = 0;
        for (const sale of sales) {
            const firstPaymentMethod = sale.paymentMethods?.split(',')[0]?.trim();
            if (!firstPaymentMethod || Number(sale.amount) <= 0) {
                skipped++;
                continue;
            }
            const [mappings] = await this.accountingPool.execute<IdRow[]>(
                `SELECT DISTINCT caja_id AS id
                 FROM pos_metodos_map
                 WHERE pos_codigo = ?`,
                [firstPaymentMethod]
            );
            const cashAccountIds = [...new Set(mappings.map(({ id }) => Number(id)))];
            if (cashAccountIds.length !== 1) {
                skipped++;
                continue;
            }
            try {
                const [result] = await this.accountingPool.execute(
                    `INSERT INTO cont_movimientos
                        (fecha, tipo_id, cuenta_id, caja_id, monto, concepto, origen, referencia)
                     VALUES (DATE(?), ?, ?, ?, ?, ?, 'POS', ?)`,
                    [
                        sale.date,
                        typeRows[0].id,
                        accountRows[0].id,
                        cashAccountIds[0],
                        Number(sale.amount),
                        `Recibo #${sale.receiptId}`,
                        sale.receiptId
                    ]
                );
                if ('affectedRows' in result && result.affectedRows === 1) synced++;
                else skipped++;
            } catch (error) {
                if (
                    typeof error === 'object' &&
                    error !== null &&
                    'code' in error &&
                    error.code === 'ER_DUP_ENTRY'
                ) {
                    skipped++;
                    continue;
                }
                throw error;
            }
        }

        return { synced, skipped };
    }

    async updateMovement(id: number, movement: UpdateAccountingMovement): Promise<void> {
        const [types] = await this.accountingPool.execute<MovementTypeRow[]>(
            'SELECT id, nombre AS name FROM tipo_movimiento WHERE id = ?',
            [movement.typeId]
        );
        const movementType = types[0]?.name?.toUpperCase();
        if (movementType !== 'INGRESO' && movementType !== 'EGRESO') {
            throw new OrderOperationError('El tipo de movimiento no existe.', 'INVALID_ACCOUNTING');
        }

        const accountName = movementType === 'INGRESO' ? 'VENTAS' : 'GASTOS';
        const [accounts] = await this.accountingPool.execute<IdRow[]>(
            'SELECT id FROM cont_cuentas WHERE UPPER(nombre) = ? LIMIT 1',
            [accountName]
        );
        if (!accounts[0]) {
            throw new OrderOperationError(
                `No está configurada la cuenta contable ${accountName}.`,
                'INVALID_ACCOUNTING'
            );
        }

        const [cashAccounts] = await this.accountingPool.execute<IdRow[]>(
            'SELECT id FROM cont_cajas WHERE id = ?',
            [movement.cashAccountId]
        );
        if (!cashAccounts[0]) {
            throw new OrderOperationError(
                'El método de pago seleccionado no existe.',
                'INVALID_ACCOUNTING'
            );
        }

        const [existingRows] = await this.accountingPool.execute<IdRow[]>(
            'SELECT id FROM cont_movimientos WHERE id = ?',
            [id]
        );
        if (!existingRows[0]) {
            throw new OrderOperationError('El movimiento ya no existe.', 'ORDER_NOT_FOUND');
        }

        await this.accountingPool.execute(
            `UPDATE cont_movimientos
             SET fecha = ?, tipo_id = ?, cuenta_id = ?, caja_id = ?, concepto = ?, monto = ?
             WHERE id = ?`,
            [
                movement.date,
                movement.typeId,
                accounts[0].id,
                movement.cashAccountId,
                movement.concept,
                movement.amount,
                id
            ]
        );
    }
}
