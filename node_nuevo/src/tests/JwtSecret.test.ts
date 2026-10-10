import assert from 'node:assert/strict';
import test from 'node:test';
import { getJwtSecret } from '../infrastructure/security/jwtSecret.js';

test('JWT signing refuses an absent or weak secret', () => {
    const previousSecret = process.env.JWT_SECRET;
    try {
        delete process.env.JWT_SECRET;
        assert.throws(() => getJwtSecret(), /JWT_SECRET/);
        process.env.JWT_SECRET = 'too-short';
        assert.throws(() => getJwtSecret(), /32 bytes/);
    } finally {
        if (previousSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = previousSecret;
    }
});

test('JWT signing accepts a sufficiently long configured secret', () => {
    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'unit-test-secret-with-at-least-32-bytes';
    try {
        assert.equal(getJwtSecret(), process.env.JWT_SECRET);
    } finally {
        if (previousSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = previousSecret;
    }
});
