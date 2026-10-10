import { Table } from "../entities/Table.js";

export interface ITableRepository{
    findAll(): Promise<Table[]>;
    findById(tableId: string): Promise<Table | null>;
    findByFloor(floorId: string): Promise<Table[]>;
}