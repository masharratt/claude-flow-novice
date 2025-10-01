/**
 * User Preference Storage Manager
 *
 * A simple preference manager for storing user-specific settings.
 * Follows the architecture patterns from config-manager.ts
 *
 * @module UserPreferenceManager
 */

import { promises as fs } from "fs";
import * as path from "path";
import * as os from "os";
import { EventEmitter } from "events";

/**
 * User preference data structure
 */
export interface UserPreference {
  key: string;
  value: any;
  type: "string" | "number" | "boolean" | "object";
  timestamp: number;
}

/**
 * Preference storage options
 */
export interface PreferenceOptions {
  storagePath?: string;
  autoSave?: boolean;
  cacheEnabled?: boolean;
}

/**
 * Custom error for preference operations
 */
export class PreferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreferenceError";
  }
}

/**
 * Default preferences for new installations
 */
const DEFAULT_PREFERENCES: Record<string, any> = {
  theme: "light",
  language: "en",
  notifications: true,
  autoSave: true,
  maxHistoryItems: 50,
};

/**
 * User Preference Manager
 *
 * Manages user-specific preferences with automatic persistence,
 * error handling, and type safety.
 */
export class UserPreferenceManager extends EventEmitter {
  private preferences: Map<string, UserPreference>;
  private storagePath: string;
  private autoSave: boolean;
  private cacheEnabled: boolean;
  private isInitialized: boolean;

  /**
   * Creates a new UserPreferenceManager instance
   *
   * @param options - Configuration options for the preference manager
   */
  constructor(options: PreferenceOptions = {}) {
    super();

    this.preferences = new Map();
    this.storagePath =
      options.storagePath ||
      path.join(os.homedir(), ".claude-flow", "user-preferences.json");
    this.autoSave = options.autoSave ?? true;
    this.cacheEnabled = options.cacheEnabled ?? true;
    this.isInitialized = false;
  }

  /**
   * Initializes the preference manager and loads existing preferences
   *
   * @returns Promise that resolves when initialization is complete
   * @throws {PreferenceError} If initialization fails
   */
  async initialize(): Promise<void> {
    try {
      // Ensure storage directory exists
      const dir = path.dirname(this.storagePath);
      await fs.mkdir(dir, { recursive: true });

      // Load existing preferences or create defaults
      try {
        await this.load();
      } catch (error) {
        // No existing preferences file, load defaults
        await this.loadDefaults();

        if (this.autoSave) {
          await this.save();
        }
      }

      this.isInitialized = true;
      this.emit("initialized", { timestamp: new Date() });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new PreferenceError(
        `Failed to initialize preference manager: ${errorMessage}`,
      );
    }
  }

  /**
   * Retrieves a preference value by key
   *
   * @param key - The preference key to retrieve
   * @param defaultValue - Optional default value if preference doesn't exist
   * @returns The preference value or defaultValue if not found
   * @throws {PreferenceError} If manager is not initialized
   */
  getPreference<T = any>(key: string, defaultValue?: T): T | undefined {
    this.ensureInitialized();

    try {
      const preference = this.preferences.get(key);

      if (!preference) {
        this.emit("preferenceNotFound", { key, timestamp: new Date() });
        return defaultValue;
      }

      this.emit("preferenceRetrieved", {
        key,
        type: preference.type,
        timestamp: new Date(),
      });

      return preference.value as T;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new PreferenceError(
        `Failed to get preference '${key}': ${errorMessage}`,
      );
    }
  }

