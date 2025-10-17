import jwt from 'jsonwebtoken';
import { AuthToken } from '../types/auth';

export const generateJWT = (
  userId: string, 
  secret: string, 
  expiresIn: string = '15m'
): string => {
  return jwt.sign(
    { userId, type: 'access' },
    secret,
    { expiresIn }
  );
};

export const generateRefreshJWT = (
  userId: string, 
  secret: string
): string => {
  return jwt.sign(
    { userId, type: 'refresh' },
    secret,
    { expiresIn: '7d' }
  );
};

export const verifyJWT = (token: string, secret: string): any => {
  try {
    return jwt.verify(token, secret);
  } catch (error) {
    throw new Error('Invalid token');
  }
};

export const isTokenExpired = (token: string, secret: string): boolean => {
  try {
    const decoded = jwt.verify(token, secret) as any;
    return decoded.exp < Date.now() / 1000;
  } catch {
    return true;
  }
};