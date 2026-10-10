import { Table } from "../../domain/entities/Table.js";
import { ITableRepository } from "../../domain/repositories/ITableRepository.js";

export class ShowTablesUseCase{
    constructor (
        private readonly tableRepository: ITableRepository
    ){}

    async execute(floorId: string): Promise<Table[]>{
        return this.tableRepository.findByFloor(floorId);
    }
}