const { chromium } = require('playwright');

(async () => {
    console.log('🚀 Starting Final Playwright Test');

    try {
        // Test 1: Launch browser
        console.log('🌐 Launching browser...');
        const browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        console.log('✅ Browser launched successfully');

        // Test 2: Create page
        const page = await browser.newPage();
        console.log('✅ Page created');

        // Test 3: Set viewport
        await page.setViewportSize({ width: 1280, height: 720 });
        console.log('✅ Viewport set to 1280x720');

        // Test 4: Navigate to Google
        console.log('🔍 Navigating to Google.com...');
        await page.goto('https://www.google.com', {
            waitUntil: 'networkidle',
            timeout: 20000
        });
        console.log('✅ Google.com loaded');

        const title = await page.title();
        console.log('📄 Page title:', title);

        // Test 5: Take screenshot of Google homepage
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const homepageFile = `/app/screenshots/google-homepage-${timestamp}.png`;
        await page.screenshot({
            path: homepageFile,
            fullPage: false
        });
        console.log('✅ Homepage screenshot saved');

        // Test 6: Search for "wrexham"
        console.log('🔎 Searching for "wrexham"...');

        // Accept cookies if popup appears
        try {
            await page.waitForSelector('button[aria-label*="Accept"], button[aria-label*="agree"]', { timeout: 3000 });
            await page.click('button[aria-label*="Accept"], button[aria-label*="agree"]');
            console.log('✅ Accepted cookies');
            await page.waitForTimeout(1000);
        } catch (e) {
            // No cookie popup, continue
        }

        // Find and use search box
        const searchSelector = 'textarea[name="q"], input[name="q"]';
        await page.waitForSelector(searchSelector, { timeout: 10000 });
        await page.fill(searchSelector, 'wrexham');
        await page.press(searchSelector, 'Enter');
        console.log('✅ Search submitted');

        // Test 7: Wait for search results
        await page.waitForSelector('[role="main"], #search', { timeout: 20000 });
        console.log('✅ Search results loaded');

        // Test 8: Take screenshot of search results
        const searchFile = `/app/screenshots/wrexham-search-${timestamp}.png`;
        await page.screenshot({
            path: searchFile,
            fullPage: false
        });
        console.log('✅ Search screenshot saved');

        // Test 9: Extract search results
        try {
            const results = await page.$$eval('div[data-hveid] h3', elements => {
                return elements.slice(0, 5).map(el => el.textContent.trim());
            });

            console.log('📊 Top 5 Search Results:');
            results.forEach((result, index) => {
                console.log(`  ${index + 1}. ${result}`);
            });
            console.log(`✅ Extracted ${results.length} search results`);
        } catch (e) {
            console.log('ℹ️ Could not extract results, but search completed');
        }

        // Test 10: Browser information
        const browserInfo = await page.evaluate(() => {
            return {
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                language: navigator.language,
                url: window.location.href
            };
        });
        console.log('🌍 Browser Info:');
        console.log(`   URL: ${browserInfo.url}`);
        console.log(`   User Agent: ${browserInfo.userAgent}`);

        // Test 11: Performance metrics
        const metrics = await page.metrics();
        console.log('⚡ Performance Metrics:');
        console.log(`   Timestamp: ${metrics.Timestamp}`);
        console.log(`   Documents: ${metrics.Documents}`);
        console.log(`   Frames: ${metrics.Frames}`);

        // Cleanup
        await browser.close();
        console.log('✅ Browser closed');

        console.log('🎉 All Playwright tests completed successfully!');
        console.log('📸 Screenshots saved:');
        console.log(`   - ${homepageFile}`);
        console.log(`   - ${searchFile}`);

        process.exit(0);

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
})();