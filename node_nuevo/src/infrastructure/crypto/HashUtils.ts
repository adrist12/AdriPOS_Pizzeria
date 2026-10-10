import bcrypt from 'bcryptjs';

export class HashUtils {
  static async hashPassword(plainText: string): Promise<string> {
    //Uso de bcrypt con clave 10 para velocidad 
    return await bcrypt.hash(plainText, 10);
  }
  static async verifyHash(plainText: string, hashedText: string | null): Promise <boolean> {
    // Caso: Usuario en uniCenta sin contraseña configurada
    if (!hashedText && !plainText) return true;
    if (!hashedText || !plainText) return false;

    return await bcrypt.compare(plainText, hashedText);
  }
}