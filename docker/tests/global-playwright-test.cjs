const { execSync } = require('child_process');
const path = require('path');

async function testWithGlobalPlaywright() {
    console.log('🌍 Testing with Global Playwright Installation');

    try {
        // Test 1: Check Playwright installation
        console.log('📦 Checking Playwright...');
        const version = execSync('npx playwright --version', { encoding: 'utf8' }).trim();
        console.log('✅ Playwright version:', version);

        // Test 2: Create a simple test using exec
        const testScript = `
const { chromium } = require('playwright');

(async () => {
    console.log('🚀 Starting browser test...');

    try {
        const browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });

        console.log('✅ Browser launched');

        const page = await browser.newPage();
        console.log('✅ Page created');

        // Test Google navigation
        await page.goto('https://www.google.com', { waitUntil: 'networkidle', timeout: 15000 });
        console.log('✅ Google.com loaded');

        const title = await page.title();
        console.log('📄 Page title:', title);

        // Take screenshot
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        await page.screenshot({
            path: '/app/screenshots/google-test-' + timestamp + '.png',
            fullPage: false
        });
        console.log('✅ Screenshot saved');

        // Test search functionality
        const searchSelector = 'textarea[name="q"], input[name="q"]';
        await page.waitForSelector(searchSelector, { timeout: 10000 });
        await page.fill(searchSelector, 'wrexham');
        await page.press(searchSelector, 'Enter');

        await page.waitForSelector('[role="main"]', { timeout: 15000 });
        console.log('✅ Search for "wrexham" completed');

        // Take search screenshot
        await page.screenshot({
            path: '/app/screenshots/wrexham-search-' + timestamp + '.png',
            fullPage: false
        });
        console.log('✅ Search screenshot saved');

        // Extract first result
        const firstResult = await page.$eval('div[data-hveid] h3', el => el.textContent.trim());
        console.log('🔍 First result:', firstResult);

        await browser.close();
        console.log('✅ Browser closed');
        console.log('🎉 All tests passed!');

        process.exit(0);

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
})();
`;

        // Test 3: Execute the test
        console.log('🧪 Running Playwright test...');
        execSync(`node -e "${testScript.replace(/"/g, '\\"')}"`, {
            stdio: 'inherit',
            cwd: '/app',
            env: {
                ...process.env,
                PLAYWRIGHT_BROWSERS_PATH: '/ms-playwright'
            }
        });

        console.log('🎊 Global Playwright test completed successfully!');

        return { success: true };

    } catch (error) {
        console.error('❌ Global Playwright test failed:', error.message);
        throw error;
    }
}

// Run the test
testWithGlobalPlaywright()
    .then(result => {
        console.log('\n📊 Final Result:', JSON.stringify(result, null, 2));
        process.exit(0);
    })
    .catch(error => {
        console.error('\n💥 Fatal Error:', error.message);
        process.exit(1);
    });