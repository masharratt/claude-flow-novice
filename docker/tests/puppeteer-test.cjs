// Puppeteer Test - Alternative to Playwright
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function puppeteerTest() {
    console.log('🤖 Puppeteer Test - Starting');

    try {
        // Test 1: Launch browser
        console.log('1. Launching Chromium via Puppeteer...');
        const browser = await puppeteer.launch({
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

        // Test 3: Navigate to Google
        console.log('3. Navigating to Google.com...');
        await page.goto('https://www.google.com', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });
        console.log('✅ Google.com loaded successfully');

        // Test 4: Get page info
        const title = await page.title();
        const url = page.url();
        console.log(`📄 Title: "${title}"`);
        console.log(`🌐 URL: ${url}`);

        // Test 5: Search for "wrexham"
        console.log('4. Searching for "wrexham"...');

        // Accept cookies if popup appears
        try {
            await page.waitForSelector('button[aria-label*="Accept"]', { timeout: 5000 });
            await page.click('button[aria-label*="Accept"]');
            console.log('✅ Accepted cookies');
            await page.waitForTimeout(1000);
        } catch (e) {
            // No cookie popup
        }

        // Find and fill search box
        const searchBox = await page.waitForSelector('textarea[name="q"], input[name="q"]', { timeout: 10000 });
        await searchBox.fill('wrexham');
        console.log('✅ Filled search box');

        // Submit search
        await searchBox.press('Enter');
        console.log('✅ Submitted search');

        // Wait for results
        await page.waitForSelector('[role="main"]', { timeout: 15000 });
        console.log('✅ Search results loaded');

        // Test 6: Take screenshots
        console.log('5. Taking screenshots...');
        const screenshotDir = '/app/screenshots';
        if (!fs.existsSync(screenshotDir)) {
            fs.mkdirSync(screenshotDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        // Full page screenshot
        const fullPageFilename = `wrexham-search-full-${timestamp}.png`;
        await page.screenshot({
            path: path.join(screenshotDir, fullPageFilename),
            fullPage: true
        });
        console.log(`✅ Full page screenshot: ${fullPageFilename}`);

        // Viewport screenshot
        await page.setViewport({ width: 1200, height: 800 });
        const viewportFilename = `wrexham-search-viewport-${timestamp}.png`;
        await page.screenshot({
            path: path.join(screenshotDir, viewportFilename),
            fullPage: false
        });
        console.log(`✅ Viewport screenshot: ${viewportFilename}`);

        // Test 7: Extract search results
        console.log('6. Extracting search results...');
        const results = await page.evaluate(() => {
            const resultElements = document.querySelectorAll('[data-hveid]');
            return Array.from(resultElements).slice(0, 5).map(el => {
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

        // Cleanup
        console.log('7. Cleaning up...');
        await browser.close();
        console.log('✅ Browser closed');

        console.log('\n🎉 Puppeteer Test - COMPLETE SUCCESS');

        return {
            success: true,
            title: title,
            url: url,
            screenshots: [fullPageFilename, viewportFilename],
            resultsCount: results.length,
            performance: {
                loadTime: Date.now() - Date.now(), // Placeholder
                screenshotCount: 2
            }
        };

    } catch (error) {
        console.error('\n💥 Puppeteer Test - FAILED');
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);

        return {
            success: false,
            error: error.message,
            stack: error.stack
        };
    }
}

// Run the test
puppeteerTest()
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