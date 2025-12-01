/**
 * Session Management Service
 * 
 * Advanced session management with concurrent session limits,
 * session monitoring, and security features.
 */

import { Redis } from 'ioredis';
import { createLogger } from '../lib/logging.js';
import { StandardError, ErrorCode } from '../lib/errors.js';

const logger = createLogger('session-management');

export interface SessionInfo {
  sessionId: string;
  userId: string;
  username: string;
  email: string;
  role: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  lastActivity: Date;
  isActive: boolean;
  deviceInfo?: string;
  location?: string;
}

export interface SessionStats {
  totalSessions: number;
  activeSessions: number;
  sessionsByDevice: Record<string, number>;
  sessionsByLocation: Record<string, number>;
  averageSessionDuration: number;
  oldestSession?: Date;
  newestSession?: Date;
}

export interface SessionConfig {
  maxSessionsPerUser: number;
  sessionTimeoutMs: number;
  cleanupIntervalMs: number;
  enableSessionMonitoring: boolean;
  enableGeolocation: boolean;
}

export class SessionManagementService {
  private redis: Redis;
  private config: SessionConfig;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(redis: Redis, config: Partial<SessionConfig> = {}) {
    this.redis = redis;
    this.config = {
      maxSessionsPerUser: config.maxSessionsPerUser || 3,
      sessionTimeoutMs: config.sessionTimeoutMs || 24 * 60 * 60 * 1000, // 24 hours
      cleanupIntervalMs: config.cleanupIntervalMs || 60 * 60 * 1000, // 1 hour
      enableSessionMonitoring: config.enableSessionMonitoring ?? true,
      enableGeolocation: config.enableGeolocation ?? false,
    };

    if (this.config.enableSessionMonitoring) {
      this.startSessionCleanup();
    }
  }

