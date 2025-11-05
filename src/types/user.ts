// User domain types and interfaces
// Core user entity definitions for Zone B

import type { BaseEntity } from './index.js';

/**
 * User roles in the system
 */
export enum UserRole {
  ADMIN = 'admin',
  MODERATOR = 'moderator',
  USER = 'user',
  GUEST = 'guest'
}

/**
 * User account status
 */
export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING_VERIFICATION = 'pending_verification'
}

/**
 * User privacy settings
 */
export interface UserPrivacySettings {
  profileVisibility: 'public' | 'friends' | 'private';
  allowFriendRequests: boolean;
  allowMessages: boolean;
  allowStoryTagging: boolean;
  allowLocationSharing: boolean;
  showOnlineStatus: boolean;
}

/**
 * User preferences and settings
 */
export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  timezone: string;
  emailNotifications: boolean;
  pushNotifications: boolean;
  autoSaveStories: boolean;
  storyVisibilityDefault: 'public' | 'friends' | 'private';
}

/**
 * User profile information
 */
export interface UserProfile {
  firstName: string;
  lastName: string;
  displayName: string;
  bio?: string;
  avatar?: string;
  banner?: string;
  location?: string;
  website?: string;
  birthdate?: Date;
  gender?: 'male' | 'female' | 'non-binary' | 'prefer_not_to_say';
}

/**
 * Security and authentication data
 */
export interface UserSecurity {
  email: string;
  emailVerified: boolean;
  phone?: string;
  phoneVerified: boolean;
  twoFactorEnabled: boolean;
  lastPasswordChange?: Date;
  loginAttempts: number;
  lockedUntil?: Date;
}

/**
 * Complete User entity
 */
export interface User extends BaseEntity {
  username: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  profile: UserProfile;
  privacy: UserPrivacySettings;
  preferences: UserPreferences;
  security: UserSecurity;
  stats: {
    storiesCount: number;
    friendsCount: number;
    followersCount: number;
    followingCount: number;
  };
}

/**
 * User creation payload
 */
export interface CreateUserRequest {
  username: string;
  email: string;
  password: string;
  profile: Omit<UserProfile, 'avatar' | 'banner'>;
  preferences?: Partial<UserPreferences>;
}

/**
 * User update payload
 */
export interface UpdateUserRequest {
  profile?: Partial<UserProfile>;
  privacy?: Partial<UserPrivacySettings>;
  preferences?: Partial<UserPreferences>;
}

/**
 * Public user profile (for other users to view)
 */
export interface PublicUserProfile {
  id: string;
  username: string;
  profile: {
    displayName: string;
    bio?: string;
    avatar?: string;
    location?: string;
    website?: string;
  };
  stats: {
    storiesCount: number;
    friendsCount: number;
    followersCount: number;
  };
  isFollowing?: boolean;
  isFriend?: boolean;
}

/**
 * User search filters
 */
export interface UserSearchFilters {
  role?: UserRole;
  status?: UserStatus;
  location?: string;
  minAge?: number;
  maxAge?: number;
  interests?: string[];
}