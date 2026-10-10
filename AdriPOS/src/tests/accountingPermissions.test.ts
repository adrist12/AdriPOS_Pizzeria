import { describe, expect, it } from 'vitest'
import { isAccountingAdministrator } from '../domain/auth/accountingPermissions'

describe('accounting authorization presentation', () => {
  it('recognizes only configured administrator role ids', () => {
    expect(isAccountingAdministrator('0', '0, 5')).toBe(true)
    expect(isAccountingAdministrator('5', '0, 5')).toBe(true)
    expect(isAccountingAdministrator('1', '0, 5')).toBe(false)
  })

  it('does not grant access when the role list is empty', () => {
    expect(isAccountingAdministrator('0', '')).toBe(false)
  })
})
