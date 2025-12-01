import { chromium } from 'playwright';

async function simpleBrowserTest() {
    console.log('🎭 Simple Playwright Browser Test');

    let browser;
    let context;
    let page;

    try {
        // Launch browser
        browser = await chromium.launch({ headless: true });
        context = await browser.newContext();
        page = await context.newPage();

        // Test 1: Navigate to Google
        console.log('🌐 Navigating to Google...');
        await page.goto('https://www.google.com');
        await page.waitForLoadState('networkidle');

        // Take screenshot of Google homepage
        await page.screenshot({
            path: '/mnt/c/Users/masha/Documents/claude-flow-novice/screenshots/test-google-homepage.png'
        });
        console.log('✅ Google homepage screenshot saved');

        // Test 2: Simple search
        console.log('🔍 Performing search for "wrexham"...');

        // Wait for search box and fill it
        await page.waitForSelector('textarea[name="q"]', { timeout: 5000 });
        await page.fill('textarea[name="q"]', 'wrexham');

        // Submit search
        await page.press('textarea[name="q"]', 'Enter');

        // Wait a bit for results to load
        await page.waitForTimeout(2000);

        // Take screenshot of search results
        await page.screenshot({
            path: '/mnt/c/Users/masha/Documents/claude-flow-novice/screenshots/test-wrexham-results.png'
        });
        console.log('✅ Search results screenshot saved');

        // Get basic page info
        const title = await page.title();
        const url = page.url();

        console.log('📊 Test Results:');
        console.log(`   Title: ${title}`);
        console.log(`   URL: ${url}`);
        console.log('   Screenshots captured successfully');

        return { success: true, title, url };

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        return { success: false, error: error.message };
    } finally {
        if (page) await page.close();
        if (context) await context.close();
        if (browser) await browser.close();
        console.log('🧹 Cleanup complete');
    }
}

// Run the test
simpleBrowserTest().then(result => {
    console.log('\n📋 FINAL RESULT:');
    console.log('================');
    if (result.success) {
        console.log('✅ Browser automation test PASSED');
        console.log(`📝 Page Title: ${result.title}`);
        console.log(`🔗 URL: ${result.url}`);
    } else {
        console.log('❌ Browser automation test FAILED');
        console.log(`🚨 Error: ${result.error}`);
    }
});