export function assertProductionTransportConfiguration(
    environment: NodeJS.ProcessEnv
): void {
    if (environment.NODE_ENV !== 'production') return;

    const host = environment.HOST || '127.0.0.1';
    if (host !== '127.0.0.1') {
        throw new Error('En producción, el backend debe escuchar solo en 127.0.0.1 detrás del proxy TLS.');
    }
    if (environment.TRUST_PROXY !== 'loopback') {
        throw new Error('En producción, TRUST_PROXY debe ser loopback para validar TLS terminado localmente.');
    }

    const origins = (environment.FRONTEND_ORIGINS || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
    if (origins.length === 0 || origins.some((origin) => {
        try {
            return new URL(origin).protocol !== 'https:';
        } catch {
            return true;
        }
    })) {
        throw new Error('En producción, FRONTEND_ORIGINS debe contener únicamente orígenes HTTPS válidos.');
    }
}
