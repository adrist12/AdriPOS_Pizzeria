import { OrderOperationError } from '../../domain/errors/OrderOperationError.js';
import type { IOrderRepository } from '../../domain/repositories/IOrderRepository.js';
import type { ITableRepository } from '../../domain/repositories/ITableRepository.js';

export interface MoveOrderRequestDto {
    currentTableId: string;
    newTableId: string;
}

export interface MoveOrderResult {
    currentTableId: string;
    newTableId: string;
}

type PlaceMode = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';

export class MoveOrderUseCase {
    constructor(
        private readonly orderRepository: IOrderRepository,
        private readonly tableRepository: ITableRepository
    ) { }

    async execute(dto: MoveOrderRequestDto): Promise<MoveOrderResult> {
        const currentTableId = dto.currentTableId?.trim();
        const newTableId = dto.newTableId?.trim();
        if (!currentTableId || !newTableId) {
            throw new Error('Los puestos de origen y destino son obligatorios.');
        }
        if (currentTableId === newTableId) {
            throw new Error('El puesto de origen y destino no pueden ser el mismo.');
        }

        const [source, destination] = await Promise.all([
            this.tableRepository.findById(currentTableId),
            this.tableRepository.findById(newTableId)
        ]);
        if (!source || !destination) {
            throw new OrderOperationError(
                'No se encontró el puesto de origen o destino.',
                'TABLE_NOT_FOUND'
            );
        }
        if (placeMode(source.tableName) !== placeMode(destination.tableName)) {
            throw new OrderOperationError(
                'Solo puedes mover una orden entre puestos del mismo tipo.',
                'MOVE_INCOMPATIBLE'
            );
        }

        await this.orderRepository.moveActiveOrder(currentTableId, newTableId);
        return { currentTableId, newTableId };
    }
}

function placeMode(name: string): PlaceMode {
    const normalizedName = name.trim();
    if (/domicilio/i.test(normalizedName)) return 'DELIVERY';
    if (/^llevar(?:\s|$)/i.test(normalizedName)) return 'TAKEAWAY';
    return 'DINE_IN';
}
