import { LoginUseCase, LoginRequestDto } from "../../application/use-cases/login.js";
import { Socket } from 'socket.io';



export class LoginHandler {
    constructor(
        private readonly loginUseCase: LoginUseCase
    ) { }

    public registerEvents(socket: Socket): void {
        socket.on('auth:login', async (dto: LoginRequestDto) => {
            try {
                if (!dto || typeof dto.name !== 'string' || typeof dto.password !== 'string') {
                    throw new Error('El usuario y la contraseña son obligatorios');
                }

                const name = dto.name.trim();
                if (!name || !dto.password) {
                    throw new Error('El usuario y la contraseña son obligatorios');
                }

                const result = await this.loginUseCase.execute(name, dto.password);

                socket.data.authUser = result.user;
                socket.data.authToken = result.token;
                socket.emit('auth:login:success', result);
            } catch (error) {
                socket.emit('auth:login:error', {
                    message: error instanceof Error
                        ? error.message
                        : 'No se pudo iniciar sesión'
                });
            }
        });
    }

    public async verifyLogin(dto: LoginRequestDto) {
        if (!dto || typeof dto.name !== 'string' || typeof dto.password !== 'string') {
            throw new Error('El usuario y la contraseña son obligatorios');
        }

        const name = dto.name.trim();
        if (!name || !dto.password) {
            throw new Error('El usuario y la contraseña son obligatorios');
        }

        return this.loginUseCase.execute(name, dto.password);
    }
}