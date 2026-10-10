export function resolveServiceUrl(
  configuredUrl: string | undefined,
  fallbackUrl: string,
  isProduction: boolean,
): string {
  const rawUrl = configuredUrl || fallbackUrl
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('La URL del servidor no es válida.')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('El servidor debe usar HTTP o HTTPS.')
  }
  if (isProduction && url.protocol !== 'https:') {
    throw new Error('En producción, AdriPOS requiere HTTPS para API y Socket.IO.')
  }
  return url.toString().replace(/\/+$/, '')
}
