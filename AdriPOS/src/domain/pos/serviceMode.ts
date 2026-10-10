import type { ServiceMode } from './types'

export function serviceModeForTableName(name: string): ServiceMode {
  const normalizedName = name.trim()
  if (/domicilio/i.test(normalizedName)) return 'DELIVERY'
  if (/^llevar(?:\s|$)/i.test(normalizedName)) return 'TAKEAWAY'
  return 'DINE_IN'
}
