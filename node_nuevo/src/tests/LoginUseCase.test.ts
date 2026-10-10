import assert from 'node:assert/strict';
import test from 'node:test';
import { LoginUseCase } from '../application/use-cases/login.js';
import { User } from '../domain/entities/User.js';
import { IUserRepository } from '../domain/repositories/IUserRepository.js';
import { HashUtils } from '../infrastructure/crypto/HashUtils.js';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'unit-test-jwt-secret-with-more-than-32-bytes';

class InMemoryUserRepository implements IUserRepository {
    constructor(private readonly user: User | null) { }

    async findByName(): Promise<User | null> {
        return this.user;
    }
}

test('LoginUseCase devuelve token y datos públicos con credenciales válidas', async () => {
    const user = new User('0', 'Administrador', await HashUtils.hashPassword('admin123'), 'Administrator role', true);
    const useCase = new LoginUseCase(new InMemoryUserRepository(user));

    const result = await useCase.execute('Administrador', 'admin123');

    assert.ok(result.token);
    const tokenPayload = jwt.decode(result.token);
    assert.ok(tokenPayload && typeof tokenPayload !== 'string');
    assert.equal(tokenPayload.exp! - tokenPayload.iat!, 24 * 60 * 60);
    assert.equal(result.expiresAt, tokenPayload.exp! * 1000);
    assert.deepEqual(result.user, {
        id: '0',
        name: 'Administrador',
        roleId: 'Administrator role'
    });
});

test('LoginUseCase rechaza una contraseña incorrecta', async () => {
    const user = new User('0', 'Administrador', await HashUtils.hashPassword('admin123'), 'Administrator role', true);
    const useCase = new LoginUseCase(new InMemoryUserRepository(user));

    await assert.rejects(
        () => useCase.execute('Administrador', 'contraseña-incorrecta'),
        /Credenciales inválidas/
    );
});

test('LoginUseCase no revela si el usuario no existe', async () => {
    const useCase = new LoginUseCase(new InMemoryUserRepository(null));

    await assert.rejects(
        () => useCase.execute('desconocido', 'secret'),
        /Credenciales inválidas/
    );
});
