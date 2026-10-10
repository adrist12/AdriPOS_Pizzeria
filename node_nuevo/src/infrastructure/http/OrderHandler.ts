import { CreateOrderUseCase } from "../../application/use-cases/createOrder.js";
import { Server, Socket } from 'socket.io';
import { Order, OrderProps } from "../../domain/entities/Order.js";
import { MoveOrderUseCase, MoveOrderRequestDto } from "../../application/use-cases/moveOrder.js";
import { SendOrderUseCase } from "../../application/use-cases/sendOrder.js";
import { verifyAuthToken } from "./authMiddleware.js";

interface OrderEventPayload extends OrderProps {
    requestId?: string;
}

interface MoveOrderEventPayload extends MoveOrderRequestDto {
    requestId?: string;
}

export class CreateOrderHandler {
    constructor(
        private readonly io: Server,
        private readonly createOrderUseCase: CreateOrderUseCase,
        private readonly moveOrderUSeCase: MoveOrderUseCase,
        private readonly sendOrderUseCase: SendOrderUseCase
    ) { }

    public registerEvents(socket: Socket): void {
        const requireAuthenticatedUser = (requestId?: string): boolean => {
            const token = socket.data.authToken;
            if (typeof token === 'string') {
                try {
                    socket.data.authUser = verifyAuthToken(token);
                    return true;
                } catch {
                    socket.emit('seat:error', {
                        requestId,
                        message: 'La sesión no es válida o ha expirado. Inicia sesión nuevamente.'
                    });
                    return false;
                }
            }

            socket.emit('seat:error', {
                requestId,
                message: 'Inicia sesión para operar pedidos.'
            });
            return false;
        };

        socket.on('order:send', async (dto: OrderEventPayload) => {
            if (!requireAuthenticatedUser(dto?.requestId)) return;
            try {
                const orderDto: OrderProps = {
                    ...dto,
                    createdAt: new Date(dto.createdAt)
                };
                const sentOrder = await this.sendOrderUseCase.execute(new Order(orderDto));

                this.io.emit('order:sent', {
                    tableId: sentOrder.TableId,
                    status: 'SENT',
                    updatedBy: sentOrder.waiterName,
                    requestId: dto.requestId
                });
                this.io.emit('order:changed', {
                    tableId: sentOrder.TableId,
                    action: 'SENT'
                });
            } catch (error) {
                socket.emit('seat:error', {
                    requestId: dto?.requestId,
                    message: error instanceof Error
                        ? error.message
                        : 'Error al enviar la orden'
                });
            }
        });

        socket.on('order:addItem', async (dto: OrderEventPayload) => {
            if (!requireAuthenticatedUser(dto?.requestId)) return;
            try {

                // Los datos provenientes de Socket.IO son datos externos.
                // Convertimos createdAt nuevamente a un objeto Date.
                const orderDto: OrderProps = {
                    ...dto,
                    createdAt: new Date(dto.createdAt)
                };


                // Ejecutar la lógica del caso de uso.
                const updatedOrder =
                    await this.createOrderUseCase.execute(new Order(orderDto));

                // Notificar a TODOS los dispositivos el cambio de la orden.
                this.io.emit('order:updated', {
                    tableId: updatedOrder.TableId,
                    status: 'UPDATED',
                    updatedBy: updatedOrder.waiterName,
                    requestId: dto.requestId
                });
            } catch (error) {

                // Notificar el error únicamente al cliente que envió la petición.
                socket.emit('seat:error', {
                    requestId: dto?.requestId,
                    message: error instanceof Error
                        ? error.message
                        : 'Error al procesar la orden'
                });
            }
        });
        socket.on('order:moveOrder', async (dto: MoveOrderEventPayload) => {
            if (!requireAuthenticatedUser(dto?.requestId)) return;
            try {
                const movedOrder = await this.moveOrderUSeCase.execute(dto);
                this.io.emit('order:moved', {
                    ...movedOrder,
                    status: 'MOVED',
                    requestId: dto.requestId
                });
                this.io.emit('order:changed', {
                    tableId: movedOrder.currentTableId,
                    action: 'MOVED_OUT'
                });
                this.io.emit('order:changed', {
                    tableId: movedOrder.newTableId,
                    action: 'MOVED_IN'
                });
            } catch (error) {
                socket.emit('seat:error', {
                    requestId: dto?.requestId,
                    message: error instanceof Error
                        ? error.message
                        : 'Error al mover la orden'
                });
            }
        });

    }
}
