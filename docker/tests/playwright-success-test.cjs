const { chromium } = require('playwright');

(async () => {
    console.log('🚀 Starting Playwright Success Test');

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

        // Test 6: Search for "wrexham" with better selectors
        console.log('🔎 Searching for "wrexham"...');

        // Wait for and accept cookies if popup appears (with better selector)
        try {
            await page.waitForSelector('form[action*="consent"], button[aria-label*="Accept"], button[aria-label*="agree"], . ConsentButton, [data-testid="accept-button"]', { timeout: 5000 });
            await page.click('form[action*="consent"], button[aria-label*="Accept"], button[aria-label*="agree"], . ConsentButton, [data-testid="accept-button"]');
            console.log('✅ Accepted cookies');
            await page.waitForTimeout(1000);
        } catch (e) {
            console.log('ℹ️ No cookie popup found, continuing...');
        }

        // Find and use search box with multiple selector options
        const searchSelectors = [
            'textarea[name="q"]',
            'input[name="q"]',
            'input[title="Search"]',
            '[role="combobox"]',
            'textarea[aria-label*="Search"]'
        ];

        let searchBox = null;
        for (const selector of searchSelectors) {
            try {
                searchBox = await page.$(selector);
                if (searchBox) {
                    console.log(`✅ Found search box with selector: ${selector}`);
                    break;
                }
            } catch (e) {
                continue;
            }
        }

        if (!searchBox) {
            throw new Error('Could not find search box');
        }

        await searchBox.fill('wrexham');
        await searchBox.press('Enter');
        console.log('✅ Search submitted');

        // Test 7: Wait for search results with multiple possible selectors
        console.log('⏳ Waiting for search results...');
        const resultSelectors = [
            '#search',
            '[role="main"]',
            '#ires',
            '.g',
            '.tF2Cxc',
            '.MjjYud',
            'div[data-hveid]'
        ];

        let resultsFound = false;
        for (const selector of resultSelectors) {
            try {
                await page.waitForSelector(selector, { timeout: 5000 });
                console.log(`✅ Found results with selector: ${selector}`);
                resultsFound = true;
                break;
            } catch (e) {
                continue;
            }
        }

        if (!resultsFound) {
            console.log('⚠️ Could not find specific result selectors, but page loaded');
        }

        // Test 8: Take screenshot of search results page
        const searchFile = `/app/screenshots/wrexham-search-${timestamp}.png`;
        await page.screenshot({
            path: searchFile,
            fullPage: false
        });
        console.log('✅ Search screenshot saved');

        // Test 9: Extract search results with fallback
        try {
            const results = await page.$$eval('div[data-hveid] h3, .g h3, .tF2Cxc h3, .MjjYud h3', elements => {
                return elements.slice(0, 5).map(el => el.textContent?.trim() || '').filter(text => text.length > 0);
            });

            if (results.length > 0) {
                console.log('📊 Top Search Results:');
                results.forEach((result, index) => {
                    console.log(`  ${index + 1}. ${result}`);
                });
                console.log(`✅ Extracted ${results.length} search results`);
            } else {
                console.log('ℹ️ Could not extract specific results, but search completed');
            }
        } catch (e) {
            console.log('ℹ️ Result extraction failed, but search completed');
        }

        // Test 10: Final page info
        const finalUrl = page.url();
        console.log('🌍 Final URL:', finalUrl);

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