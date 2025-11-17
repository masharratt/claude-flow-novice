/**
 * Edge Case Type Definitions
 *
 * Defines the schema for edge case tracking, deduplication, and feedback loop management.
 */

/**
 * Edge Case Types
 */
export enum EdgeCaseType {
  SYNTAX_ERROR = 'syntax_error',
  LOGIC_ERROR = 'logic_error',
  TIMEOUT = 'timeout',
  DATA_VALIDATION = 'data_validation',
  SYSTEM_ERROR = 'system_error'
}

/**
 * Edge Case Categories
 */
export enum EdgeCaseCategory {
  SKILL_EXECUTION = 'skill_execution',
  DATABASE_OPERATION = 'database_operation',
  COORDINATION = 'coordination',
  FILE_OPERATION = 'file_operation',
  API_CALL = 'api_call'
}

/**
 * Edge Case Priority Levels
 */
export enum EdgeCasePriority {
  CRITICAL = 'critical',  // Blocking production
  HIGH = 'high',          // Frequent occurrence
  MEDIUM = 'medium',      // Occasional
  LOW = 'low'             // Rare
}

/**
 * Edge Case Status in Feedback Loop
 */
export enum EdgeCaseStatus {
  NEW = 'new',
  INVESTIGATING = 'investigating',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
  WONT_FIX = 'wont_fix'
}

/**
 * Edge Case Input (for recording new cases)
 */
export interface EdgeCaseInput {
  type: EdgeCaseType;
  category: EdgeCaseCategory;
  context: any;  // JSON with error details
}

/**
 * Complete Edge Case Record
 */
export interface EdgeCase {
  id: string;
  signature: string;  // SHA-256(type + context)
  type: EdgeCaseType;
  category: EdgeCaseCategory;
  priority: EdgeCasePriority;
  context: any;  // JSON with error details
  status: EdgeCaseStatus;
  firstOccurred: Date;
  lastOccurred: Date;
  occurrenceCount: number;
  assignedExpert?: string;
  resolvedAt?: Date;
  resolution?: string;
}

/**
 * Edge Case Resolution Information
 */
export interface EdgeCaseResolution {
  description: string;
  fixedInCommit?: string;
  verificationTest?: string;
  notes?: string;
}

/**
 * Edge Case Notification
 */
export interface EdgeCaseNotification {
  id: string;
  edgeCaseId: string;
  priority: EdgeCasePriority;
  type: EdgeCaseType;
  category: EdgeCaseCategory;
  message: string;
  createdAt: Date;
  sentAt?: Date;
  channel: 'slack' | 'email';
}

/**
 * Edge Case Analytics
 */
export interface EdgeCaseAnalytics {
  totalCases: number;
  resolvedCases: number;
  resolutionRate: number;
  avgResolutionTimeHours: number;
  casesByPriority: Record<EdgeCasePriority, number>;
  casesByCategory: Record<EdgeCaseCategory, number>;
  casesByType: Record<EdgeCaseType, number>;
  topEdgeCases: Array<{
    id: string;
    signature: string;
    type: EdgeCaseType;
    category: EdgeCaseCategory;
    occurrenceCount: number;
    priority: EdgeCasePriority;
  }>;
}

/**
 * Edge Case Tracker Configuration
 */
export interface EdgeCaseTrackerConfig {
  dbPath: string;
  notificationConfig: {
    slack?: {
      enabled: boolean;
      webhookUrl?: string;
    };
    email?: {
      enabled: boolean;
      recipients?: string[];
      smtpConfig?: {
        host: string;
        port: number;
        secure: boolean;
        auth: {
          user: string;
          pass: string;
        };
      };
    };
  };
  autoCloseAfterDays?: number;  // Default: 7
  notificationThrottleMinutes?: number;  // Default: 60
}

/**
 * Query Options for Top Edge Cases
 */
export interface TopEdgeCasesQuery {
  limit?: number;
  orderBy?: 'frequency' | 'recent' | 'priority';
  category?: EdgeCaseCategory;
  type?: EdgeCaseType;
  status?: EdgeCaseStatus;
}
