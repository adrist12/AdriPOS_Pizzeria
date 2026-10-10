export function getJwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
        throw new Error('JWT_SECRET debe configurarse con al menos 32 bytes aleatorios.');
    }
    return secret;
}
