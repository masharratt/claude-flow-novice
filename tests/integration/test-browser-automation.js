import { chromium } from 'playwright';

async function testBrowserAutomation() {
    console.log('🎭 Testing Playwright Browser Automation...');

    let browser;
    let context;
    let page;

    try {
        // 1. Launch browser
        console.log('📱 Launching Chromium browser...');
        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        // 2. Create context and page
        console.log('📄 Creating browser context and page...');
        context = await browser.newContext();
        page = await context.newPage();

        // 3. Test 1: Navigate to Google.com
        console.log('🌐 Navigating to Google.com...');
        await page.goto('https://www.google.com');
        await page.waitForLoadState('networkidle');

        // 4. Take screenshot of Google homepage
        console.log('📸 Taking screenshot of Google homepage...');
        await page.screenshot({
            path: '/mnt/c/Users/masha/Documents/claude-flow-novice/screenshots/google-homepage-test.png',
            fullPage: true
        });
        console.log('✅ Google homepage screenshot saved');

        // 5. Test 2: Search for "wrexham"
        console.log('🔍 Searching for "wrexham"...');
        const searchBox = await page.locator('textarea[name="q"]');
        await searchBox.fill('wrexham');
        await searchBox.press('Enter');

        // Wait for search results to load
        await page.waitForSelector('#search', { timeout: 10000 });
        await page.waitForLoadState('networkidle');

        // 6. Take screenshot of search results
        console.log('📸 Taking screenshot of search results...');
        await page.screenshot({
            path: '/mnt/c/Users/masha/Documents/claude-flow-novice/screenshots/wrexham-search-results.png',
            fullPage: true
        });
        console.log('✅ Search results screenshot saved');

        // 7. Extract search results information
        console.log('📊 Extracting search results data...');
        const searchResults = await page.locator('#search .g').count();
        const pageTitle = await page.title();
        const currentUrl = page.url();

        console.log(`📈 Found ${searchResults} search results`);
        console.log(`📝 Page title: ${pageTitle}`);
        console.log(`🔗 Current URL: ${currentUrl}`);

        // 8. Test some basic automation capabilities
        console.log('🧪 Testing additional automation capabilities...');

        // Test page interaction - click first result
        if (searchResults > 0) {
            const firstResult = await page.locator('#search .g').first();
            const resultText = await firstResult.locator('h3').textContent();
            console.log(`🎯 First result: ${resultText}`);
        }

        // Test viewport manipulation
        await page.setViewportSize({ width: 1200, height: 800 });
        console.log('📐 Viewport size set to 1200x800');

        // Test JavaScript execution
        const jsResult = await page.evaluate(() => {
            return {
                userAgent: navigator.userAgent,
                language: navigator.language,
                platform: navigator.platform,
                screenResolution: `${window.screen.width}x${window.screen.height}`
            };
        });

        console.log('💻 Browser info:', jsResult);

        console.log('🎉 All browser automation tests completed successfully!');

        return {
            success: true,
            results: {
                searchResults,
                pageTitle,
                currentUrl,
                browserInfo: jsResult
            }
        };

    } catch (error) {
        console.error('❌ Browser automation test failed:', error.message);
        return {
            success: false,
            error: error.message
        };
    } finally {
        // Clean up
        if (page) await page.close();
        if (context) await context.close();
        if (browser) await browser.close();
        console.log('🧹 Browser resources cleaned up');
    }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
    testBrowserAutomation()
        .then(result => {
            console.log('\n📋 TEST SUMMARY:');
            console.log('================');
            if (result.success) {
                console.log('✅ Status: PASSED');
                console.log('📊 Results:', JSON.stringify(result.results, null, 2));
                process.exit(0);
            } else {
                console.log('❌ Status: FAILED');
                console.log('🚨 Error:', result.error);
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('💥 Unexpected error:', error);
            process.exit(1);
        });
}

export { testBrowserAutomation };