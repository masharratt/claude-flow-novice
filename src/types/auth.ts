export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

export interface AuthToken {
  token: string;
  userId: string;
  expiresAt: Date;
  type: 'access' | 'refresh';
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: Omit<User, 'passwordHash'>;
  accessToken: string;
  refreshToken: string;
}

export interface PasswordResetData {
  email: string;
  token: string;
  newPassword: string;
}