// Quick Playwright Test for Verification
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function quickTest() {
    console.log('🎭 Quick Playwright Test - Starting');

    try {
        // Test 1: Launch browser
        console.log('1. Launching Chromium browser...');
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

        // Test 2: Create page
        console.log('2. Creating page...');
        const page = await browser.newPage();
        console.log('✅ Page created successfully');

        // Test 3: Navigate to simple site
        console.log('3. Navigating to example.com...');
        await page.goto('https://example.com', {
            waitUntil: 'networkidle',
            timeout: 15000
        });
        console.log('✅ Navigation successful');

        // Test 4: Get page info
        const title = await page.title();
        const url = page.url();
        console.log(`📄 Title: "${title}"`);
        console.log(`🌐 URL: ${url}`);

        // Test 5: Take screenshot
        console.log('5. Taking screenshot...');
        const screenshotDir = '/app/screenshots';
        if (!fs.existsSync(screenshotDir)) {
            fs.mkdirSync(screenshotDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `quick-test-${timestamp}.png`;
        const filepath = path.join(screenshotDir, filename);

        await page.screenshot({
            path: filepath,
            fullPage: true
        });
        console.log(`✅ Screenshot saved: ${filename}`);

        // Test 6: Extract some content
        const heading = await page.textContent('h1');
        console.log(`📝 Heading: "${heading}"`);

        // Cleanup
        console.log('6. Cleaning up...');
        await browser.close();
        console.log('✅ Browser closed');

        console.log('\n🎉 Quick Playwright Test - PASSED');

        return {
            success: true,
            title: title,
            url: url,
            heading: heading,
            screenshot: filename
        };

    } catch (error) {
        console.error('\n💥 Quick Playwright Test - FAILED');
        console.error('Error:', error.message);

        return {
            success: false,
            error: error.message
        };
    }
}

// Run the test
quickTest()
    .then(result => {
        console.log('\n📊 Test Results:', JSON.stringify(result, null, 2));
        if (result.success) {
            process.exit(0);
        } else {
            process.exit(1);
        }
    })
    .catch(error => {
        console.error('\n💥 Unexpected error:', error);
        process.exit(1);
    });