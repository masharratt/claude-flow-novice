# User Preference Storage Architecture Design

## Executive Summary

This document outlines the architecture for a simple user preference storage feature supporting theme, language, and notification preferences in a web application.

**Recommendation**: Hybrid approach with localStorage for immediate UX + backend persistence for cross-device sync.

---

## 1. Preference Schema Design

### 1.1 TypeScript Schema Definition

```typescript
// User Preference Schema
interface UserPreferences {
  version: string;                    // Schema version for future migrations
  userId?: string;                    // Optional: links to authenticated user
  lastUpdated: string;                // ISO 8601 timestamp
  preferences: {
    theme: ThemePreference;
    language: LanguagePreference;
    notifications: NotificationPreferences;
  };
}

// Theme Preferences
interface ThemePreference {
  mode: 'light' | 'dark' | 'auto';   // Auto follows system preference
  accentColor?: string;               // Optional: hex color code
}

// Language Preferences
interface LanguagePreference {
  code: string;                       // ISO 639-1 language code (e.g., 'en', 'es')
  region?: string;                    // Optional: ISO 3166-1 region code (e.g., 'US', 'GB')
}

// Notification Preferences
interface NotificationPreferences {
  email: {
    enabled: boolean;
    frequency: 'instant' | 'daily' | 'weekly';
  };
  push: {
    enabled: boolean;
    types: NotificationType[];        // Array of enabled notification types
  };
  inApp: {
    enabled: boolean;
  };
}

type NotificationType = 'updates' | 'messages' | 'alerts' | 'marketing';

// Default Preferences
const DEFAULT_PREFERENCES: UserPreferences = {
  version: '1.0.0',
  lastUpdated: new Date().toISOString(),
  preferences: {
    theme: {
      mode: 'auto'
    },
    language: {
      code: 'en',
      region: 'US'
    },
    notifications: {
      email: {
        enabled: true,
        frequency: 'daily'
      },
      push: {
        enabled: false,
        types: []
      },
      inApp: {
        enabled: true
      }
    }
  }
};
```

### 1.2 Schema Design Principles

- **Versioning**: Schema version field enables future migrations without breaking changes
- **Extensibility**: Nested structure allows adding new preference categories
- **Type Safety**: Strong TypeScript types prevent invalid data
- **Defaults**: Sensible defaults ensure graceful degradation
- **Timestamps**: Track last update for conflict resolution

---

## 2. Storage Approach Evaluation

### 2.1 Trade-off Analysis

| Criteria | localStorage | Backend Database | Hybrid Approach |
|----------|--------------|------------------|-----------------|
| **Implementation Complexity** | Low (simple API) | Medium (requires API, auth, DB) | Medium-High |
| **Cross-device Sync** | ❌ No | ✅ Yes | ✅ Yes |
| **Performance** | ✅ Instant (synchronous) | ⚠️ Network latency | ✅ Best of both |
| **Data Persistence** | ⚠️ Browser-specific | ✅ Permanent | ✅ Permanent |
| **Offline Support** | ✅ Yes | ❌ No | ✅ Yes |
| **Security** | ⚠️ Client-side only | ✅ Server-controlled | ✅ Flexible |
| **Storage Limit** | ~5-10MB | ✅ Unlimited | ✅ Unlimited |
| **User Privacy** | ✅ Local-only option | ⚠️ Server stores data | ✅ Flexible |

### 2.2 Recommended Approach: Hybrid Storage

**Strategy**: localStorage as primary store + backend sync for authenticated users

#### Architecture Pattern

```typescript
class UserPreferenceManager {
  private localStorageKey = 'user_preferences';
  private syncEnabled = false;

  // Read preferences (localStorage first, backend fallback)
  async getPreferences(): Promise<UserPreferences> {
    // 1. Try localStorage first (instant)
    const localPrefs = this.readFromLocalStorage();

    // 2. If user authenticated, sync with backend
    if (this.isAuthenticated()) {
      this.syncEnabled = true;
      const backendPrefs = await this.fetchFromBackend();

      // 3. Conflict resolution: use most recent
      return this.mergePreferences(localPrefs, backendPrefs);
    }

    return localPrefs || DEFAULT_PREFERENCES;
  }

  // Write preferences (localStorage immediately, backend async)
  async setPreferences(prefs: UserPreferences): Promise<void> {
    // 1. Write to localStorage immediately (optimistic update)
    this.writeToLocalStorage(prefs);

    // 2. Sync to backend if authenticated (async, non-blocking)
    if (this.syncEnabled) {
      this.syncToBackend(prefs).catch(error => {
        console.error('Backend sync failed:', error);
        // localStorage still has the data, safe to continue
      });
    }
  }
}
```

