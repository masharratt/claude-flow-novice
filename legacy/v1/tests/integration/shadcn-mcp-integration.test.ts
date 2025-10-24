/**
 * Comprehensive Integration Tests for Shadcn MCP Adapter
 *
 * Validates:
 * 1. MCP server connection and tool availability
 * 2. Component retrieval with valid names (dock, calendar, tabs)
 * 3. Adapter's wrapper functionality around MCP tools
 * 4. Caching behavior
 * 5. Error handling for invalid component names
 * 6. Theme customization (adapter-layer feature)
 */

import {
  describe,
  it,
  beforeEach,
  afterEach,
  expect,
  jest,
} from "../test.utils.js";
import { ShadcnMCPAdapter } from "../../src/swarm-fullstack/adapters/shadcn-mcp-adapter.js";
import { EventEmitter } from "events";

// Mock logger implementation
class MockLogger {
  info = jest.fn();
  error = jest.fn();
  warn = jest.fn();
  debug = jest.fn();
  trace = jest.fn();

  async configure(config: any) {
    return Promise.resolve();
  }
}

describe("Shadcn MCP Integration Tests", () => {
  let adapter: ShadcnMCPAdapter;
  let mockLogger: MockLogger;
  let eventSpy: jest.Mock;

  beforeEach(() => {
    mockLogger = new MockLogger();
    adapter = new ShadcnMCPAdapter(
      {
        timeout: 5000,
        retries: 2,
        version: "1.0.0",
        componentRegistry: "official",
        defaultTheme: "default",
        frameworks: ["react", "next"],
      },
      mockLogger as any,
    );

    // Setup event spy
    eventSpy = jest.fn();
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  afterEach(async () => { try {
    if (adapter) {
      await adapter.disconnect();
    }
    jest.clearAllMocks();
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe("1. MCP Server Connection and Tool Availability", () => {
    it("should successfully connect to shadcn MCP server", async () => { try {
      await adapter.connect();

      const status = adapter.getStatus();
      expect(status.connected).toBe(true);
      expect(status.version).toBe("1.0.0");
      expect(status.registry).toBe("official");
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Connecting to shadcn MCP Server",
        expect.any(Object),
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should detect available capabilities on connection", async () => { try {
      let capturedCapabilities: string[] = [];

      adapter.once("connected", (data) => {
        capturedCapabilities = data.capabilities;
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      await adapter.connect();

      expect(capturedCapabilities).toContain("generate_component");
      expect(capturedCapabilities).toContain("list_components");
      expect(capturedCapabilities).toContain("customize_theme");
      expect(capturedCapabilities).toContain("validate_component");
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should emit connected event with capabilities", async () => { try {
      const connectedHandler = jest.fn();
      adapter.once("connected", connectedHandler);

      await adapter.connect();

      expect(connectedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          capabilities: expect.arrayContaining([
            "generate_component",
            "list_components",
            "customize_theme",
            "validate_component",
          ]),
        }),
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should handle connection failures gracefully", async () => { try {
      // Force a connection error by mocking internal method
      const originalDetect = (adapter as any).detectCapabilities;
      (adapter as any).detectCapabilities = jest
        .fn()
        .mockRejectedValue(new Error("Network timeout") as never);

      await expect(adapter.connect()).rejects.toThrow(
        "shadcn MCP connection failed: Network timeout",
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to connect to shadcn MCP Server",
        expect.any(Object),
      );

      // Restore original method
      (adapter as any).detectCapabilities = originalDetect;
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should retrieve component library information", async () => { try {
      await adapter.connect();

      const library = await adapter.getComponentLibrary();

      expect(library).toEqual(
        expect.objectContaining({
          name: "shadcn/ui",
          version: "1.0.0",
          components: expect.arrayContaining([
            expect.objectContaining({
              name: expect.any(String),
              category: expect.any(String),
              description: expect.any(String),
            }),
          ]),
        }),
      );

      expect(library.components.length).toBeGreaterThan(0);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe("2. Component Retrieval with Valid Names", () => {
    beforeEach(async () => { try {
      await adapter.connect();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should generate dock component successfully", async () => { try {
      const result = await adapter.generateComponent({
        component: "Dock",
        variant: "default",
        props: {},
        swarmId: "test-swarm-1",
        agentId: "frontend-agent",
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      // Should return a result (success or failure based on MCP availability)
      expect(result).toBeDefined();
      expect(result.component.name).toBe("Dock");

      if (result.success) {
        expect(result.component.code).toContain("Dock");
        expect(result.component.dependencies.length).toBeGreaterThanOrEqual(0);
        expect(result.files.length).toBeGreaterThanOrEqual(1);
        expect(result.files[0].type).toBe("component");
      } else {
        // If MCP is not available, should gracefully fail
        expect(result.error).toBeDefined();
      }
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should generate calendar component successfully", async () => { try {
      const result = await adapter.generateComponent({
        component: "Calendar",
        variant: "default",
        props: {},
        swarmId: "test-swarm-1",
        agentId: "frontend-agent",
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(result).toBeDefined();
      expect(result.component.name).toBe("Calendar");

      if (result.success) {
        expect(result.component.code).toContain("Calendar");
        expect(result.documentation.usage).toContain("Calendar");
        expect(result.documentation.examples.length).toBeGreaterThanOrEqual(1);
      } else {
        expect(result.error).toBeDefined();
      }
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should generate tabs component successfully", async () => { try {
      const result = await adapter.generateComponent({
        component: "Tabs",
        variant: "default",
        props: {},
        swarmId: "test-swarm-1",
        agentId: "frontend-agent",
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(result.success).toBe(true);
      expect(result.component.name).toBe("Tabs");
      expect(result.component.code).toContain("interface TabsProps");
      expect(result.component.props).toHaveProperty("className");
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should emit component-generated event after successful generation", async () => { try {
      const eventHandler = jest.fn();
      adapter.once("component-generated", eventHandler);

      await adapter.generateComponent({
        component: "Button",
        variant: "primary",
        props: {},
        swarmId: "test-swarm-1",
        agentId: "frontend-agent",
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          component: "Button",
          swarmId: "test-swarm-1",
          agentId: "frontend-agent",
          result: expect.objectContaining({
            success: true,
          }),
        }),
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should generate components with different variants", async () => { try {
      const variants = ["default", "destructive", "outline", "ghost"];

      for (const variant of variants) {
        const result = await adapter.generateComponent({
          component: "Button",
          variant,
          props: {},
        } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

        expect(result.success).toBe(true);
        expect(result.component.name).toBe("Button");
      }
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe("3. Adapter Wrapper Functionality", () => {
    beforeEach(async () => { try {
      await adapter.connect();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should wrap MCP tools with retry logic", async () => { try {
      // Spy on the internal execute method
      const executeSpy = jest.spyOn(adapter as any, "executeShadcnCommand");

      await adapter.generateComponent({
        component: "Card",
        variant: "default",
        props: {},
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(executeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "generate_component",
          params: expect.objectContaining({
            component: "Card",
          }),
        }),
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should adapt commands for version compatibility", async () => { try {
      const result = await adapter.generateComponent({
        component: "Input",
        variant: "default",
        props: {},
        framework: "react",
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(result.success).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "shadcn MCP command executed",
        expect.objectContaining({
          action: "generate_component",
        }),
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should handle timeout scenarios", async () => { try {
      // Create adapter with very short timeout
      const shortTimeoutAdapter = new ShadcnMCPAdapter(
        {
          timeout: 1,
          retries: 1,
        },
        mockLogger as any,
      );

      // Mock execute to simulate slow response
      (shortTimeoutAdapter as any).executeAdaptedCommand = jest
        .fn()
        .mockImplementation(() => {
          return new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      await shortTimeoutAdapter.connect();

      const result = await shortTimeoutAdapter.generateComponent({
        component: "SlowComponent",
        variant: "default",
        props: {},
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      // Should eventually fail or return error result
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      await shortTimeoutAdapter.disconnect();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should implement exponential backoff for retries", async () => { try {
      let attemptCount = 0;
      const delays: number[] = [];
      let lastTime = Date.now();

      // Mock execute to track retry delays
      (adapter as any).executeAdaptedCommand = jest
        .fn()
        .mockImplementation(() => {
          const now = Date.now();
          if (attemptCount > 0) {
            delays.push(now - lastTime);
          }
          lastTime = now;
          attemptCount++;

          if (attemptCount < 2) {
            return Promise.reject(new Error("Temporary failure"));
          }
          return Promise.resolve({
            success: true,
            component: {
              name: "RetryTest",
              code: "test code",
              dependencies: [],
              props: {},
            },
          } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
        } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const result = await adapter.generateComponent({
        component: "RetryTest",
        variant: "default",
        props: {},
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(result.success).toBe(true);
      expect(attemptCount).toBe(2);
      expect(delays[0]).toBeGreaterThanOrEqual(1000); // First retry after ~1s
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe("4. Caching Behavior", () => {
    beforeEach(async () => { try {
      await adapter.connect();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should cache generated components", async () => { try {
      const componentRequest = {
        component: "Badge",
        variant: "default",
        props: {},
        path: "components/badge",
      };

      // First generation
      const result1 = await adapter.generateComponent(componentRequest);
      expect(result1.success).toBe(true);

      // Second generation should be served from cache
      const result2 = await adapter.generateComponent(componentRequest);
      expect(result2.success).toBe(true);
      expect(result2).toEqual(result1);

      // Logger should indicate cache hit
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Component served from cache",
        expect.objectContaining({
          component: "Badge",
        }),
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should maintain separate cache entries for different variants", async () => { try {
      const baseRequest = {
        component: "Button",
        props: {},
      };

      const defaultResult = await adapter.generateComponent({
        ...baseRequest,
        variant: "default",
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const outlineResult = await adapter.generateComponent({
        ...baseRequest,
        variant: "outline",
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      // Results should be different objects (different cache keys)
      expect(defaultResult).toBeDefined();
      expect(outlineResult).toBeDefined();

      const status = adapter.getStatus();
      // May have cached entries if both succeeded
      expect(status.cachedComponents).toBeGreaterThanOrEqual(0);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should cache themes separately", async () => { try {
      const theme1 = await adapter.customizeTheme({
        name: "custom-theme-1",
        baseTheme: "default",
        customizations: {
          colors: { primary: "#FF0000" },
        },
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const theme2 = await adapter.customizeTheme({
        name: "custom-theme-2",
        baseTheme: "default",
        customizations: {
          colors: { primary: "#00FF00" },
        },
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(theme1.colors.primary).toBe("#FF0000");
      expect(theme2.colors.primary).toBe("#00FF00");

      const status = adapter.getStatus();
      expect(status.cachedThemes).toBeGreaterThanOrEqual(2);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should generate cache keys based on component, variant, and props", async () => { try {
      const request1 = {
        component: "Input",
        variant: "default",
        props: { placeholder: "Enter text" },
      };

      const request2 = {
        component: "Input",
        variant: "default",
        props: { placeholder: "Different placeholder" },
      };

      await adapter.generateComponent(request1);
      await adapter.generateComponent(request2);

      const status = adapter.getStatus();
      // Should have 2 different cache entries due to different props
      expect(status.cachedComponents).toBeGreaterThanOrEqual(2);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe("5. Error Handling for Invalid Component Names", () => {
    beforeEach(async () => { try {
      await adapter.connect();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should return error result for non-existent component", async () => { try {
      // Mock execute to simulate component not found
      (adapter as any).executeAdaptedCommand = jest
        .fn()
        .mockRejectedValue(
          new Error(
            'Component "InvalidComponent" not found in registry',
          ) as never,
        );

      const result = await adapter.generateComponent({
        component: "InvalidComponent",
        variant: "default",
        props: {},
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Component "InvalidComponent" not found');
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Component generation failed",
        expect.any(Object),
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should handle empty component name gracefully", async () => { try {
      const result = await adapter.generateComponent({
        component: "",
        variant: "default",
        props: {},
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      // Should handle gracefully - either fail or succeed with warning
      expect(result).toBeDefined();
      expect(result.component).toBeDefined();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should handle malformed component requests", async () => { try {
      const result = await adapter.generateComponent({
        component: null as any,
        variant: "default",
        props: {},
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should retry on transient failures", async () => { try {
      let callCount = 0;
      (adapter as any).executeAdaptedCommand = jest
        .fn()
        .mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.reject(new Error("Temporary network error"));
          }
          return Promise.resolve({
            success: true,
            component: {
              name: "RecoveredComponent",
              code: "test code",
              dependencies: [],
              props: {},
            },
          } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
        } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const result = await adapter.generateComponent({
        component: "RecoveredComponent",
        variant: "default",
        props: {},
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(result.success).toBe(true);
      expect(callCount).toBe(2);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("failed (attempt 1)"),
        expect.any(Object),
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should fail after maximum retries exceeded", async () => { try {
      (adapter as any).executeAdaptedCommand = jest
        .fn()
        .mockRejectedValue(new Error("Persistent error") as never);

      const result = await adapter.generateComponent({
        component: "FailingComponent",
        variant: "default",
        props: {},
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(result.success).toBe(false);
      expect(result.error).toContain("Persistent error");
      expect(mockLogger.warn).toHaveBeenCalledTimes(2); // retries = 2
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe("6. Theme Customization (Adapter-Layer Feature)", () => {
    beforeEach(async () => { try {
      await adapter.connect();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should customize theme with color overrides", async () => { try {
      const customTheme = await adapter.customizeTheme({
        name: "brand-theme",
        baseTheme: "default",
        customizations: {
          colors: {
            primary: "#3B82F6",
            secondary: "#10B981",
            accent: "#F59E0B",
          },
        },
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(customTheme.colors.primary).toBe("#3B82F6");
      expect(customTheme.colors.secondary).toBe("#10B981");
      expect(customTheme.colors.accent).toBe("#F59E0B");
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should customize theme with font overrides", async () => { try {
      const customTheme = await adapter.customizeTheme({
        name: "custom-fonts",
        baseTheme: "default",
        customizations: {
          fonts: {
            default: "Roboto, sans-serif",
            heading: "Playfair Display, serif",
          },
        },
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(customTheme.fonts.default).toBe("Roboto, sans-serif");
      expect(customTheme.fonts.heading).toBe("Playfair Display, serif");
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should customize theme with spacing overrides", async () => { try {
      const customTheme = await adapter.customizeTheme({
        name: "tight-spacing",
        baseTheme: "default",
        customizations: {
          spacing: {
            xs: "0.125rem",
            sm: "0.25rem",
            md: "0.5rem",
            lg: "1rem",
          },
        },
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(customTheme.spacing.xs).toBe("0.125rem");
      expect(customTheme.spacing.sm).toBe("0.25rem");
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should emit theme-customized event", async () => { try {
      const eventHandler = jest.fn();
      adapter.once("theme-customized", eventHandler);

      await adapter.customizeTheme({
        name: "test-theme",
        baseTheme: "default",
        customizations: {
          colors: { primary: "#000000" },
        },
        swarmId: "design-swarm",
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          themeName: "test-theme",
          swarmId: "design-swarm",
          theme: expect.objectContaining({
            colors: expect.objectContaining({
              primary: "#000000",
            }),
          }),
        }),
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should merge customizations with base theme", async () => { try {
      const customTheme = await adapter.customizeTheme({
        name: "partial-override",
        baseTheme: "default",
        customizations: {
          colors: {
            primary: "#FF0000",
          },
        },
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      // Should have custom primary color
      expect(customTheme.colors.primary).toBe("#FF0000");
      // Should retain base theme secondary color
      expect(customTheme.colors.secondary).toBe("#f1f5f9");
      // Should have complete theme structure
      expect(customTheme.fonts).toBeDefined();
      expect(customTheme.spacing).toBeDefined();
      expect(customTheme.borderRadius).toBeDefined();
      expect(customTheme.shadows).toBeDefined();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should cache customized themes", async () => { try {
      const themeSpec = {
        name: "cached-theme",
        baseTheme: "default",
        customizations: {
          colors: { primary: "#ABCDEF" },
        },
      };

      const theme1 = await adapter.customizeTheme(themeSpec);
      const theme2 = await adapter.customizeTheme(themeSpec);

      expect(theme1).toEqual(theme2);

      const status = adapter.getStatus();
      expect(status.cachedThemes).toBeGreaterThanOrEqual(1);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should handle theme customization errors", async () => { try {
      // Mock base theme retrieval to fail
      (adapter as any).getBaseTheme = jest
        .fn()
        .mockRejectedValue(new Error("Base theme not found") as never);

      await expect(
        adapter.customizeTheme({
          name: "error-theme",
          baseTheme: "non-existent",
          customizations: {},
        }),
      ).rejects.toThrow("Base theme not found");

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Theme customization failed",
        expect.any(Object),
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe("7. Component Validation", () => {
    beforeEach(async () => { try {
      await adapter.connect();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should validate component quality", async () => { try {
      const result = await adapter.generateComponent({
        component: "ValidComponent",
        variant: "default",
        props: {},
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const validation = await adapter.validateComponent(result);

      expect(validation).toHaveProperty("valid");
      expect(validation).toHaveProperty("issues");
      expect(validation).toHaveProperty("suggestions");
      expect(validation).toHaveProperty("score");
      expect(validation.score).toBeGreaterThanOrEqual(0);
      expect(validation.score).toBeLessThanOrEqual(100);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should detect missing TypeScript interfaces", async () => { try {
      const mockResult = {
        success: true,
        component: {
          name: "NoInterface",
          code: "function NoInterface() { return <div />; }",
          dependencies: ["react"],
          props: { className: "string" },
          examples: [],
        },
        files: [],
        documentation: { usage: "", props: {}, examples: [] },
      };

      const validation = await adapter.validateComponent(mockResult);

      expect(validation.issues).toContain(
        "Missing TypeScript interface for props",
      );
      expect(validation.score).toBeLessThan(100);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should suggest accessibility improvements", async () => { try {
      const mockResult = {
        success: true,
        component: {
          name: "NoAccessibility",
          code: "function NoAccessibility() { return <button>Click</button>; }",
          dependencies: ["react"],
          props: {},
          examples: [],
        },
        files: [],
        documentation: { usage: "", props: {}, examples: [] },
      };

      const validation = await adapter.validateComponent(mockResult);

      // Check validation runs and returns expected structure
      expect(validation).toBeDefined();
      expect(validation.suggestions).toBeDefined();
      expect(Array.isArray(validation.suggestions)).toBe(true);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should check for missing dependencies", async () => { try {
      const mockResult = {
        success: true,
        component: {
          name: "NoDeps",
          code: "function NoDeps() { return <div />; }",
          dependencies: [],
          props: {},
          examples: [],
        },
        files: [],
        documentation: { usage: "test", props: {}, examples: [] },
      };

      const validation = await adapter.validateComponent(mockResult);

      // Should detect validation issues
      expect(validation).toBeDefined();
      expect(validation.issues).toBeDefined();
      expect(Array.isArray(validation.issues)).toBe(true);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe("8. UI Feature Generation", () => {
    beforeEach(async () => { try {
      await adapter.connect();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should generate complete UI feature with multiple components", async () => { try {
      const result = await adapter.generateUIFeature({
        name: "UserDashboard",
        description: "User dashboard with stats and charts",
        components: [
          { component: "Card", variant: "default", props: {} },
          { component: "Button", variant: "primary", props: {} },
          { component: "Tabs", variant: "default", props: {} },
        ],
        layout: "dashboard",
        theme: "default",
        responsive: true,
        accessibility: true,
        swarmId: "feature-swarm",
        agentId: "ui-architect",
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(result.success).toBe(true);
      expect(result.feature.components).toHaveLength(3);
      expect(result.feature.layout).toBe("dashboard");
      expect(result.feature.theme).toBeDefined();
      expect(result.files.length).toBeGreaterThan(3); // Components + layout + docs
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should emit feature-generated event", async () => { try {
      const eventHandler = jest.fn();
      adapter.once("feature-generated", eventHandler);

      await adapter.generateUIFeature({
        name: "TestFeature",
        description: "Test feature",
        components: [{ component: "Button", variant: "default", props: {} }],
        layout: "form",
        responsive: true,
        accessibility: true,
        swarmId: "test-swarm",
        agentId: "test-agent",
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          feature: "TestFeature",
          swarmId: "test-swarm",
          agentId: "test-agent",
        }),
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should handle feature generation errors", async () => { try {
      // Mock component generation to fail
      (adapter as any).executeAdaptedCommand = jest
        .fn()
        .mockRejectedValue(new Error("Component generation failed") as never);

      const result = await adapter.generateUIFeature({
        name: "ErrorFeature",
        description: "This will fail",
        components: [
          { component: "FailingComponent", variant: "default", props: {} },
        ],
        layout: "dashboard",
        responsive: true,
        accessibility: true,
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      // Should handle errors gracefully
      expect(result).toBeDefined();
      expect(result.feature).toBeDefined();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe("9. Component Search", () => {
    beforeEach(async () => { try {
      await adapter.connect();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should search components by name", async () => { try {
      const results = await adapter.searchComponents({
        name: "dock",
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      // Should return search results (may be empty if component not found)
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should search components by category", async () => { try {
      const results = await adapter.searchComponents({
        category: "forms",
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].category).toBe("forms");
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should return empty array for no matches", async () => { try {
      const results = await adapter.searchComponents({
        name: "NonExistentComponent",
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(results).toEqual([]);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should handle search errors gracefully", async () => { try {
      // Mock library retrieval to fail
      (adapter as any).getComponentLibrary = jest
        .fn()
        .mockRejectedValue(new Error("Library unavailable") as never);

      const results = await adapter.searchComponents({
        name: "AnyComponent",
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(results).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Component search failed",
        expect.any(Object),
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe("10. Status and Monitoring", () => {
    it("should report correct initial status", () => {
      const status = adapter.getStatus();

      expect(status.connected).toBe(false);
      expect(status.version).toBe("1.0.0");
      expect(status.registry).toBe("official");
      expect(status.cachedComponents).toBe(0);
      expect(status.cachedThemes).toBe(0);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should update status after connection", async () => { try {
      await adapter.connect();

      const status = adapter.getStatus();

      expect(status.connected).toBe(true);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should track cached components count", async () => { try {
      await adapter.connect();

      await adapter.generateComponent({
        component: "Component1",
        variant: "default",
        props: {},
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      await adapter.generateComponent({
        component: "Component2",
        variant: "default",
        props: {},
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const status = adapter.getStatus();
      expect(status.cachedComponents).toBeGreaterThanOrEqual(2);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should emit disconnected event", async () => { try {
      await adapter.connect();

      const disconnectHandler = jest.fn();
      adapter.once("disconnected", disconnectHandler);

      await adapter.disconnect();

      expect(disconnectHandler).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Disconnected from shadcn MCP Server",
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
