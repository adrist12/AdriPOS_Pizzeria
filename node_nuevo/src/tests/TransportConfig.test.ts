import assert from 'node:assert/strict';
import test from 'node:test';
import { assertProductionTransportConfiguration } from '../infrastructure/security/transportConfig.js';

test('development keeps local HTTP transport available', () => {
    assert.doesNotThrow(() => assertProductionTransportConfiguration({
        NODE_ENV: 'development',
        HOST: '0.0.0.0',
        FRONTEND_ORIGINS: 'http://localhost:5173'
    }));
});

test('production requires a loopback backend, trusted local proxy, and HTTPS origins', () => {
    const production = {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        TRUST_PROXY: 'loopback',
        FRONTEND_ORIGINS: 'https://pos.example.com'
    };
    assert.doesNotThrow(() => assertProductionTransportConfiguration(production));
    assert.throws(() => assertProductionTransportConfiguration({
        ...production,
        HOST: '0.0.0.0'
    }), /127\.0\.0\.1/);
    assert.throws(() => assertProductionTransportConfiguration({
        ...production,
        TRUST_PROXY: ''
    }), /TRUST_PROXY/);
    assert.throws(() => assertProductionTransportConfiguration({
        ...production,
        FRONTEND_ORIGINS: 'http://pos.example.com'
    }), /HTTPS/);
});
