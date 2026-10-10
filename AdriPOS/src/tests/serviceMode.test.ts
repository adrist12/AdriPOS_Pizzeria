import { describe, expect, it } from 'vitest'
import { serviceModeForTableName } from '../domain/pos/serviceMode'

describe('serviceModeForTableName', () => {
  it('classifies UniCenta LLEVAR places as takeaway slots', () => {
    expect(serviceModeForTableName('LLEVAR 1')).toBe('TAKEAWAY')
    expect(serviceModeForTableName('llevar 12')).toBe('TAKEAWAY')
  })

  it('keeps normal tables in the dining room', () => {
    expect(serviceModeForTableName('Mesa 1')).toBe('DINE_IN')
    expect(serviceModeForTableName('Barra')).toBe('DINE_IN')
  })

  it('classifies any table name containing domicilio as a delivery place', () => {
    expect(serviceModeForTableName('DOMICILIO 1')).toBe('DELIVERY')
    expect(serviceModeForTableName('Puesto Domicilio Norte')).toBe('DELIVERY')
  })
})
