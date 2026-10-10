import { timingSafeEqual } from 'node:crypto';

export function verifyAccountingEditPassword(
    candidate: unknown,
    configuredPassword: string | undefined
): boolean {
    if (
        typeof candidate !== 'string' ||
        candidate.length === 0 ||
        candidate.length > 1024 ||
        !configuredPassword
    ) {
        return false;
    }

    const candidateBytes = Buffer.from(candidate, 'utf8');
    const configuredBytes = Buffer.from(configuredPassword, 'utf8');
    return candidateBytes.length === configuredBytes.length &&
        timingSafeEqual(candidateBytes, configuredBytes);
}
