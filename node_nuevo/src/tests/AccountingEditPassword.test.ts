import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyAccountingEditPassword } from '../infrastructure/security/accountingEditPassword.js';

test('edit authorization compares the configured password and rejects invalid input', () => {
    assert.equal(verifyAccountingEditPassword('correct-secret', 'correct-secret'), true);
    assert.equal(verifyAccountingEditPassword('incorrect-secret', 'correct-secret'), false);
    assert.equal(verifyAccountingEditPassword('correct-secret', undefined), false);
    assert.equal(verifyAccountingEditPassword('', 'correct-secret'), false);
    assert.equal(verifyAccountingEditPassword('x'.repeat(1025), 'correct-secret'), false);
});
