import type { Pool, RowDataPacket } from 'mysql2/promise';
import { User } from '../../../domain/entities/User.js';
import { IUserRepository } from '../../../domain/repositories/IUserRepository.js';

export interface UserRow  extends RowDataPacket{
    ID: string;
    NAME: string;
    CARD: string | null;
    ROLE: string;
    VISIBLE: number | boolean;
}

export class MySqlLoginRepository implements IUserRepository {
    constructor(private readonly dbpool: Pool) { }

    async findByName(name: string): Promise<User | null> {
        const query = `
            SELECT ID, NAME, CARD, ROLE, VISIBLE
            FROM PEOPLE
            WHERE NAME = ? AND VISIBLE = 1
        `;

        const [rows] = await this.dbpool.execute<UserRow[]>(query, [name]);

        if (rows.length === 0) {
            return null;
        }

        const row = rows[0];
        const storedPasswordHash =  row.CARD || null;
        return new User(
            row.ID,
            row.NAME,
            storedPasswordHash,
            row.ROLE,
            Boolean(row.VISIBLE)
        );
    }
}   