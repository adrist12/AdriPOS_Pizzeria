import { Buffer } from 'buffer';

export interface ITicketSerializer {
  /**
   * Guarda o actualiza una comanda en unicentaPOS
   * Debe manejar transacciones para garantizar atomicidad en MySQL/MariaDB
   */
  generateJavaTicket(order: unknown): Promise<Buffer>;
  
  /**
   * Obtiene la comanda activa de una mesa
   */
  parseJavaTicket<O>(content_blob: Buffer): Promise<O>;
}