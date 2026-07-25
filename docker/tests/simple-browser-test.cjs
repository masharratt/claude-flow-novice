const { chromium } = require('playwright');

async function simpleBrowserTest() {
    console.log('🚀 Starting Simple Browser Test');

    try {
        // Test 1: Check if Playwright is available
        console.log('✅ Playwright version:', require('playwright/package.json').version);

        // Test 2: Launch browser
        console.log('🌐 Launching browser...');
        const browser = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--remote-debugging-port=9222'
            ]
        });
        console.log('✅ Browser launched successfully');

        // Test 3: Create page
        const page = await browser.newPage();
        console.log('✅ Page created');

        // Test 4: Set viewport
        await page.setViewportSize({ width: 1280, height: 720 });
        console.log('✅ Viewport set to 1280x720');

        // Test 5: Navigate to Google
        console.log('🔍 Navigating to Google.com...');
        await page.goto('https://www.google.com', {
            waitUntil: 'networkidle',
            timeout: 15000
        });
        console.log('✅ Google.com loaded');
        console.log('📄 Page title:', await page.title());

        // Test 6: Take screenshot of homepage
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const homepageFile = `/app/screenshots/google-homepage-${timestamp}.png`;
        await page.screenshot({ path: homepageFile, fullPage: false });
        console.log('✅ Homepage screenshot saved');

        // Test 7: Search for "wrexham"
        console.log('🔎 Searching for "wrexham"...');

        // Find and use search box
        const searchSelector = 'textarea[name="q"], input[name="q"]';
        await page.waitForSelector(searchSelector, { timeout: 10000 });
        await page.fill(searchSelector, 'wrexham');
        await page.press(searchSelector, 'Enter');

        // Wait for results
        await page.waitForSelector('[role="main"]', { timeout: 15000 });
        console.log('✅ Search results loaded');

        // Test 8: Take screenshot of search results
        const searchFile = `/app/screenshots/wrexham-search-${timestamp}.png`;
        await page.screenshot({ path: searchFile, fullPage: false });
        console.log('✅ Search screenshot saved');

        // Test 9: Extract search results
        const results = await page.$$eval('div[data-hveid]', elements => {
            return elements.slice(0, 3).map((el, index) => {
                const titleEl = el.querySelector('h3');
                const linkEl = el.querySelector('a');
                return {
                    index: index + 1,
                    title: titleEl ? titleEl.textContent.trim() : 'No title',
                    url: linkEl ? linkEl.href : 'No URL'
                };
            });
        });

        console.log('📊 Search Results:');
        results.forEach(result => {
            console.log(`  ${result.index}. ${result.title}`);
            console.log(`     ${result.url}`);
        });

        // Test 10: Test browser info
        const browserInfo = await page.evaluate(() => {
            return {
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                language: navigator.language
            };
        });
        console.log('🌍 Browser Info:', browserInfo);

        // Cleanup
        await browser.close();
        console.log('✅ Browser closed');

        console.log('🎉 All tests completed successfully!');

        return {
            success: true,
            screenshots: [homepageFile, searchFile],
            searchResults: results.length,
            pageTitle: await page.title()
        };

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Stack:', error.stack);
        throw error;
    }
}

// Run the test
simpleBrowserTest()
    .then(result => {
        console.log('\n📈 Final Result:', JSON.stringify(result, null, 2));
        process.exit(0);
    })
    .catch(error => {
        console.error('\n💥 Fatal Error:', error.message);
        process.exit(1);
    });