import { AuthService } from './authService';
import { UserService } from './userService';
import { 
  LoginCredentials, 
  AuthResponse, 
  PasswordResetData 
} from '../types/auth';
import { 
  verifyPassword, 
  generateSecureToken,
  generateTokenExpiry,
  generateRefreshTokenExpiry
} from '../utils/password';
import { generateJWT, generateRefreshJWT } from '../utils/jwt';

export class AuthServiceImplementation {
  private userService: UserService;

  constructor(userService: UserService) {
    this.userService = userService;
  }

  async login(credentials: LoginCredentials): Promise<AuthResponse | null> {
    try {
      const user = await this.userService.findByEmail(credentials.email);
      
      if (!user || !user.isActive) {
        return null;
      }

      const isPasswordValid = await verifyPassword(
        credentials.password, 
        user.passwordHash
      );

      if (!isPasswordValid) {
        return null;
      }

      const accessToken = generateJWT(user.id, process.env.JWT_SECRET!);
      const refreshToken = generateRefreshJWT(user.id, process.env.JWT_SECRET!);

      return {
        user: {
          id: user.id,
          email: user.email,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          isActive: user.isActive
        },
        accessToken,
        refreshToken
      };
    } catch (error) {
      console.error('Login error:', error);
      return null;
    }
  }

  async register(userData: { email: string; password: string }): Promise<AuthResponse | null> {
    try {
      // Check if user already exists
      const existingUser = await this.userService.findByEmail(userData.email);
      if (existingUser) {
        return null;
      }

      const user = await this.userService.createUser(userData);
      const accessToken = generateJWT(user.id, process.env.JWT_SECRET!);
      const refreshToken = generateRefreshJWT(user.id, process.env.JWT_SECRET!);

      return {
        user: {
          id: user.id,
          email: user.email,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          isActive: user.isActive
        },
        accessToken,
        refreshToken
      };
    } catch (error) {
      console.error('Registration error:', error);
      return null;
    }
  }

  async logout(userId: string): Promise<boolean> {
    try {
      await this.userService.deactivateUser(userId);
      return true;
    } catch (error) {
      console.error('Logout error:', error);
      return false;
    }
  }

  async requestPasswordReset(email: string): Promise<{ resetToken: string; expiresAt: Date } | null> {
    try {
      const user = await this.userService.findByEmail(email);
      if (!user || !user.isActive) {
        return null;
      }

      const resetToken = generateSecureToken();
      const expiresAt = generateTokenExpiry(60); // 1 hour expiry

      // Store the reset token (in a real app, you'd store this in a database)
      // For this example, we'll just return it
      return { resetToken, expiresAt };
    } catch (error) {
      console.error('Password reset request error:', error);
      return null;
    }
  }

  async resetPassword(resetData: PasswordResetData): Promise<boolean> {
    try {
      const user = await this.userService.findByEmail(resetData.email);
      if (!user || !user.isActive) {
        return false;
      }

      // In a real app, you'd verify the reset token against the stored one
      // For this example, we'll just proceed with password reset
      
      // This would normally be handled by the UserService with token validation
      return true;
    } catch (error) {
      console.error('Password reset error:', error);
      return false;
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<string | null> {
    try {
      // Verify the refresh token
      const decoded = this.verifyToken(refreshToken);
      if (!decoded || decoded.type !== 'refresh') {
        return null;
      }

      const user = await this.userService.findById(decoded.userId);
      if (!user || !user.isActive) {
        return null;
      }

      return generateJWT(user.id, process.env.JWT_SECRET!);
    } catch (error) {
      console.error('Token refresh error:', error);
      return null;
    }
  }

  private verifyToken(token: string): any {
    // This would use the JWT verify function from jwt.ts
    // For now, we'll return a placeholder
    return { userId: 'some_user_id', type: 'refresh' };
  }
}