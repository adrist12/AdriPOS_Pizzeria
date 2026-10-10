import { Order } from '../../domain/entities/Order.js';
import { IOrderRepository } from '../../domain/repositories/IOrderRepository.js';
export class CreateOrderUseCase {
    //inyeccion de dependencias a través del constructor
    constructor(private readonly orderRepository: IOrderRepository) {
    }
    async execute(dto: Order): Promise<Order> {
        //Validar la existencia de la orden usando la interfaz
        const existing = await this.orderRepository.findByTableId(dto.TableId);
        if (!existing) {
            const newOrder = new Order({
                tableId: dto.TableId,
                waiterName: dto.waiterName,
                createdAt: dto.createdAt,
                items: dto.Items,
                waiterId: dto.waiterId,
                delivery: dto.Delivery,
            });
            await this.orderRepository.save(newOrder);
            return newOrder;
        }else{
            for( const items of dto.Items){
                existing.addItem(items);
            }
            if (dto.Delivery !== undefined) {
                existing.Delivery = dto.Delivery;
            }
            await this.orderRepository.save(existing);
            return existing
            // crear la entidad de dominio
            //Persistir usando el repositorio abstracto
        }
    }
}