#### Benefits of Hybrid Approach

1. **Instant UX**: Changes apply immediately via localStorage
2. **Cross-device Sync**: Backend persistence for authenticated users
3. **Offline Resilience**: Works without network connection
4. **Graceful Degradation**: Falls back to localStorage if backend unavailable
5. **Privacy Flexibility**: Anonymous users keep data local-only

---

## 3. Key Implementation Considerations

### 3.1 Data Validation and Type Safety

**Consideration**: Prevent invalid preference data from corrupting storage

**Implementation Strategy**:
```typescript
// Validation function with Zod or similar
import { z } from 'zod';

const PreferenceSchema = z.object({
  version: z.string(),
  userId: z.string().optional(),
  lastUpdated: z.string().datetime(),
  preferences: z.object({
    theme: z.object({
      mode: z.enum(['light', 'dark', 'auto']),
      accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional()
    }),
    language: z.object({
      code: z.string().length(2),
      region: z.string().length(2).optional()
    }),
    notifications: z.object({
      email: z.object({
        enabled: z.boolean(),
        frequency: z.enum(['instant', 'daily', 'weekly'])
      }),
      push: z.object({
        enabled: z.boolean(),
        types: z.array(z.enum(['updates', 'messages', 'alerts', 'marketing']))
      }),
      inApp: z.object({
        enabled: z.boolean()
      })
    })
  })
});

// Validate before storing
function validateAndStore(data: unknown): UserPreferences {
  try {
    return PreferenceSchema.parse(data);
  } catch (error) {
    console.error('Invalid preference data:', error);
    return DEFAULT_PREFERENCES; // Safe fallback
  }
}
```

**Why This Matters**:
- Prevents corrupted data from breaking the application
- Ensures type safety at runtime (localStorage is untyped)
- Provides clear error messages for debugging
- Enables safe schema evolution

---

### 3.2 Migration and Versioning Strategy

**Consideration**: Handle schema changes without data loss or breaking existing users

**Implementation Strategy**:
```typescript
// Migration system
interface Migration {
  from: string;
  to: string;
  migrate: (oldData: any) => UserPreferences;
}

const migrations: Migration[] = [
  {
    from: '1.0.0',
    to: '1.1.0',
    migrate: (old) => ({
      ...old,
      version: '1.1.0',
      preferences: {
        ...old.preferences,
        // Add new field with default
        theme: {
          ...old.preferences.theme,
          accentColor: '#0066cc' // New field in v1.1.0
        }
      }
    })
  }
];

function migratePreferences(data: any): UserPreferences {
  let currentVersion = data.version || '1.0.0';
  let migratedData = data;

  // Apply migrations sequentially
  for (const migration of migrations) {
    if (migration.from === currentVersion) {
      migratedData = migration.migrate(migratedData);
      currentVersion = migration.to;
    }
  }

  return migratedData;
}
```

**Why This Matters**:
- Allows adding new preferences without breaking existing users
- Provides upgrade path for schema evolution
- Maintains backward compatibility
- Enables gradual feature rollout

---

### 3.3 Privacy and Security Implications

**Consideration**: Protect user preference data from unauthorized access and misuse

**Security Measures**:

1. **localStorage Security**:
   - **Risk**: XSS attacks can read localStorage
   - **Mitigation**:
     - Sanitize all preference inputs
     - Use Content Security Policy (CSP)
     - Don't store sensitive data (passwords, tokens) in preferences
     - Consider encrypting sensitive preference fields

2. **Backend API Security**:
   - **Authentication**: Require valid JWT/session token for preference API
   - **Authorization**: Users can only read/write their own preferences
   - **Rate Limiting**: Prevent abuse of preference update endpoints
   - **Input Validation**: Server-side validation of all preference data

3. **Privacy Considerations**:
   ```typescript
   // Privacy-aware preference manager
   class PrivacyAwarePreferenceManager {
     // Allow users to opt-out of backend sync
     async setPrivacyMode(enabled: boolean): Promise<void> {
       if (enabled) {
         // Delete backend preferences
         await this.deleteFromBackend();
         this.syncEnabled = false;
       } else {
         // Restore sync capability
         this.syncEnabled = true;
       }
     }

     // Export preferences for GDPR compliance
     async exportUserData(): Promise<UserPreferences> {
       return this.getPreferences();
     }

     // Delete all user data (GDPR right to deletion)
     async deleteAllData(): Promise<void> {
       localStorage.removeItem(this.localStorageKey);
       await this.deleteFromBackend();
     }
   }
   ```

