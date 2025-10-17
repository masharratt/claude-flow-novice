import { User, RegisterData } from '../types/auth';
import { hashPassword } from '../utils/password';

export class UserService {
  private users: Map<string, User> = new Map();

  async createUser(userData: RegisterData): Promise<User> {
    const userId = this.generateUserId();
    const passwordHash = await hashPassword(userData.password);
    
    const user: User = {
      id: userId,
      email: userData.email,
      passwordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true
    };

    this.users.set(userId, user);
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.email === email) {
        return user;
      }
    }
    return null;
  }

  async findById(userId: string): Promise<User | null> {
    return this.users.get(userId) || null;
  }

  async updateUser(userId: string, updates: Partial<User>): Promise<User | null> {
    const user = this.users.get(userId);
    if (!user) return null;

    const updatedUser = {
      ...user,
      ...updates,
      updatedAt: new Date()
    };

    this.users.set(userId, updatedUser);
    return updatedUser;
  }

  async deactivateUser(userId: string): Promise<boolean> {
    const user = this.users.get(userId);
    if (!user) return false;

    user.isActive = false;
    user.updatedAt = new Date();
    this.users.set(userId, user);
    return true;
  }

  private generateUserId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // For testing purposes - clear all users
  clear(): void {
    this.users.clear();
  }
}