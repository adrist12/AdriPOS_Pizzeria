// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearLoginSession,
  loadLoginSession,
  saveLoginSession,
} from '../infrastructure/auth/sessionStorage'

describe('login session persistence', () => {
  afterEach(() => {
    clearLoginSession()
  })

  it('restores an unexpired session after a page reload', () => {
    const session = {
      token: 'jwt-token',
      expiresAt: Date.now() + 60_000,
      user: { id: 'waiter-1', name: 'Ana', roleId: 'waiter' },
    }

    saveLoginSession(session)

    expect(loadLoginSession()).toEqual(session)
  })

  it('removes expired or malformed sessions instead of restoring them', () => {
    saveLoginSession({
      token: 'expired-token',
      expiresAt: Date.now() - 1,
      user: { id: 'waiter-1', name: 'Ana', roleId: 'waiter' },
    })
    expect(loadLoginSession()).toBeNull()

    localStorage.setItem('adripos.auth.session', '{invalid')
    expect(loadLoginSession()).toBeNull()
    expect(localStorage.getItem('adripos.auth.session')).toBeNull()
  })
})
