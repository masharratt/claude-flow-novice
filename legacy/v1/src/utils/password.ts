import bcrypt from 'bcrypt';
import crypto from 'crypto';

export const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

export const verifyPassword = async (
  password: string, 
  hash: string
): Promise<boolean> => {
  return await bcrypt.compare(password, hash);
};

export const generateSecureToken = (length: number = 32): string => {
  return crypto.randomBytes(length).toString('hex');
};

export const generateTokenExpiry = (minutes: number = 15): Date => {
  return new Date(Date.now() + minutes * 60 * 1000);
};

export const generateRefreshTokenExpiry = (days: number = 7): Date => {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
};