import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { requireAuth, verifyAuthToken } from '../infrastructure/http/authMiddleware.js';

const testSecret = 'unit-test-secret-with-more-than-32-bytes';

test('requireAuth rejects requests without a bearer token and accepts a valid session token', async () => {
    process.env.JWT_SECRET = testSecret;
    const app = express();
    app.get('/private', requireAuth, (_request, response) => {
        response.sendStatus(204);
    });

    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));

    try {
        const address = server.address();
        assert.ok(address && typeof address !== 'string');
        const baseUrl = `http://127.0.0.1:${address.port}`;

        const anonymousResponse = await fetch(`${baseUrl}/private`);
        assert.equal(anonymousResponse.status, 401);

        const token = jwt.sign({ sub: 'waiter-1' }, testSecret, { expiresIn: '1h' });
        const authenticatedResponse = await fetch(`${baseUrl}/private`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        assert.equal(authenticatedResponse.status, 204);
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        });
    }
});

test('verifyAuthToken rejects invalid and expired tokens', () => {
    process.env.JWT_SECRET = testSecret;
    assert.throws(() => verifyAuthToken('not-a-token'));

    const expiredToken = jwt.sign(
        { sub: 'waiter-1', exp: Math.floor(Date.now() / 1000) - 10 },
        testSecret
    );
    assert.throws(() => verifyAuthToken(expiredToken));
});
