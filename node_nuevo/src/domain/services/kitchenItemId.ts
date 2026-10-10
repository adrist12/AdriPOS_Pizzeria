import { createHash } from 'node:crypto';

export function kitchenItemId(ticketId: string, lineId: string): string {
    return createHash('sha256')
        .update(`${ticketId}:${lineId}`)
        .digest('hex')
        .slice(0, 36);
}
