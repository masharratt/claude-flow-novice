#!/usr/bin/env node

const { chromium } = require('playwright');
const readline = require('readline');

// MCP Server for Playwright Browser Automation
class PlaywrightMCPServer {
    constructor() {
        this.browser = null;
        this.page = null;
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false
        });

        this.tools = {
            take_screenshot: {
                name: 'take_screenshot',
                description: 'Take a screenshot of a webpage',
                inputSchema: {
                    type: 'object',
                    properties: {
                        url: { type: 'string', description: 'URL to capture' },
                        filename: { type: 'string', description: 'Screenshot filename (optional)' },
                        fullPage: { type: 'boolean', default: false, description: 'Capture full page' },
                        waitTime: { type: 'number', default: 3000, description: 'Wait time before screenshot (ms)' }
                    },
                    required: ['url']
                }
            },
            search_google: {
                name: 'search_google',
                description: 'Search Google and return results',
                inputSchema: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'Search query' },
                        screenshot: { type: 'boolean', default: true, description: 'Take screenshot of results' },
                        resultCount: { type: 'number', default: 5, description: 'Number of results to return' }
                    },
                    required: ['query']
                }
            },
            navigate_and_interact: {
                name: 'navigate_and_interact',
                description: 'Navigate to a webpage and interact with elements',
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
                }
            }
        };
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
            console.error('Playwright browser initialized');
        }
    }

    async takeScreenshot(args) {
        await this.initBrowser();

        await this.page.goto(args.url, {
            waitUntil: 'networkidle',
            timeout: 15000
        });

        if (args.waitTime > 0) {
            await this.page.waitForTimeout(args.waitTime);
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = args.filename || `screenshot-${timestamp}.png`;
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
            size: `${this.page.viewportSize()?.width || 1280}x${this.page.viewportSize()?.height || 720}`
        };
    }

    async searchGoogle(args) {
        await this.initBrowser();

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
            title: await this.page.title()
        };
    }

    async navigateAndInteract(args) {
        await this.initBrowser();

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
            const filename = `interaction-${timestamp}.png`;
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
            title: await this.page.title()
        };
    }

    async handleMessage(message) {
        try {
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
                            name: 'playwright-mcp-server',
                            version: '1.0.0'
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

                let result;
                if (toolName === 'take_screenshot') {
                    result = await this.takeScreenshot(args);
                } else if (toolName === 'search_google') {
                    result = await this.searchGoogle(args);
                } else if (toolName === 'navigate_and_interact') {
                    result = await this.navigateAndInteract(args);
                } else {
                    throw new Error(`Unknown tool: ${toolName}`);
                }

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
        console.error('Playwright MCP Server starting...');

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
            console.error('Shutting down Playwright MCP Server...');
            if (this.browser) await this.browser.close();
            process.exit(0);
        });

        console.error('Playwright MCP Server ready');
    }
}

// Start the server
const server = new PlaywrightMCPServer();
server.start().catch(error => {
    console.error('Failed to start Playwright MCP Server:', error);
    process.exit(1);
});