#!/usr/bin/env node

/**
 * Enhanced Playwright MCP Server with Authentication
 * Includes token-based authentication and authorization
 */

const { chromium } = require('playwright');
const readline = require('readline');
const MCPAuthMiddleware = require('./auth-middleware.js');

class AuthenticatedPlaywrightMCPServer {
    constructor(options = {}) {
        this.browser = null;
        this.page = null;
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false
        });

        // Initialize authentication middleware
        this.auth = new MCPAuthMiddleware({
            redisUrl: options.redisUrl || process.env.CFN_REDIS_URL || process.env.MCP_REDIS_URL || `redis://${process.env.CFN_REDIS_HOST || 'cfn-redis'}:${process.env.CFN_REDIS_PORT || 6379}`,
            authRequired: options.authRequired !== false && process.env.MCP_AUTH_REQUIRED !== 'false',
            agentConfigPath: options.agentConfigPath || process.env.MCP_AGENT_CONFIG || './config/agent-whitelist.json',
            skillConfigPath: options.skillConfigPath || process.env.MCP_SKILL_CONFIG || './config/skill-requirements.json',
            rateLimitMax: options.rateLimitMax || parseInt(process.env.MCP_RATE_LIMIT_MAX) || 60,
            rateLimitWindow: options.rateLimitWindow || parseInt(process.env.MCP_RATE_LIMIT_WINDOW) || 60
        });

        this.tools = {
            take_screenshot: {
                name: 'take_screenshot',
                description: 'Take a screenshot of a webpage (requires browser-automation, screenshot-capture skills)',
                inputSchema: {
                    type: 'object',
                    properties: {
                        url: { type: 'string', description: 'URL to capture' },
                        filename: { type: 'string', description: 'Screenshot filename (optional)' },
                        fullPage: { type: 'boolean', default: false, description: 'Capture full page' },
                        waitTime: { type: 'number', default: 3000, description: 'Wait time before screenshot (ms)' }
                    },
                    required: ['url']
                },
                skillRequirements: ['browser-automation', 'screenshot-capture']
            },
            search_google: {
                name: 'search_google',
                description: 'Search Google and return results (requires browser-automation, web-search skills)',
                inputSchema: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'Search query' },
                        screenshot: { type: 'boolean', default: true, description: 'Take screenshot of results' },
                        resultCount: { type: 'number', default: 5, description: 'Number of results to return' }
                    },
                    required: ['query']
                },
                skillRequirements: ['browser-automation', 'web-search']
            },
            navigate_and_interact: {
                name: 'navigate_and_interact',
                description: 'Navigate to a webpage and interact with elements (requires browser-automation, web-interaction skills)',
                inputSchema: {
                    type: 'object',
                    properties: {
                        url: { type: 'string', description: 'URL to navigate to' },
                        actions: {
                            type: 'array',
                            description: 'Array of actions to perform',
                            items: {
                                type: 'object',
                                properties: {
                                    type: { type: 'string', enum: ['click', 'fill', 'press', 'wait'] },
                                    selector: { type: 'string', description: 'CSS selector' },
                                    value: { type: 'string', description: 'Value for fill actions' },
                                    key: { type: 'string', description: 'Key for press actions' }
                                }
                            }
                        },
                        screenshot: { type: 'boolean', default: false }
                    },
                    required: ['url']
                },
                skillRequirements: ['browser-automation', 'web-interaction']
            }
        };

        this.stats = {
            totalRequests: 0,
            authorizedRequests: 0,
            rejectedRequests: 0,
            toolUsage: {},
            lastActivity: null
        };
    }

    async initialize() {
        try {
            // Initialize authentication
            await this.auth.initialize();
            console.error('[MCP-Server] Authentication middleware initialized');

            // Initialize Playwright browser
            await this.initBrowser();
            console.error('[MCP-Server] Playwright browser initialized');

            console.error('[MCP-Server] Authenticated Playwright MCP Server ready');
        } catch (error) {
            console.error('[MCP-Server] Failed to initialize:', error);
            process.exit(1);
        }
    }

    async initBrowser() {
        if (!this.browser) {
            this.browser = await chromium.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu'
                ]
            });
            this.page = await this.browser.newPage();
        }
    }

    async takeScreenshot(args, agentContext) {
        await this.initBrowser();

        console.error(`[MCP-Server] Taking screenshot for ${agentContext.agentType}`);

        await this.page.goto(args.url, {
            waitUntil: 'networkidle',
            timeout: 15000
        });

        if (args.waitTime > 0) {
            await this.page.waitForTimeout(args.waitTime);
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = args.filename || `screenshot-${agentContext.agentType}-${timestamp}.png`;
        const filepath = `/app/screenshots/${filename}`;

        await this.page.screenshot({
            path: filepath,
            fullPage: args.fullPage || false
        });

        return {
            success: true,
            filename: filename,
            filepath: filepath,
            url: args.url,
            title: await this.page.title(),
            size: `${this.page.viewportSize()?.width || 1280}x${this.page.viewportSize()?.height || 720}`,
            capturedBy: agentContext.agentType,
            timestamp: new Date().toISOString()
        };
    }

    async searchGoogle(args, agentContext) {
        await this.initBrowser();

        console.error(`[MCP-Server] Google search for ${agentContext.agentType}: "${args.query}"`);

        await this.page.goto('https://www.google.com', {
            waitUntil: 'networkidle',
            timeout: 15000
        });

        // Handle cookies popup if present
        try {
            await this.page.waitForSelector('button[aria-label*="Accept"], button[aria-label*="agree"]', { timeout: 3000 });
            await this.page.click('button[aria-label*="Accept"], button[aria-label*="agree"]');
            await this.page.waitForTimeout(1000);
        } catch (e) {
            // No cookie popup, continue
        }

        // Perform search
        const searchBox = await this.page.waitForSelector('textarea[name="q"], input[name="q"]', { timeout: 10000 });
        await searchBox.fill(args.query);
        await searchBox.press('Enter');

        // Wait for results
        await this.page.waitForSelector('[role="main"], #search', { timeout: 15000 });

        // Extract results
        const results = await this.page.$$eval('div[data-hveid] h3', elements =>
            elements.slice(0, args.resultCount || 5).map(el => el.textContent.trim())
        );

        let screenshotInfo = null;
        if (args.screenshot) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `google-search-${args.query.toLowerCase().replace(/\s+/g, '-')}-${timestamp}.png`;
            await this.page.screenshot({ path: `/app/screenshots/${filename}` });
            screenshotInfo = {
                filename,
                path: `/app/screenshots/${filename}`,
                url: this.page.url()
            };
        }

        return {
            success: true,
            query: args.query,
            results: results,
            resultCount: results.length,
            screenshot: screenshotInfo,
            url: this.page.url(),
            title: await this.page.title(),
            searchedBy: agentContext.agentType,
            timestamp: new Date().toISOString()
        };
    }

    async navigateAndInteract(args, agentContext) {
        await this.initBrowser();

        console.error(`[MCP-Server] Page interaction for ${agentContext.agentType}: ${args.url}`);

        await this.page.goto(args.url, {
            waitUntil: 'networkidle',
            timeout: 15000
        });

        const results = [];

        for (const action of args.actions || []) {
            try {
                switch (action.type) {
                    case 'click':
                        await this.page.waitForSelector(action.selector, { timeout: 5000 });
                        await this.page.click(action.selector);
                        results.push({ action: 'click', selector: action.selector, success: true });
                        break;

                    case 'fill':
                        await this.page.waitForSelector(action.selector, { timeout: 5000 });
                        await this.page.fill(action.selector, action.value);
                        results.push({ action: 'fill', selector: action.selector, value: action.value, success: true });
                        break;

                    case 'press':
                        await this.page.press(action.selector || 'body', action.key);
                        results.push({ action: 'press', key: action.key, success: true });
                        break;

                    case 'wait':
                        await this.page.waitForTimeout(parseInt(action.value) || 1000);
                        results.push({ action: 'wait', duration: action.value, success: true });
                        break;
                }
            } catch (error) {
                results.push({
                    action: action.type,
                    selector: action.selector,
                    success: false,
                    error: error.message
                });
            }
        }

        let screenshotInfo = null;
        if (args.screenshot) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `interaction-${agentContext.agentType}-${timestamp}.png`;
            await this.page.screenshot({ path: `/app/screenshots/${filename}` });
            screenshotInfo = {
                filename,
                path: `/app/screenshots/${filename}`
            };
        }

        return {
            success: true,
            url: args.url,
            actions: results,
            screenshot: screenshotInfo,
            title: await this.page.title(),
            interactedBy: agentContext.agentType,
            timestamp: new Date().toISOString()
        };
    }

    async handleMessage(message) {
        try {
            this.stats.totalRequests++;
            this.stats.lastActivity = Date.now();

            // Initialize request context
            const request = {
                headers: {
                    'x-agent-token': message.params?.context?.agentToken,
                    'x-agent-type': message.params?.context?.agentType
                },
                body: message
            };

            const response = {
                writeHead: () => {},
                end: (data) => {
                    // For JSON-RPC, we'll just return the data directly
                    this.responseData = JSON.parse(data);
                }
            };

            // Authenticate request
            let authenticationPassed = false;
            await this.auth.authenticateRequest(request, response, () => {
                authenticationPassed = true;
            });

            if (!authenticationPassed) {
                this.stats.rejectedRequests++;
                return this.responseData || {
                    jsonrpc: '2.0',
                    id: message.id,
                    error: {
                        code: -32001,
                        message: 'Authentication failed'
                    }
                };
            }

            this.stats.authorizedRequests++;

            // Authentication passed, process request
            if (message.method === 'initialize') {
                return {
                    jsonrpc: '2.0',
                    id: message.id,
                    result: {
                        protocolVersion: '2024-11-05',
                        capabilities: {
                            tools: {}
                        },
                        serverInfo: {
                            name: 'playwright-mcp-server-authenticated',
                            version: '1.0.0',
                            authentication: 'enabled'
                        }
                    }
                };
            } else if (message.method === 'tools/list') {
                return {
                    jsonrpc: '2.0',
                    id: message.id,
                    result: { tools: Object.values(this.tools) }
                };
            } else if (message.method === 'tools/call') {
                const toolName = message.params.name;
                const args = message.params.arguments || {};
                const agentContext = request.agentContext || {
                    agentType: 'unknown',
                    authenticated: false
                };

                // Update tool usage stats
                this.stats.toolUsage[toolName] = (this.stats.toolUsage[toolName] || 0) + 1;

                let result;
                if (toolName === 'take_screenshot') {
                    result = await this.takeScreenshot(args, agentContext);
                } else if (toolName === 'search_google') {
                    result = await this.searchGoogle(args, agentContext);
                } else if (toolName === 'navigate_and_interact') {
                    result = await this.navigateAndInteract(args, agentContext);
                } else {
                    throw new Error(`Unknown tool: ${toolName}`);
                }

                console.error(`[MCP-Server] Tool ${toolName} executed by ${agentContext.agentType}`);

                return {
                    jsonrpc: '2.0',
                    id: message.id,
                    result: {
                        content: [{
                            type: 'text',
                            text: JSON.stringify(result, null, 2)
                        }]
                    }
                };
            }
        } catch (error) {
            console.error('[MCP-Server] Error handling message:', error);
            return {
                jsonrpc: '2.0',
                id: message.id || null,
                error: {
                    code: -32000,
                    message: error.message
                }
            };
        }
    }

    async start() {
        await this.initialize();

        this.rl.on('line', async (line) => {
            try {
                const message = JSON.parse(line);
                const response = await this.handleMessage(message);
                console.log(JSON.stringify(response));
            } catch (error) {
                console.log(JSON.stringify({
                    jsonrpc: '2.0',
                    id: null,
                    error: {
                        code: -32700,
                        message: `Parse error: ${error.message}`
                    }
                }));
            }
        });

        // Cleanup on exit
        process.on('SIGINT', async () => {
            console.error('[MCP-Server] Shutting down authenticated Playwright MCP Server...');
            await this.shutdown();
            process.exit(0);
        });

        // Log statistics periodically
        setInterval(() => {
            console.error(`[MCP-Server] Stats: ${this.stats.totalRequests} total, ${this.stats.authorizedRequests} authorized, ${this.stats.rejectedRequests} rejected`);
            console.error(`[MCP-Server] Tool usage:`, JSON.stringify(this.stats.toolUsage));
        }, 60000); // Every minute
    }

    async getStats() {
        const authStats = await this.auth.getStats();
        return {
            server: {
                name: 'playwright-mcp-server-authenticated',
                uptime: process.uptime(),
                ...this.stats
            },
            authentication: authStats
        };
    }

    async shutdown() {
        try {
            if (this.browser) await this.browser.close();
            if (this.rl) this.rl.close();
            if (this.auth) await this.auth.shutdown();
            console.error('[MCP-Server] Shutdown complete');
        } catch (error) {
            console.error('[MCP-Server] Error during shutdown:', error);
        }
    }
}

// Start the server
const server = new AuthenticatedPlaywrightMCPServer({
    redisUrl: process.env.MCP_REDIS_URL,
    authRequired: process.env.MCP_AUTH_REQUIRED !== 'false',
    rateLimitMax: parseInt(process.env.MCP_RATE_LIMIT_MAX) || 60
});

server.start().catch(error => {
    console.error('[MCP-Server] Failed to start authenticated Playwright MCP Server:', error);
    process.exit(1);
});