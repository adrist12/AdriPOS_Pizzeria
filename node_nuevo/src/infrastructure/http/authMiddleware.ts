import type { NextFunction, Request, Response } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { getJwtSecret } from '../security/jwtSecret.js';

export function verifyAuthToken(token: string): JwtPayload {
    const payload = jwt.verify(
        token,
        getJwtSecret()
    );
    if (typeof payload === 'string') {
        throw new Error('Token de sesión no válido');
    }
    return payload;
}

export function requireAuth(
    request: Request,
    response: Response,
    next: NextFunction
): void {
    const authorization = request.header('authorization');
    const token = authorization?.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length)
        : '';

    if (!token) {
        response.status(401).json({ message: 'Inicia sesión para continuar.' });
        return;
    }

    try {
        verifyAuthToken(token);
        next();
    } catch {
        response.status(401).json({ message: 'La sesión no es válida o ha expirado.' });
    }
}