**Why This Matters**:
- Compliance with GDPR, CCPA, and privacy regulations
- Protection against XSS and injection attacks
- User trust and data sovereignty
- Legal liability reduction

---

## 4. Implementation Roadmap

### Phase 1: Core Functionality (Week 1)
- ✅ Define TypeScript schemas and interfaces
- ✅ Implement localStorage-based preference manager
- ✅ Build validation layer with Zod
- ✅ Create default preferences and initialization logic

### Phase 2: Backend Integration (Week 2)
- ✅ Design REST API endpoints (`GET/POST /api/preferences`)
- ✅ Implement backend preference storage (database table)
- ✅ Add authentication and authorization middleware
- ✅ Build hybrid sync mechanism

### Phase 3: Migration & Security (Week 3)
- ✅ Implement migration system for schema versioning
- ✅ Add privacy controls (opt-in/opt-out)
- ✅ Security hardening (CSP, rate limiting, input validation)
- ✅ GDPR compliance features (export, delete)

### Phase 4: Testing & Optimization (Week 4)
- ✅ Unit tests for validation and migration logic
- ✅ Integration tests for hybrid sync
- ✅ Performance testing (localStorage vs backend latency)
- ✅ Security audit and penetration testing

---

## 5. API Design

### 5.1 REST API Endpoints

```typescript
// GET /api/preferences - Retrieve user preferences
// Auth: Required (JWT token)
// Response: UserPreferences object
GET /api/preferences
Authorization: Bearer <token>

Response 200:
{
  "version": "1.0.0",
  "userId": "user_123",
  "lastUpdated": "2025-09-30T12:00:00Z",
  "preferences": { ... }
}

// POST /api/preferences - Update user preferences
// Auth: Required (JWT token)
// Request: Partial or full UserPreferences object
POST /api/preferences
Authorization: Bearer <token>
Content-Type: application/json

{
  "preferences": {
    "theme": {
      "mode": "dark"
    }
  }
}

Response 200:
{
  "success": true,
  "updated": true,
  "preferences": { ... }
}

// DELETE /api/preferences - Delete user preferences (GDPR)
// Auth: Required (JWT token)
DELETE /api/preferences
Authorization: Bearer <token>

Response 204: No Content
```

### 5.2 Database Schema (PostgreSQL)

```sql
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version VARCHAR(10) NOT NULL,
  preferences JSONB NOT NULL,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Constraints
  UNIQUE(user_id),
  CHECK (preferences IS NOT NULL)
);

-- Index for fast user lookups
CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);

-- Index for JSONB queries (optional, for advanced filtering)
CREATE INDEX idx_user_preferences_theme ON user_preferences((preferences->'theme'->>'mode'));
```

---

## 6. Success Metrics

- **Performance**: Preference read latency < 50ms (localStorage), < 200ms (backend)
- **Reliability**: 99.9% uptime for preference sync API
- **Security**: Zero XSS vulnerabilities, 100% authenticated API access
- **Adoption**: 80%+ of authenticated users opt-in to cross-device sync
- **Data Integrity**: Zero data corruption incidents in production

---

## 7. Risks and Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| localStorage quota exceeded | High | Low | Implement size monitoring, clear old data |
| Backend sync conflicts | Medium | Medium | Use timestamp-based conflict resolution |
| XSS attack reading preferences | High | Low | CSP, input sanitization, no sensitive data |
| Schema migration failure | High | Low | Comprehensive testing, rollback capability |
| GDPR non-compliance | Critical | Low | Privacy controls, audit trail, legal review |

---

## Appendix: Alternative Approaches Considered

### A. Backend-Only Storage
- **Rejected**: Poor offline support, higher latency, requires constant authentication
- **Use Case**: Enterprise applications with strict data governance

### B. localStorage-Only Storage
- **Rejected**: No cross-device sync, limited to 5-10MB, browser-specific
- **Use Case**: Simple applications without user accounts

### C. IndexedDB Storage
- **Rejected**: More complex API, overkill for simple preferences
- **Use Case**: Applications with large client-side datasets (>10MB)

---

## Document Metadata

- **Author**: Architect Agent
- **Version**: 1.0.0
- **Date**: 2025-09-30
- **Status**: Final Design
- **Confidence Score**: 0.85/1.0
- **Review Status**: Pending consensus validation
