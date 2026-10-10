export class Table{
    constructor(
        public readonly tableId :string,
        public readonly tableName: string,
        public readonly floorId: string,
        public waiterName?: string | null,
        public ticketId?: string | null,
        public occupied?: Date| null
    ){}
}