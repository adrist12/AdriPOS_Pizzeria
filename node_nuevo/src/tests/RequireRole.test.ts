import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { requireRole } from '../infrastructure/http/requireRole.js';

const testSecret = 'unit-test-secret-with-at-least-32-bytes';

test('accounting role middleware allows configured roles and rejects other signed users', async () => {
    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = testSecret;
    const app = express();
    app.get('/accounting', requireRole('0'), (_request, response) => {
        response.sendStatus(204);
    });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

    try {
        const address = server.address();
        assert.ok(address && typeof address !== 'string');
        const baseUrl = `http://127.0.0.1:${address.port}/accounting`;
        const adminToken = jwt.sign({ sub: 'admin', roleId: '0' }, testSecret);
        const waiterToken = jwt.sign({ sub: 'waiter', roleId: '1' }, testSecret);
        const adminResponse = await fetch(baseUrl, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        const waiterResponse = await fetch(baseUrl, {
            headers: { Authorization: `Bearer ${waiterToken}` }
        });
        assert.equal(adminResponse.status, 204);
        assert.equal(waiterResponse.status, 403);
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        });
        if (previousSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = previousSecret;
    }
});
