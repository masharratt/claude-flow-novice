/**
 * User Preference Manager - Usage Examples
 *
 * This file demonstrates how to use the UserPreferenceManager
 * in different scenarios.
 */

import {
  UserPreferenceManager,
  getDefaultPreferenceManager,
  createPreferenceManager,
  PreferenceError,
} from "./user-preference-manager";

/**
 * Example 1: Basic Usage
 */
async function basicUsageExample() {
  console.log("=== Example 1: Basic Usage ===\n");

  const prefs = new UserPreferenceManager();

  // Initialize the preference manager
  await prefs.initialize();
  console.log("✓ Preference manager initialized");

  // Set preferences
  await prefs.setPreference("theme", "dark");
  console.log("✓ Set theme to 'dark'");

  await prefs.setPreference("language", "es");
  console.log("✓ Set language to 'es'");

  // Get preferences
  const theme = prefs.getPreference<string>("theme");
  console.log(`✓ Retrieved theme: ${theme}`);

  // Get with default value
  const fontSize = prefs.getPreference<number>("fontSize", 14);
  console.log(`✓ Retrieved fontSize with default: ${fontSize}`);

  console.log("\n");
}

/**
 * Example 2: Using the Singleton Pattern
 */
async function singletonExample() {
  console.log("=== Example 2: Singleton Pattern ===\n");

  const prefs1 = getDefaultPreferenceManager();
  await prefs1.initialize();

  await prefs1.setPreference("theme", "dark");

  // Get the same instance elsewhere
  const prefs2 = getDefaultPreferenceManager();
  const theme = prefs2.getPreference("theme");

  console.log(`✓ Retrieved theme from singleton: ${theme}`);
  console.log("✓ Both instances share the same data");

  console.log("\n");
}

/**
 * Example 3: Event Handling
 */
async function eventHandlingExample() {
  console.log("=== Example 3: Event Handling ===\n");

  const prefs = new UserPreferenceManager();

  // Set up event listeners
  prefs.on("initialized", (data) => {
    console.log(`✓ Event: initialized at ${data.timestamp}`);
  });

  prefs.on("preferenceChanged", (data) => {
    console.log(`✓ Event: ${data.key} changed from ${data.oldValue} to ${data.newValue}`);
  });

  prefs.on("preferencesSaved", (data) => {
    console.log(`✓ Event: Saved ${data.count} preferences to ${data.path}`);
  });

  await prefs.initialize();
  await prefs.setPreference("theme", "dark");
  await prefs.setPreference("theme", "light"); // Will trigger change event

  console.log("\n");
}

/**
 * Example 4: Error Handling
 */
async function errorHandlingExample() {
  console.log("=== Example 4: Error Handling ===\n");

  const prefs = new UserPreferenceManager();

  try {
    // This will throw - not initialized
    prefs.getPreference("theme");
  } catch (error) {
    if (error instanceof PreferenceError) {
      console.log(`✓ Caught expected error: ${error.message}`);
    }
  }

  await prefs.initialize();

  try {
    // This will throw - invalid key
    await prefs.setPreference("", "value");
  } catch (error) {
    if (error instanceof PreferenceError) {
      console.log(`✓ Caught expected error: ${error.message}`);
    }
  }

  try {
    // This will throw - undefined value
    await prefs.setPreference("test", undefined);
  } catch (error) {
    if (error instanceof PreferenceError) {
      console.log(`✓ Caught expected error: ${error.message}`);
    }
  }

  console.log("\n");
}

/**
 * Example 5: Custom Storage Path
 */
async function customStorageExample() {
  console.log("=== Example 5: Custom Storage Path ===\n");

  const prefs = createPreferenceManager({
    storagePath: "/tmp/custom-preferences.json",
    autoSave: true,
    cacheEnabled: true,
  });

  await prefs.initialize();
  console.log(`✓ Custom storage path: ${prefs.getStoragePath()}`);

  await prefs.setPreference("customSetting", "value");
  console.log("✓ Set custom preference (auto-saved)");

  console.log("\n");
}

/**
 * Example 6: Bulk Operations
 */
async function bulkOperationsExample() {
  console.log("=== Example 6: Bulk Operations ===\n");

  const prefs = new UserPreferenceManager();
  await prefs.initialize();

  // Set multiple preferences
  await prefs.setPreference("theme", "dark");
  await prefs.setPreference("language", "en");
  await prefs.setPreference("notifications", false);

  // Get all preferences
  const allPrefs = prefs.getAllPreferences();
  console.log("✓ All preferences:", allPrefs);

  // Check preference count
  console.log(`✓ Total preferences: ${prefs.getPreferenceCount()}`);

  // Check if preference exists
  console.log(`✓ Has 'theme': ${prefs.hasPreference("theme")}`);
  console.log(`✓ Has 'unknown': ${prefs.hasPreference("unknown")}`);

  console.log("\n");
}

/**
 * Example 7: Reset and Defaults
 */
async function resetExample() {
  console.log("=== Example 7: Reset and Defaults ===\n");

  const prefs = new UserPreferenceManager();
  await prefs.initialize();

  // Modify some preferences
  await prefs.setPreference("theme", "dark");
  await prefs.setPreference("language", "es");

  console.log("✓ Modified preferences");
  console.log(`  - Theme: ${prefs.getPreference("theme")}`);
  console.log(`  - Language: ${prefs.getPreference("language")}`);

  // Reset to defaults
  await prefs.reset();
  console.log("✓ Reset to defaults");
  console.log(`  - Theme: ${prefs.getPreference("theme")}`);
  console.log(`  - Language: ${prefs.getPreference("language")}`);

  console.log("\n");
}

/**
 * Example 8: Manual Save/Load
 */
async function manualSaveLoadExample() {
  console.log("=== Example 8: Manual Save/Load ===\n");

  // Create with auto-save disabled
  const prefs = createPreferenceManager({
    autoSave: false,
  });

  await prefs.initialize();

  // Set preferences (not auto-saved)
  await prefs.setPreference("theme", "dark");
  await prefs.setPreference("language", "es");

  console.log("✓ Set preferences (not auto-saved)");

  // Manually save
  await prefs.save();
  console.log("✓ Manually saved preferences");

  // Create new instance and load
  const prefs2 = createPreferenceManager({
    storagePath: prefs.getStoragePath(),
  });

  await prefs2.load();
  console.log("✓ Loaded preferences into new instance");
  console.log(`  - Theme: ${prefs2.getPreference("theme")}`);
  console.log(`  - Language: ${prefs2.getPreference("language")}`);

  console.log("\n");
}

/**
 * Run all examples
 */
async function runAllExamples() {
  console.log("\n╔═══════════════════════════════════════════════╗");
  console.log("║   User Preference Manager - Usage Examples   ║");
  console.log("╚═══════════════════════════════════════════════╝\n");

  try {
    await basicUsageExample();
    await singletonExample();
    await eventHandlingExample();
    await errorHandlingExample();
    await customStorageExample();
    await bulkOperationsExample();
    await resetExample();
    await manualSaveLoadExample();

    console.log("╔═══════════════════════════════════════════════╗");
    console.log("║          All examples completed! ✓            ║");
    console.log("╚═══════════════════════════════════════════════╝\n");
  } catch (error) {
    console.error("Error running examples:", error);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  runAllExamples();
}

// Export for use in other modules
export {
  basicUsageExample,
  singletonExample,
  eventHandlingExample,
  errorHandlingExample,
  customStorageExample,
  bulkOperationsExample,
  resetExample,
  manualSaveLoadExample,
};
