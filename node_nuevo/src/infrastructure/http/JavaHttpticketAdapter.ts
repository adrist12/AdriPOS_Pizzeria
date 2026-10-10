import { Order } from "../../domain/entities/Order.js";
import { ITicketSerializer } from "../../domain/services/IticketSerializerService.js";

export class JavaHttpTicketAdapter implements ITicketSerializer {
    constructor(private readonly bridgeUrl: string) { }
    async generateJavaTicket(order: Order): Promise<Buffer> {
        const response = await fetch(`${this.bridgeUrl}/serialize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(order),
        });
        if (!response.ok) {
            throw new Error(`Error en el Bridge de Java: ${response.statusText}`)
        }
        // Convertimos la respuesta (ArrayBuffer) a un Buffer de Node.js
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }
    async parseJavaTicket<O>(content_blob: Buffer): Promise<O> {
        const response = await fetch(`${this.bridgeUrl}/deserialize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: new Uint8Array(content_blob),
        });
        if (!response.ok) {
            throw new Error(`Error des-serializando en el Bridge: ${response.statusText}`);
        }

        return (await response.json()) as O;
    }
}