  /**
   * Start automatic session cleanup
   */
  private startSessionCleanup(): void {
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.cleanupExpiredSessions();
      } catch (error) {
        logger.error('Session cleanup failed:', error);
      }
    }, this.config.cleanupIntervalMs);

    logger.info('Session cleanup started', { interval: this.config.cleanupIntervalMs });
  }

  /**
   * Stop session cleanup
   */
  public stopSessionCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
      logger.info('Session cleanup stopped');
    }
  }

  /**
   * Create a new session
   */
  async createSession(
    sessionId: string,
    userId: string,
    sessionData: Omit<SessionInfo, 'sessionId' | 'lastActivity' | 'isActive'>
  ): Promise<void> {
    try {
      const sessionInfo: SessionInfo = {
        ...sessionData,
        sessionId,
        lastActivity: new Date(),
        isActive: true,
      };

      // Check concurrent session limit
      await this.enforceSessionLimit(userId);

      // Store session data
      const sessionKey = `session:${sessionId}`;
      await this.redis.setex(
        sessionKey,
        Math.ceil(this.config.sessionTimeoutMs / 1000),
        JSON.stringify(sessionInfo)
      );

      // Add to user's session set
      const userSessionsKey = `sessions:${userId}`;
      await this.redis.sadd(userSessionsKey, sessionId);
      await this.redis.expire(userSessionsKey, Math.ceil(this.config.sessionTimeoutMs / 1000));

      // Track session statistics
      if (this.config.enableSessionMonitoring) {
        await this.trackSessionStats(sessionInfo);
      }

      logger.debug('Session created', { sessionId, userId });
    } catch (error) {
      logger.error('Failed to create session:', error);
      throw new StandardError(
        ErrorCode.INTERNAL_ERROR,
        'Failed to create session',
        {},
        error as Error
      );
    }
  }

  /**
   * Get session information
   */
  async getSession(sessionId: string): Promise<SessionInfo | null> {
    try {
      const sessionKey = `session:${sessionId}`;
      const sessionData = await this.redis.get(sessionKey);

      if (!sessionData) {
        return null;
      }

      const sessionInfo: SessionInfo = JSON.parse(sessionData);
      sessionInfo.createdAt = new Date(sessionInfo.createdAt);
      sessionInfo.lastActivity = new Date(sessionInfo.lastActivity);

      // Update last activity
      sessionInfo.lastActivity = new Date();
      await this.updateSessionActivity(sessionId, sessionInfo);

      return sessionInfo;
    } catch (error) {
      logger.error('Failed to get session:', error);
      return null;
    }
  }

  /**
   * Update session activity
   */
  async updateSessionActivity(sessionId: string, sessionInfo: SessionInfo): Promise<void> {
    try {
      const sessionKey = `session:${sessionId}`;
      sessionInfo.lastActivity = new Date();

      await this.redis.setex(
        sessionKey,
        Math.ceil(this.config.sessionTimeoutMs / 1000),
        JSON.stringify(sessionInfo)
      );
    } catch (error) {
      logger.error('Failed to update session activity:', error);
    }
  }

  /**
   * Remove a session
   */
  async removeSession(sessionId: string, userId?: string): Promise<void> {
    try {
      // Get session info before deletion for logging
      const sessionInfo = await this.getSession(sessionId);

      // Delete session data
      const sessionKey = `session:${sessionId}`;
      await this.redis.del(sessionKey);

      // Remove from user's session set
      if (userId || sessionInfo?.userId) {
        const userSessionsKey = `sessions:${userId || sessionInfo!.userId}`;
        await this.redis.srem(userSessionsKey, sessionId);
      }

      logger.debug('Session removed', { sessionId, userId: userId || sessionInfo?.userId });
    } catch (error) {
      logger.error('Failed to remove session:', error);
    }
  }

  /**
   * Remove all sessions for a user
   */
  async removeAllUserSessions(userId: string): Promise<string[]> {
    try {
      const userSessionsKey = `sessions:${userId}`;
      const sessionIds = await this.redis.smembers(userSessionsKey);

      // Remove all sessions
      const removePromises = sessionIds.map(sessionId => 
        this.removeSession(sessionId, userId)
      );
      await Promise.all(removePromises);

      // Clear session set
      await this.redis.del(userSessionsKey);

      logger.info('All user sessions removed', { userId, sessionCount: sessionIds.length });
      return sessionIds;
    } catch (error) {
      logger.error('Failed to remove all user sessions:', error);
      throw new StandardError(
        ErrorCode.INTERNAL_ERROR,
        'Failed to remove all sessions',
        {},
        error as Error
      );
    }
  }

  /**
   * Get all active sessions for a user
   */
  async getUserSessions(userId: string): Promise<SessionInfo[]> {
    try {
      const userSessionsKey = `sessions:${userId}`;
      const sessionIds = await this.redis.smembers(userSessionsKey);

      if (sessionIds.length === 0) {
        return [];
      }

      // Get session data for all sessions
      const sessionPromises = sessionIds.map(async (sessionId) => {
        const sessionKey = `session:${sessionId}`;
        const sessionData = await this.redis.get(sessionKey);
        
        if (sessionData) {
          const sessionInfo: SessionInfo = JSON.parse(sessionData);
          sessionInfo.createdAt = new Date(sessionInfo.createdAt);
          sessionInfo.lastActivity = new Date(sessionInfo.lastActivity);
          return sessionInfo;
        }
        
        return null;
      });

      const sessions = (await Promise.all(sessionPromises)).filter(
        (session): session is SessionInfo => session !== null
      );

      // Clean up any stale session IDs
      const validSessionIds = sessions.map(s => s.sessionId);
      const staleSessionIds = sessionIds.filter(id => !validSessionIds.includes(id));
      
      if (staleSessionIds.length > 0) {
        for (const staleId of staleSessionIds) {
          await this.redis.srem(userSessionsKey, staleId);
        }
      }

      return sessions.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
    } catch (error) {
      logger.error('Failed to get user sessions:', error);
      return [];
    }
  }

  /**
   * Enforce concurrent session limit
   */
  private async enforceSessionLimit(userId: string): Promise<void> {
    try {
      const sessions = await this.getUserSessions(userId);
      
      if (sessions.length >= this.config.maxSessionsPerUser) {
        // Remove oldest session(s) to make room
        const sessionsToRemove = sessions
          .sort((a, b) => a.lastActivity.getTime() - b.lastActivity.getTime())
          .slice(0, sessions.length - this.config.maxSessionsPerUser + 1);

        for (const session of sessionsToRemove) {
          await this.removeSession(session.sessionId, userId);
          logger.info('Session removed due to limit enforcement', {
            sessionId: session.sessionId,
            userId,
            lastActivity: session.lastActivity,
          });
        }
      }
    } catch (error) {
      logger.error('Failed to enforce session limit:', error);
    }
  }

  /**
   * Clean up expired sessions
   */
  private async cleanupExpiredSessions(): Promise<void> {
    try {
      // Get all session keys
      const sessionKeys = await this.redis.keys('session:*');
      let cleanedCount = 0;

      for (const sessionKey of sessionKeys) {
        const sessionData = await this.redis.get(sessionKey);
        
        if (sessionData) {
          try {
            const sessionInfo: SessionInfo = JSON.parse(sessionData);
            const lastActivity = new Date(sessionInfo.lastActivity);
            const now = new Date();
            
            // Check if session has expired
            if (now.getTime() - lastActivity.getTime() > this.config.sessionTimeoutMs) {
              const sessionId = sessionKey.replace('session:', '');
              await this.removeSession(sessionId, sessionInfo.userId);
              cleanedCount++;
            }
          } catch (parseError) {
            // Remove corrupted session data
            await this.redis.del(sessionKey);
            cleanedCount++;
          }
        } else {
          // Remove expired key
          await this.redis.del(sessionKey);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.info('Session cleanup completed', { cleanedCount, totalKeys: sessionKeys.length });
      }
    } catch (error) {
      logger.error('Session cleanup failed:', error);
    }
  }

  /**
   * Track session statistics
   */
  private async trackSessionStats(sessionInfo: SessionInfo): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      
      // Track daily session count
      await this.redis.incr(`stats:sessions:daily:${today}`);
      await this.redis.expire(`stats:sessions:daily:${today}`, 7 * 24 * 60 * 60); // Keep for 7 days

      // Track sessions by device type (simple user agent parsing)
      const deviceType = this.parseDeviceType(sessionInfo.userAgent || '');
      await this.redis.incr(`stats:sessions:device:${deviceType}`);
      await this.redis.expire(`stats:sessions:device:${deviceType}`, 30 * 24 * 60 * 60); // Keep for 30 days

      // Track sessions by location (if geolocation is enabled)
      if (this.config.enableGeolocation && sessionInfo.location) {
        const country = sessionInfo.location.split(',')[0] || 'unknown';
        await this.redis.incr(`stats:sessions:location:${country}`);
        await this.redis.expire(`stats:sessions:location:${country}`, 30 * 24 * 60 * 60);
      }
    } catch (error) {
      logger.error('Failed to track session stats:', error);
    }
  }

  /**
   * Get session statistics
   */
  async getSessionStats(): Promise<SessionStats> {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Get total active sessions
      const sessionKeys = await this.redis.keys('session:*');
      const totalSessions = sessionKeys.length;

      // Get active sessions (non-expired)
      let activeSessions = 0;
      const sessionsByDevice: Record<string, number> = {};
      const sessionsByLocation: Record<string, number> = {};
      let oldestSession: Date | undefined;
      let newestSession: Date | undefined;

      for (const sessionKey of sessionKeys) {
        const sessionData = await this.redis.get(sessionKey);
        
        if (sessionData) {
          try {
            const sessionInfo: SessionInfo = JSON.parse(sessionData);
            activeSessions++;

            const createdAt = new Date(sessionInfo.createdAt);
            if (!oldestSession || createdAt < oldestSession) {
              oldestSession = createdAt;
            }
            if (!newestSession || createdAt > newestSession) {
              newestSession = createdAt;
            }

            // Count by device type
            const deviceType = this.parseDeviceType(sessionInfo.userAgent || '');
            sessionsByDevice[deviceType] = (sessionsByDevice[deviceType] || 0) + 1;

            // Count by location
            if (sessionInfo.location) {
              const country = sessionInfo.location.split(',')[0] || 'unknown';
              sessionsByLocation[country] = (sessionsByLocation[country] || 0) + 1;
            }
          } catch (parseError) {
            // Skip corrupted data
          }
        }
      }

      // Get average session duration (approximate)
      const averageSessionDuration = 0; // Would need additional tracking

      return {
        totalSessions,
        activeSessions,
        sessionsByDevice,
        sessionsByLocation,
        averageSessionDuration,
        oldestSession,
        newestSession,
      };
    } catch (error) {
      logger.error('Failed to get session stats:', error);
      return {
        totalSessions: 0,
        activeSessions: 0,
        sessionsByDevice: {},
        sessionsByLocation: {},
        averageSessionDuration: 0,
      };
    }
  }

  /**
   * Parse device type from user agent
   */
  private parseDeviceType(userAgent: string): string {
    const ua = userAgent.toLowerCase();
    
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      return 'mobile';
    } else if (ua.includes('tablet') || ua.includes('ipad')) {
      return 'tablet';
    } else if (ua.includes('bot') || ua.includes('crawler') || ua.includes('spider')) {
      return 'bot';
    } else {
      return 'desktop';
    }
  }

  /**
   * Terminate suspicious sessions
   */
  async terminateSuspiciousSessions(userId: string, criteria: {
    maxAgeHours?: number;
    suspiciousIPs?: string[];
    suspiciousUserAgents?: string[];
  }): Promise<string[]> {
    try {
      const sessions = await this.getUserSessions(userId);
      const terminatedSessions: string[] = [];
      const now = new Date();

      for (const session of sessions) {
        let shouldTerminate = false;

        // Check age
        if (criteria.maxAgeHours) {
          const ageHours = (now.getTime() - session.createdAt.getTime()) / (1000 * 60 * 60);
          if (ageHours > criteria.maxAgeHours) {
            shouldTerminate = true;
          }
        }

        // Check IP
        if (criteria.suspiciousIPs?.includes(session.ipAddress || '')) {
          shouldTerminate = true;
        }

        // Check user agent
        if (criteria.suspiciousUserAgents?.some(ua => 
          session.userAgent?.toLowerCase().includes(ua.toLowerCase())
        )) {
          shouldTerminate = true;
        }

        if (shouldTerminate) {
          await this.removeSession(session.sessionId, userId);
          terminatedSessions.push(session.sessionId);
          
          logger.warn('Suspicious session terminated', {
            sessionId: session.sessionId,
            userId,
            ipAddress: session.ipAddress,
            userAgent: session.userAgent,
          });
        }
      }

      return terminatedSessions;
    } catch (error) {
      logger.error('Failed to terminate suspicious sessions:', error);
      throw new StandardError(
        ErrorCode.INTERNAL_ERROR,
        'Failed to terminate suspicious sessions',
        {},
        error as Error
      );
    }
  }

  /**
   * Get session activity timeline
   */
  async getSessionActivityTimeline(userId: string, hours: number = 24): Promise<Array<{
    timestamp: Date;
    action: string;
    details: any;
  }>> {
    try {
      const sessions = await this.getUserSessions(userId);
      const timeline: Array<{ timestamp: Date; action: string; details: any }> = [];

      for (const session of sessions) {
        timeline.push({
          timestamp: session.createdAt,
          action: 'session_created',
          details: {
            sessionId: session.sessionId,
            ipAddress: session.ipAddress,
            userAgent: session.userAgent,
          },
        });

        timeline.push({
          timestamp: session.lastActivity,
          action: 'last_activity',
          details: {
            sessionId: session.sessionId,
            duration: session.lastActivity.getTime() - session.createdAt.getTime(),
          },
        });
      }

      // Sort by timestamp
      timeline.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      // Filter by time range
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
      return timeline.filter(entry => entry.timestamp > cutoff);
    } catch (error) {
      logger.error('Failed to get session activity timeline:', error);
      return [];
    }
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    this.stopSessionCleanup();
    logger.info('Session management service cleaned up');
  }
}