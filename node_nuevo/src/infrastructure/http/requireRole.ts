import type { NextFunction, Request, Response } from 'express';
import { verifyAuthToken } from './authMiddleware.js';

export function requireRole(...allowedRoleIds: string[]) {
    return (request: Request, response: Response, next: NextFunction): void => {
        const authorization = request.header('authorization');
        const token = authorization?.startsWith('Bearer ')
            ? authorization.slice('Bearer '.length)
            : '';
        if (!token) {
            response.status(401).json({ message: 'Inicia sesión para continuar.' });
            return;
        }

        try {
            const payload = verifyAuthToken(token);
            const roleId = payload.roleId;
            if (typeof roleId !== 'string' || !allowedRoleIds.includes(roleId)) {
                response.status(403).json({ message: 'No tienes permiso para acceder a este módulo.' });
                return;
            }
            next();
        } catch {
            response.status(401).json({ message: 'La sesión no es válida o ha expirado.' });
        }
    };
}