  /**
   * Sets a preference value
   *
   * @param key - The preference key to set
   * @param value - The value to store
   * @returns Promise that resolves when preference is set (and saved if autoSave is enabled)
   * @throws {PreferenceError} If manager is not initialized or value is invalid
   */
  async setPreference(key: string, value: any): Promise<void> {
    this.ensureInitialized();

    try {
      // Validate input
      if (!key || typeof key !== "string") {
        throw new PreferenceError("Preference key must be a non-empty string");
      }

      if (value === undefined) {
        throw new PreferenceError("Preference value cannot be undefined");
      }

      // Determine value type
      const valueType = this.determineType(value);

      // Create preference object
      const preference: UserPreference = {
        key,
        value,
        type: valueType,
        timestamp: Date.now(),
      };

      // Store in map
      const oldValue = this.preferences.get(key);
      this.preferences.set(key, preference);

      // Emit change event
      this.emit("preferenceChanged", {
        key,
        oldValue: oldValue?.value,
        newValue: value,
        timestamp: new Date(),
      });

      // Auto-save if enabled
      if (this.autoSave) {
        await this.save();
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new PreferenceError(
        `Failed to set preference '${key}': ${errorMessage}`,
      );
    }
  }

  /**
   * Removes a preference by key
   *
   * @param key - The preference key to remove
   * @returns Promise that resolves when preference is removed
   * @throws {PreferenceError} If manager is not initialized
   */
  async removePreference(key: string): Promise<boolean> {
    this.ensureInitialized();

    try {
      const existed = this.preferences.has(key);

      if (existed) {
        const preference = this.preferences.get(key);
        this.preferences.delete(key);

        this.emit("preferenceRemoved", {
          key,
          value: preference?.value,
          timestamp: new Date(),
        });

        if (this.autoSave) {
          await this.save();
        }
      }

      return existed;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new PreferenceError(
        `Failed to remove preference '${key}': ${errorMessage}`,
      );
    }
  }

  /**
   * Loads default preferences
   *
   * @returns Promise that resolves when defaults are loaded
   * @throws {PreferenceError} If loading defaults fails
   */
  async loadDefaults(): Promise<void> {
    try {
      this.preferences.clear();

      for (const [key, value] of Object.entries(DEFAULT_PREFERENCES)) {
        const preference: UserPreference = {
          key,
          value,
          type: this.determineType(value),
          timestamp: Date.now(),
        };
        this.preferences.set(key, preference);
      }

      this.emit("defaultsLoaded", {
        count: this.preferences.size,
        timestamp: new Date(),
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new PreferenceError(`Failed to load defaults: ${errorMessage}`);
    }
  }

  /**
   * Saves preferences to storage
   *
   * @returns Promise that resolves when save is complete
   * @throws {PreferenceError} If save operation fails
   */
  async save(): Promise<void> {
    try {
      // Convert Map to serializable object
      const data: Record<string, UserPreference> = {};

      for (const [key, preference] of this.preferences.entries()) {
        data[key] = preference;
      }

      // Write to file
      const content = JSON.stringify(data, null, 2);
      await fs.writeFile(this.storagePath, content, "utf8");

      this.emit("preferencesSaved", {
        count: this.preferences.size,
        path: this.storagePath,
        timestamp: new Date(),
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new PreferenceError(`Failed to save preferences: ${errorMessage}`);
    }
  }

  /**
   * Loads preferences from storage
   *
   * @returns Promise that resolves when load is complete
   * @throws {PreferenceError} If load operation fails
   */
  async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.storagePath, "utf8");
      const data: Record<string, UserPreference> = JSON.parse(content);

      this.preferences.clear();

      for (const [key, preference] of Object.entries(data)) {
        // Validate loaded preference structure
        if (this.isValidPreference(preference)) {
          this.preferences.set(key, preference);
        }
      }

      this.emit("preferencesLoaded", {
        count: this.preferences.size,
        path: this.storagePath,
        timestamp: new Date(),
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new PreferenceError(
          `Preferences file not found: ${this.storagePath}`,
        );
      }
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new PreferenceError(`Failed to load preferences: ${errorMessage}`);
    }
  }

  /**
   * Gets all preferences as a plain object
   *
   * @returns Object containing all preferences
   */
  getAllPreferences(): Record<string, any> {
    this.ensureInitialized();

    const result: Record<string, any> = {};

    for (const [key, preference] of this.preferences.entries()) {
      result[key] = preference.value;
    }

    return result;
  }

  /**
   * Resets all preferences to defaults
   *
   * @returns Promise that resolves when reset is complete
   */
  async reset(): Promise<void> {
    this.ensureInitialized();

    await this.loadDefaults();

    if (this.autoSave) {
      await this.save();
    }

    this.emit("preferencesReset", { timestamp: new Date() });
  }

  /**
   * Checks if a preference exists
   *
   * @param key - The preference key to check
   * @returns True if preference exists, false otherwise
   */
  hasPreference(key: string): boolean {
    this.ensureInitialized();
    return this.preferences.has(key);
  }

  /**
   * Gets the storage path
   *
   * @returns The current storage path
   */
  getStoragePath(): string {
    return this.storagePath;
  }

  /**
   * Gets preference count
   *
   * @returns Number of stored preferences
   */
  getPreferenceCount(): number {
    return this.preferences.size;
  }

  // Private helper methods

  /**
   * Ensures the manager is initialized before operations
   *
   * @throws {PreferenceError} If not initialized
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new PreferenceError(
        "PreferenceManager not initialized. Call initialize() first.",
      );
    }
  }

  /**
   * Determines the type of a value
   *
   * @param value - Value to check
   * @returns Type string
   */
  private determineType(
    value: any,
  ): "string" | "number" | "boolean" | "object" {
    if (typeof value === "string") return "string";
    if (typeof value === "number") return "number";
    if (typeof value === "boolean") return "boolean";
    return "object";
  }

  /**
   * Validates a preference object structure
   *
   * @param preference - Preference to validate
   * @returns True if valid, false otherwise
   */
  private isValidPreference(preference: any): preference is UserPreference {
    return (
      preference &&
      typeof preference === "object" &&
      typeof preference.key === "string" &&
      preference.value !== undefined &&
      ["string", "number", "boolean", "object"].includes(preference.type) &&
      typeof preference.timestamp === "number"
    );
  }
}

/**
 * Export singleton instance factory
 */
let defaultInstance: UserPreferenceManager | null = null;

/**
 * Gets the default preference manager instance
 *
 * @returns Singleton instance of UserPreferenceManager
 */
export function getDefaultPreferenceManager(): UserPreferenceManager {
  if (!defaultInstance) {
    defaultInstance = new UserPreferenceManager();
  }
  return defaultInstance;
}

/**
 * Creates a new preference manager instance
 *
 * @param options - Configuration options
 * @returns New UserPreferenceManager instance
 */
export function createPreferenceManager(
  options?: PreferenceOptions,
): UserPreferenceManager {
  return new UserPreferenceManager(options);
}
