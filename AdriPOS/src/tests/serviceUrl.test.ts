import { describe, expect, it } from 'vitest'
import { resolveServiceUrl } from '../infrastructure/http/serviceUrl'

describe('resolveServiceUrl', () => {
  it('requires HTTPS in production', () => {
    expect(() => resolveServiceUrl('http://pos.example.com', '', true))
      .toThrow('En producción, AdriPOS requiere HTTPS')
    expect(resolveServiceUrl('https://pos.example.com/', '', true))
      .toBe('https://pos.example.com')
  })

  it('rejects malformed and unsupported schemes', () => {
    expect(() => resolveServiceUrl('not-a-url', '', false))
      .toThrow('La URL del servidor no es válida')
    expect(() => resolveServiceUrl('file://server', '', false))
      .toThrow('El servidor debe usar HTTP o HTTPS')
  })
})
