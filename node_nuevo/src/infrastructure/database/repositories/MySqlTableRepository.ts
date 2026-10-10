import type { Pool, RowDataPacket } from 'mysql2/promise';
import { Table } from '../../../domain/entities/Table.js';
import { ITableRepository } from '../../../domain/repositories/ITableRepository.js';

interface TableRow extends RowDataPacket {
    ID: string;
    NAME: string;
    FLOOR: string;
    WAITER: string | null;
    TICKETID: string | null;
    OCCUPIED: Date | null;
}

export class MySqlTableRepository implements ITableRepository {
    constructor(private readonly dbPool: Pool) { }

    async findById(tableId: string): Promise<Table | null> {
        const query = `
            SELECT
                T.ID, T.NAME, T.FLOOR,
                ST.ID AS TICKETID,
                CASE WHEN ST.ID IS NULL THEN NULL ELSE T.WAITER END AS WAITER,
                CASE WHEN ST.ID IS NULL THEN NULL ELSE T.OCCUPIED END AS OCCUPIED
            FROM PLACES AS T
            LEFT JOIN SHAREDTICKETS AS ST ON ST.ID = T.ID
            WHERE T.ID = ?
        `;
        const [rows] = await this.dbPool.execute<TableRow[]>(query, [tableId]);
        if (rows.length === 0) return null;

        const row = rows[0];
        return new Table(
            row.ID,
            row.NAME,
            row.FLOOR,
            row.WAITER,
            row.TICKETID,
            row.OCCUPIED
        );
    }

    async findAll(): Promise<Table[]> {
        const query = `
            SELECT
                T.ID, T.NAME, T.FLOOR,
                ST.ID AS TICKETID,
                CASE WHEN ST.ID IS NULL THEN NULL ELSE T.WAITER END AS WAITER,
                CASE WHEN ST.ID IS NULL THEN NULL ELSE T.OCCUPIED END AS OCCUPIED
            FROM PLACES AS T
            LEFT JOIN SHAREDTICKETS AS ST ON ST.ID = T.ID
            ORDER BY T.FLOOR, LENGTH(T.NAME), T.NAME;
        `;
        const [rows] = await this.dbPool.execute<TableRow[]>(query);

        return rows.map((row) => new Table(
            row.ID,
            row.NAME,
            row.FLOOR,
            row.WAITER,
            row.TICKETID,
            row.OCCUPIED
        ));
    }

    async findByFloor(floorId: string): Promise<Table[]> {
        const query = `
            SELECT
                T.ID, T.NAME, T.FLOOR,
                ST.ID AS TICKETID,
                CASE WHEN ST.ID IS NULL THEN NULL ELSE T.WAITER END AS WAITER,
                CASE WHEN ST.ID IS NULL THEN NULL ELSE T.OCCUPIED END AS OCCUPIED
            FROM PLACES AS T
            LEFT JOIN SHAREDTICKETS AS ST ON ST.ID = T.ID
            WHERE T.FLOOR = ?
            ORDER BY LENGTH(T.NAME) ASC;
        `;
        const [rows] = await this.dbPool.execute<TableRow[]>(
            query,
            [floorId]
        );

        return rows.map((row) => new Table(
            row.ID,
            row.NAME,
            row.FLOOR,
            row.WAITER,
            row.TICKETID,
            row.OCCUPIED
        ));
    }
}