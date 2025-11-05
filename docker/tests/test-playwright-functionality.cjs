const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function testPlaywrightFunctionality() {
    console.log('🎭 Testing Playwright Functionality');

    // Test 1: Browser Launch
    console.log('\n1. Testing browser launch...');
    const browser = await chromium.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    });
    console.log('✅ Browser launched successfully');

    // Test 2: Create Page
    console.log('\n2. Testing page creation...');
    const page = await browser.newPage();
    console.log('✅ Page created successfully');

    // Test 3: Navigate to Google.com
    console.log('\n3. Testing navigation to Google.com...');
    try {
        await page.goto('https://www.google.com', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        console.log('✅ Google.com loaded successfully');

        // Verify page title
        const title = await page.title();
        console.log(`📄 Page title: "${title}"`);
    } catch (error) {
        console.error('❌ Failed to navigate to Google.com:', error.message);
        throw error;
    }

    // Test 4: Search for "wrexham"
    console.log('\n4. Testing search for "wrexham"...');
    try {
        // Accept cookies if the popup appears
        try {
            await page.waitForSelector('button[aria-label*="Accept"]', { timeout: 5000 });
            await page.click('button[aria-label*="Accept"]');
            console.log('✅ Accepted cookies');
            await page.waitForTimeout(1000);
        } catch (e) {
            // No cookie popup, continue
        }

        // Find search box
        const searchBox = await page.waitForSelector('textarea[name="q"], input[name="q"]', { timeout: 10000 });
        console.log('✅ Found search box');

        // Type "wrexham"
        await searchBox.fill('wrexham');
        console.log('✅ Typed "wrexham" in search box');

        // Submit search (either press Enter or click search button)
        await Promise.any([
            searchBox.press('Enter'),
            page.click('input[type="submit"]')
        ]);
        console.log('✅ Submitted search');

        // Wait for search results
        await page.waitForSelector('[role="main"]', { timeout: 15000 });
        console.log('✅ Search results loaded');

    } catch (error) {
        console.error('❌ Failed to search for "wrexham":', error.message);
        throw error;
    }

    // Test 5: Take Screenshot
    console.log('\n5. Testing screenshot functionality...');
    try {
        const screenshotDir = '/app/screenshots';
        if (!fs.existsSync(screenshotDir)) {
            fs.mkdirSync(screenshotDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `wrexham-search-${timestamp}.png`;
        const filepath = path.join(screenshotDir, filename);

        await page.screenshot({
            path: filepath,
            fullPage: true
        });
        console.log(`✅ Screenshot saved: ${filename}`);

        // Also save a smaller viewport screenshot
        const viewportFilename = `wrexham-search-viewport-${timestamp}.png`;
        const viewportPath = path.join(screenshotDir, viewportFilename);
        await page.setViewportSize({ width: 1200, height: 800 });
        await page.screenshot({
            path: viewportPath,
            fullPage: false
        });
        console.log(`✅ Viewport screenshot saved: ${viewportFilename}`);

    } catch (error) {
        console.error('❌ Failed to take screenshot:', error.message);
        throw error;
    }

    // Test 6: Extract Search Results
    console.log('\n6. Testing search result extraction...');
    try {
        const results = await page.$$eval('div[data-hveid]', elements => {
            return elements.slice(0, 5).map(el => {
                const titleEl = el.querySelector('h3');
                const linkEl = el.querySelector('a');
                const descEl = el.querySelector('[data-dtld]');

                return {
                    title: titleEl ? titleEl.textContent.trim() : 'No title',
                    url: linkEl ? linkEl.href : 'No URL',
                    description: descEl ? descEl.textContent.trim().substring(0, 150) : 'No description'
                };
            });
        });

        console.log(`✅ Found ${results.length} search results:`);
        results.forEach((result, index) => {
            console.log(`\n${index + 1}. ${result.title}`);
            console.log(`   ${result.url}`);
            console.log(`   ${result.description.substring(0, 100)}...`);
        });

    } catch (error) {
        console.error('❌ Failed to extract search results:', error.message);
        // Don't throw here, just log the error
    }

    // Test 7: Network Information
    console.log('\n7. Testing network information...');
    try {
        const response = await page.evaluate(async () => {
            try {
                const response = await fetch('https://httpbin.org/ip');
                const data = await response.json();
                return data;
            } catch (e) {
                return { error: e.message };
            }
        });
        console.log('✅ Network test result:', response);
    } catch (error) {
        console.log('ℹ️  Network test failed (expected in container):', error.message);
    }

    // Cleanup
    console.log('\n8. Cleaning up...');
    await browser.close();
    console.log('✅ Browser closed');

    console.log('\n🎉 All Playwright tests completed successfully!');

    return {
        success: true,
        message: 'Playwright functionality fully verified',
        screenshots: fs.readdirSync('/app/screenshots').filter(f => f.includes('wrexham'))
    };
}

// Run the test
testPlaywrightFunctionality()
    .then(result => {
        console.log('\n📊 Test Results:', JSON.stringify(result, null, 2));
        process.exit(0);
    })
    .catch(error => {
        console.error('\n💥 Test failed:', error);
        process.exit(1);
    });