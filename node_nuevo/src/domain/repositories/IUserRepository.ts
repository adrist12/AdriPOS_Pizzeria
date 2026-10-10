import { User } from "../entities/User.js";

export interface IUserRepository {
    findByName(name: string): Promise<User | null>;
}
