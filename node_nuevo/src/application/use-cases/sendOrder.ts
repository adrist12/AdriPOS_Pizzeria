import { Order } from '../../domain/entities/Order.js';
import { KitchenItem } from '../../domain/entities/KitchenItem.js';
import { KitchenStation } from '../../domain/entities/kitchenEnums.js';
import { KitchenTicket } from '../../domain/entities/KitchenTicket.js';
import { IKitchenRepository } from '../../domain/repositories/IKitchenTicketRepository.js';
import { IOrderRepository } from '../../domain/repositories/IOrderRepository.js';
import { IProductRepository } from '../../domain/repositories/IProductRepository.js';
import { kitchenItemId } from '../../domain/services/kitchenItemId.js';

export class SendOrderUseCase {
    constructor(
        private readonly orderRepository: IOrderRepository,
        private readonly kitchenRepository: IKitchenRepository,
        private readonly productRepository: IProductRepository
    ) { }

    async execute(order: Order): Promise<Order> {
        const existingOrder = await this.orderRepository.findByTableId(order.TableId);
        const incomingItems = order.Items.map((item) => ({
            ...item,
            lineId: item.lineId ?? randomUUID()
        }));
        const orderToSend = existingOrder ?? new Order({
            orderId: order.orderId,
            tableId: order.TableId,
            waiterName: order.waiterName,
            waiterId: order.waiterId,
            createdAt: order.createdAt,
            items: incomingItems,
            delivery: order.Delivery
        });

        if (existingOrder) {
            orderToSend.mergeItems(incomingItems);
            if (order.Delivery !== undefined) {
                orderToSend.Delivery = order.Delivery;
            }
        }

        const productIds = orderToSend.Items.map((item) => item.productId);
        const productStations = await this.productRepository.findStationByProductIds(productIds);
        const stationByProductId = new Map(
            productStations.map((product) => [product.productId, this.resolveStation(product.attributeSetId)])
        );

        const kitchenItems = orderToSend.Items.map((item) => {
            const station = stationByProductId.get(item.productId);
            if (!station) {
                throw new Error(`El producto ${item.productId} no tiene una estación de cocina configurada`);
            }

            return new KitchenItem({
                itemId: kitchenItemId(
                    orderToSend.orderId ?? orderToSend.TableId,
                    item.lineId ?? item.productId
                ),
                ticketId: orderToSend.orderId ?? orderToSend.TableId,
                itemName: item.productName,
                quantity: item.quantity,
                station,
                notes: item.takeaway
                    ? `PARA LLEVAR${item.notes ? ` · ${item.notes}` : ''}`
                    : item.notes
            });
        });

        const kitchenTicket = new KitchenTicket({
            ticketId: orderToSend.orderId ?? orderToSend.TableId,
            tableId: orderToSend.TableId,
            waiterName: orderToSend.waiterName,
            items: kitchenItems
        });

        await this.orderRepository.save(orderToSend);
        await this.kitchenRepository.save(kitchenTicket);

        return orderToSend;
    }

    private resolveStation(attributeSetId: string | number): KitchenStation {
        const mappings: Array<[string | undefined, KitchenStation]> = [
            [process.env.KITCHEN_ATTRIBUTESET_PLANCHA, KitchenStation.PLANCHA],
            [process.env.KITCHEN_ATTRIBUTESET_PIZZAS_GRANDES, KitchenStation.PIZZAS_GRANDES],
            [process.env.KITCHEN_ATTRIBUTESET_PIZZAS, KitchenStation.PIZZAS]
        ];
        const station = mappings.find(([configuredId]) => configuredId === String(attributeSetId))?.[1];

        if (!station) {
            throw new Error(`No existe una estación para attributeset_id=${attributeSetId}`);
        }

        return station;
    }

}
import { randomUUID } from 'node:crypto';