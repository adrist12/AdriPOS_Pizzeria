
import { IUserRepository } from "../../domain/repositories/IUserRepository.js";
import { HashUtils } from "../../infrastructure/crypto/HashUtils.js";
import { getJwtSecret } from "../../infrastructure/security/jwtSecret.js";
import jwt from 'jsonwebtoken';

export interface LoginRequestDto {
    name: string;
    password: string;
}

export class LoginUseCase {
  constructor(private readonly userRepository: IUserRepository) {
  }
  async execute(name: string, password: string) {
    const user = await this.userRepository.findByName(name);
    if (!user) {
      throw new Error('Credenciales inválidas');
    }

    const appPassword = user.userPassword;
    const isValidPassword = await HashUtils.verifyHash(password, appPassword);
    if (!isValidPassword) {
      throw new Error('Credenciales inválidas');
    }
    const token = jwt.sign(
      {
        sub: user.userId,
        name: user.userName,
        roleId: user.userRole
      },
      getJwtSecret(),
      { expiresIn: '24h' }
    );
    const tokenPayload = jwt.decode(token);
    if (typeof tokenPayload === 'string' || !tokenPayload || typeof tokenPayload.exp !== 'number') {
      throw new Error('No se pudo determinar el vencimiento de la sesión.');
    }
    const expiresAt = tokenPayload.exp * 1000;
    return {
      token,
      expiresAt,
      user: {
        id: user.userId,
        name: user.userName,
        roleId: user.userRole
      }
    };
  }
}
